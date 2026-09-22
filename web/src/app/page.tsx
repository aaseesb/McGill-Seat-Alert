import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function lastCheck() {
  try {
    const { data } = await createServiceClient()
      .from("checker_runs").select("started_at").order("started_at", { ascending: false }).limit(1).maybeSingle();
    return data?.started_at ? new Date(data.started_at) : null;
  } catch {
    return null;
  }
}

export default async function Home() {
  const last = await lastCheck();
  return (
    <>
      <h1>Get alerted when a seat opens in a full McGill course.</h1>
      <p className="lead">
        Pick a course and the sections you want. When one opens up, you get an email, a phone
        notification, or both. No GitHub, no API keys, no McGill password.
      </p>
      <div className="row" style={{ marginTop: 24 }}>
        <Link href="/login" className="btn">Start watching a course</Link>
        <Link href="/dashboard" className="btn btn-ghost">My alerts</Link>
      </div>
      {last && (
        <p className="muted small" style={{ marginTop: 16 }}>
          Last checked {last.toLocaleString("en-CA", { timeZone: "America/Montreal", dateStyle: "medium", timeStyle: "short" })}.
        </p>
      )}

      <div className="section steps">
        <div className="card">
          <div className="step-num">1</div>
          <h3>Sign in with your email</h3>
          <p className="muted small">We email you a sign-in link. No password.</p>
        </div>
        <div className="card">
          <div className="step-num">2</div>
          <h3>Add a course</h3>
          <p className="muted small">Enter a code like COMP 250, then pick any section or specific CRNs.</p>
        </div>
        <div className="card">
          <div className="step-num">3</div>
          <h3>Register when alerted</h3>
          <p className="muted small">Seats are checked regularly. When one opens, head to Minerva quickly.</p>
        </div>
      </div>

      <div className="section card">
        <h2>Good to know</h2>
        <ul className="muted" style={{ margin: 0, paddingLeft: 20 }}>
          <li>Seats are read from the public Visual Schedule Builder data, the same information you see on VSB.</li>
          <li>You get one alert when a section goes from full to open, not a message every check.</li>
          <li>This site never asks for your Minerva login and can&apos;t register you. You still have to register yourself.</li>
          <li>Popular sections can fill again before the next check, so be quick.</li>
        </ul>
      </div>
    </>
  );
}
