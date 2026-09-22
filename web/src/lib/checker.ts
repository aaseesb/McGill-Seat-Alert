import type { SupabaseClient } from "@supabase/supabase-js";
import { alertHtml, alertSubject, alertText, sendEmails, sendPush, type Email, type Hit } from "./notify";
import { availability, CourseNotFound, fetchCourse, type Section } from "./vsb";

type Sub = {
  id: string;
  term: string;
  course_code: string;
  crns: string[];
  notify: "email" | "push" | "both";
  last_alerted_at: string | null;
  profiles: { email: string; ntfy_topic: string; unsubscribe_token: string };
};

const key = (term: string, code: string) => `${term}|${code}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// One pass: fetch each distinct (term, course) once, then alert every subscriber whose
// watched section just opened (or is open on their first check).
export async function runCheck(db: SupabaseClient) {
  const errors: string[] = [];

  const { data: subs, error } = await db
    .from("subscriptions")
    .select("id, term, course_code, crns, notify, last_alerted_at, profiles!inner(email, ntfy_topic, unsubscribe_token)")
    .eq("active", true)
    .returns<Sub[]>();
  if (error) throw error;

  const courses = new Map<string, { term: string; code: string }>();
  for (const s of subs) courses.set(key(s.term, s.course_code), { term: s.term, code: s.course_code });

  // Sequential with a pause: a gentle, predictable load on VSB
  const fetched = new Map<string, Section[]>();
  for (const [k, { term, code }] of courses) {
    try {
      fetched.set(k, (await fetchCourse(code, term)).sections);
    } catch (e) {
      errors.push(`${code} ${term}: ${e instanceof Error ? e.message : e}`);
      if (!(e instanceof CourseNotFound)) await sleep(2000);
    }
    await sleep(400);
  }

  // What each section looked like on the previous run
  const wasOpen = new Set<string>();
  const terms = [...new Set([...courses.values()].map((c) => c.term))];
  if (terms.length) {
    const { data: prev, error: prevErr } = await db
      .from("section_state")
      .select("term, course_code, crn, available")
      .in("term", terms)
      .eq("available", true);
    if (prevErr) throw prevErr;
    for (const p of prev) wasOpen.add(`${key(p.term, p.course_code)}|${p.crn}`);
  }

  // Group hits by person so someone watching three courses gets one message
  const perUser = new Map<string, { profile: Sub["profiles"]; email: boolean; push: boolean; hits: Hit[]; subIds: string[] }>();
  for (const s of subs) {
    const sections = fetched.get(key(s.term, s.course_code));
    if (!sections) continue;
    const firstCheck = s.last_alerted_at === null;
    const hits: Hit[] = [];
    for (const sec of sections) {
      if (s.crns.length && !s.crns.includes(sec.crn)) continue;
      const status = availability(sec);
      if (!status) continue;
      const justOpened = !wasOpen.has(`${key(s.term, s.course_code)}|${sec.crn}`);
      if (justOpened || firstCheck)
        hits.push({ term: s.term, code: s.course_code, crn: sec.crn, type: sec.type, status });
    }
    if (!hits.length) continue;

    const entry = perUser.get(s.profiles.email) ?? { profile: s.profiles, email: false, push: false, hits: [], subIds: [] };
    entry.email ||= s.notify !== "push";
    entry.push ||= s.notify !== "email";
    entry.hits.push(...hits);
    entry.subIds.push(s.id);
    perUser.set(s.profiles.email, entry);
  }

  const emails: Email[] = [];
  const alerted: string[] = [];
  for (const u of perUser.values()) {
    const subject = alertSubject(u.hits);
    if (u.email)
      emails.push({
        to: u.profile.email, subject,
        html: alertHtml(u.hits, u.profile.unsubscribe_token),
        text: alertText(u.hits, u.profile.unsubscribe_token),
        unsubscribeToken: u.profile.unsubscribe_token,
      });
    if (u.push) {
      try {
        await sendPush(u.profile.ntfy_topic, subject, alertText(u.hits));
      } catch (e) {
        errors.push(`push: ${e instanceof Error ? e.message : e}`);
      }
    }
    alerted.push(...u.subIds);
  }
  try {
    await sendEmails(emails);
  } catch (e) {
    errors.push(`email: ${e instanceof Error ? e.message : e}`);
  }

  const now = new Date().toISOString();
  const rows = [...fetched].flatMap(([k, sections]) => {
    const [term, course_code] = k.split("|");
    return sections.map((s) => ({
      term, course_code, crn: s.crn, section_type: s.type,
      seats: s.seats, waitlist: s.waitlist, available: availability(s) !== null, checked_at: now,
    }));
  });
  if (rows.length) {
    const { error: upErr } = await db.from("section_state").upsert(rows);
    if (upErr) errors.push(`section_state: ${upErr.message}`);
  }
  if (alerted.length) {
    const { error: subErr } = await db.from("subscriptions").update({ last_alerted_at: now }).in("id", alerted);
    if (subErr) errors.push(`subscriptions: ${subErr.message}`);
  }

  const summary = { courses_checked: fetched.size, alerts_sent: perUser.size, errors };
  await db.from("checker_runs").insert(summary);
  return summary;
}
