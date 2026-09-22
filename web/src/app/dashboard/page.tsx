import QRCode from "qrcode";
import { redirect } from "next/navigation";
import { createUserClient } from "@/lib/supabase/server";
import { displayCode, termLabel, upcomingTerms } from "@/lib/vsb";
import { deleteAccount, removeSubscription, setActive, setNotify } from "./actions";
import AddCourse from "./AddCourse";
import DeleteAccount from "./DeleteAccount";
import TestAlert from "./TestAlert";

export const metadata = { title: "My alerts · Seat Alert" };

type Sub = {
  id: string; term: string; course_code: string; crns: string[];
  notify: "email" | "push" | "both"; active: boolean; last_alerted_at: string | null;
};
type State = { term: string; course_code: string; crn: string; section_type: string; seats: number; available: boolean; checked_at: string };

const NOTIFY_LABEL = { both: "Email + phone", email: "Email", push: "Phone" } as const;

export default async function Dashboard() {
  const supabase = await createUserClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: subs }] = await Promise.all([
    supabase.from("profiles").select("email, ntfy_topic").eq("id", user.id).single(),
    supabase.from("subscriptions").select("*").order("created_at").returns<Sub[]>(),
  ]);

  const codes = [...new Set((subs ?? []).map((s) => s.course_code))];
  const { data: states } = codes.length
    ? await supabase.from("section_state").select("*").in("course_code", codes).returns<State[]>()
    : { data: [] as State[] };

  const server = (process.env.NTFY_SERVER ?? "https://ntfy.sh").replace(/\/$/, "");
  const topicUrl = profile ? `${server}/${profile.ntfy_topic}` : "";
  const qr = profile ? await QRCode.toDataURL(topicUrl, { margin: 0, width: 264 }) : "";

  return (
    <div className="stack">
      <div className="sub" style={{ alignItems: "baseline" }}>
        <h1 style={{ fontSize: 30 }}>My alerts</h1>
        <form action="/auth/signout" method="post" className="small muted">
          {profile?.email} · <button className="link-btn">Sign out</button>
        </form>
      </div>

      <AddCourse terms={upcomingTerms()} />

      <div className="card">
        <h2>Watching</h2>
        {!subs?.length && <p className="muted">Nothing yet. Add a course above.</p>}
        {subs?.map((s) => {
          const sections = (states ?? []).filter(
            (x) => x.term === s.term && x.course_code === s.course_code && (!s.crns.length || s.crns.includes(x.crn)),
          );
          const checked = sections[0]?.checked_at;
          return (
            <div className="sub" key={s.id}>
              <div style={{ minWidth: 0 }}>
                <h3>
                  {displayCode(s.course_code)} <span className="muted" style={{ fontWeight: 400 }}>· {termLabel(s.term)}</span>
                  {!s.active && <> <span className="badge badge-muted">Paused</span></>}
                </h3>
                <p className="muted small" style={{ margin: 0 }}>
                  {s.crns.length ? `CRN ${s.crns.join(", ")}` : "Any section"} · {NOTIFY_LABEL[s.notify]}
                  {checked && ` · checked ${new Date(checked).toLocaleString("en-CA", { timeZone: "America/Montreal", dateStyle: "short", timeStyle: "short" })}`}
                </p>
                <div className="sections">
                  {sections.length === 0 && <span className="badge badge-muted">Waiting for first check</span>}
                  {sections.map((x) => (
                    <span key={x.crn} className={`badge ${x.available ? "badge-ok" : "badge-full"}`}>
                      {x.section_type} · {x.available ? (x.seats > 0 ? `${x.seats} open` : "waitlist open") : "full"}
                    </span>
                  ))}
                </div>
              </div>
              <div className="sub-actions">
                <form action={setNotify.bind(null, s.id, s.notify === "both" ? "email" : s.notify === "email" ? "push" : "both")}>
                  <button className="btn btn-ghost btn-small" title="Change how you're alerted">
                    Switch to {NOTIFY_LABEL[s.notify === "both" ? "email" : s.notify === "email" ? "push" : "both"]}
                  </button>
                </form>
                <form action={setActive.bind(null, s.id, !s.active)}>
                  <button className="btn btn-ghost btn-small">{s.active ? "Pause" : "Resume"}</button>
                </form>
                <form action={removeSubscription.bind(null, s.id)}>
                  <button className="btn btn-ghost btn-small">Remove</button>
                </form>
              </div>
            </div>
          );
        })}
      </div>

      {profile && (
        <div className="card stack">
          <h2>Phone notifications</h2>
          <div className="ntfy">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="qr" src={qr} alt="QR code for your ntfy topic" />
            <div className="stack">
              <p className="small" style={{ margin: 0 }}>
                1. Install the free <strong>ntfy</strong> app (
                <a href="https://apps.apple.com/app/ntfy/id1625396347">iOS</a> /{" "}
                <a href="https://play.google.com/store/apps/details?id=io.heckel.ntfy">Android</a>).<br />
                2. Tap <strong>+</strong> and subscribe to your private topic, or scan the code:
              </p>
              <code className="topic">{profile.ntfy_topic}</code>
              <p className="muted small" style={{ margin: 0 }}>Keep this name private: anyone who has it can read your alerts.</p>
              <div className="row">
                <TestAlert channel="push" label="Send test to phone" />
                <TestAlert channel="email" label="Send test email" />
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <h2>Delete account</h2>
        <p className="muted small">Removes your email, alerts and notification topic permanently.</p>
        <DeleteAccount action={deleteAccount} />
      </div>
    </div>
  );
}
