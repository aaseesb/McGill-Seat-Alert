"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { alertHtml, alertText, sendEmails, sendPush, type Hit } from "@/lib/notify";
import { createServiceClient, createUserClient } from "@/lib/supabase/server";
import { normalizeCode, upcomingTerms } from "@/lib/vsb";

type Notify = "email" | "push" | "both";
export type ActionState = { ok?: string; error?: string };

async function requireUser() {
  const supabase = await createUserClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

const parseNotify = (v: FormDataEntryValue | null): Notify =>
  v === "email" || v === "push" ? v : "both";

export async function addSubscription(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser();
  const code = normalizeCode(String(form.get("code") ?? ""));
  const term = String(form.get("term") ?? "");
  if (!code) return { error: "Use a course code like COMP 250." };
  if (!upcomingTerms().includes(term)) return { error: "Pick a term." };
  const crns = form.getAll("crns").map(String).filter((c) => /^\d{3,6}$/.test(c));

  const { error } = await supabase.from("subscriptions").upsert(
    { user_id: user.id, term, course_code: code, crns, notify: parseNotify(form.get("notify")), active: true, last_alerted_at: null },
    { onConflict: "user_id,term,course_code" },
  );
  if (error) return { error: error.message.includes("at most") ? error.message : "Couldn't save that alert." };
  revalidatePath("/dashboard");
  return { ok: `Watching ${code.replace("-", " ")}.` };
}

export async function setActive(id: string, active: boolean) {
  const { supabase } = await requireUser();
  // Resuming resets the alert state so an already-open section is reported again
  await supabase.from("subscriptions").update(active ? { active, last_alerted_at: null } : { active }).eq("id", id);
  revalidatePath("/dashboard");
}

export async function setNotify(id: string, notify: Notify) {
  const { supabase } = await requireUser();
  await supabase.from("subscriptions").update({ notify: parseNotify(notify) }).eq("id", id);
  revalidatePath("/dashboard");
}

export async function removeSubscription(id: string) {
  const { supabase } = await requireUser();
  await supabase.from("subscriptions").delete().eq("id", id);
  revalidatePath("/dashboard");
}

export async function sendTestAlert(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase
    .from("profiles").select("email, ntfy_topic, unsubscribe_token").eq("id", user.id).single();
  if (!profile) return { error: "Profile not found." };

  const channel = parseNotify(form.get("channel"));
  const hits: Hit[] = [{ term: upcomingTerms()[0], code: "FACC-300", crn: "2678", type: "Lec 002", status: "Open seats (3)" }];
  const subject = "[test] Seat open: FACC 300";
  try {
    if (channel !== "push")
      await sendEmails([{
        to: profile.email, subject, html: alertHtml(hits, profile.unsubscribe_token),
        text: alertText(hits, profile.unsubscribe_token), unsubscribeToken: profile.unsubscribe_token,
      }]);
    if (channel !== "email") await sendPush(profile.ntfy_topic, subject, alertText(hits));
  } catch {
    return { error: "The test alert couldn't be sent. Try again in a bit." };
  }
  return { ok: channel === "push" ? "Sent. Check the ntfy app." : channel === "email" ? "Sent. Check your inbox (and spam)." : "Sent. Check your inbox and the ntfy app." };
}

export async function deleteAccount() {
  const { supabase, user } = await requireUser();
  await createServiceClient().auth.admin.deleteUser(user.id); // cascades to profile and alerts
  await supabase.auth.signOut();
  redirect("/");
}
