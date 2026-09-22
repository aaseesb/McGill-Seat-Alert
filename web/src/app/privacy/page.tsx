export const metadata = { title: "Privacy · Seat Alert" };

export default function Privacy() {
  return (
    <div className="stack">
      <h1>Privacy</h1>
      <p>This site stores only what it needs to send you alerts:</p>
      <ul>
        <li>Your email address, used to sign you in and send alerts.</li>
        <li>The courses, terms and CRNs you choose to watch.</li>
        <li>A random notification topic for the ntfy app, if you use phone alerts.</li>
      </ul>
      <p>
        It never asks for your McGill or Minerva credentials. Your data isn&apos;t sold or shared. Email
        is sent through Resend and phone notifications through ntfy.sh, which see only the alert itself.
      </p>
      <p>
        You can pause or remove any alert, or delete your account and everything stored about you, from
        the <a href="/dashboard">My alerts</a> page. Every alert email has a one-click unsubscribe link.
      </p>
      <p className="muted small">Not affiliated with McGill University.</p>
    </div>
  );
}
