"use client";

import { useActionState, useState } from "react";
import { termLabel } from "@/lib/terms";
import type { CourseData } from "@/lib/vsb";
import { addSubscription, type ActionState } from "./actions";

const NOTIFY = [["both", "Email + phone"], ["email", "Email"], ["push", "Phone"]] as const;

export default function AddCourse({ terms }: { terms: string[] }) {
  const [code, setCode] = useState("");
  const [term, setTerm] = useState(terms[1] ?? terms[0]);
  const [course, setCourse] = useState<CourseData | null>(null);
  const [lookupError, setLookupError] = useState("");
  const [looking, setLooking] = useState(false);
  const [state, action, saving] = useActionState<ActionState, FormData>(async (prev, form) => {
    const result = await addSubscription(prev, form);
    if (result.ok) { setCourse(null); setCode(""); }
    return result;
  }, {});

  async function lookup() {
    setLooking(true); setLookupError(""); setCourse(null);
    try {
      const res = await fetch(`/api/course?${new URLSearchParams({ code, term })}`);
      const body = await res.json();
      if (!res.ok) setLookupError(body.error ?? "Lookup failed.");
      else setCourse(body);
    } catch {
      setLookupError("Lookup failed. Check your connection.");
    } finally {
      setLooking(false);
    }
  }

  return (
    <div className="card stack">
      <h2>Watch a course</h2>
      <form
        className="row"
        onSubmit={(e) => { e.preventDefault(); lookup(); }}
      >
        <div className="grow">
          <label htmlFor="code">Course code</label>
          <input id="code" type="text" value={code} onChange={(e) => { setCode(e.target.value); setCourse(null); }} placeholder="COMP 250" required autoCapitalize="characters" />
        </div>
        <div className="grow">
          <label htmlFor="term">Term</label>
          <select id="term" value={term} onChange={(e) => { setTerm(e.target.value); setCourse(null); }}>
            {terms.map((t) => <option key={t} value={t}>{termLabel(t)}</option>)}
          </select>
        </div>
        <button className="btn btn-ghost" disabled={looking || !code.trim()}>{looking ? "Looking up…" : "Find sections"}</button>
      </form>
      {lookupError && <div className="notice notice-err">{lookupError}</div>}

      {course && (
        <form action={action} className="stack">
          <input type="hidden" name="code" value={course.code} />
          <input type="hidden" name="term" value={term} />
          <div>
            <h3>{course.code.replace("-", " ")}{course.title && <span className="muted"> · {course.title}</span>}</h3>
            <p className="muted small">Tick the sections you want, or leave all unticked to be alerted about any section.</p>
            <div className="checks">
              {course.sections.map((s) => (
                <label key={s.crn} className="check">
                  <input type="checkbox" name="crns" value={s.crn} />
                  <span>
                    {s.type} <span className="muted mono">{s.crn}</span><br />
                    {s.seats > 0
                      ? <span className="badge badge-ok">{s.seats} open</span>
                      : <span className="badge badge-full">Full{s.waitlist > 0 ? ` · waitlist ${s.waitlist}` : ""}</span>}
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label>Alert me by</label>
            <div className="radio-row">
              {NOTIFY.map(([v, l]) => (
                <label key={v} className="check"><input type="radio" name="notify" value={v} defaultChecked={v === "both"} />{l}</label>
              ))}
            </div>
          </div>
          <div><button className="btn" disabled={saving}>{saving ? "Saving…" : "Start watching"}</button></div>
        </form>
      )}
      {state.ok && <div className="notice notice-ok">{state.ok}</div>}
      {state.error && <div className="notice notice-err">{state.error}</div>}
    </div>
  );
}
