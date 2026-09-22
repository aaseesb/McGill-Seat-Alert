import Link from "next/link";
import { redirect } from "next/navigation";
import { unsubscribeByToken } from "@/lib/unsubscribe";

export const metadata = { title: "Unsubscribe · Seat Alert" };

// A GET shows a button instead of unsubscribing, because link scanners open every URL in an email
export default async function Unsubscribe({ searchParams }: { searchParams: Promise<{ token?: string; done?: string }> }) {
  const { token, done } = await searchParams;

  async function confirm() {
    "use server";
    const ok = await unsubscribeByToken(token ?? null);
    redirect(ok ? "/unsubscribe?done=1" : "/unsubscribe?done=0");
  }

  return (
    <div className="card stack" style={{ maxWidth: 480, margin: "0 auto" }}>
      <h1 style={{ fontSize: 28 }}>Unsubscribe</h1>
      {done === "1" ? (
        <p>All your alerts are paused. You can resume them any time from <Link href="/dashboard">My alerts</Link>.</p>
      ) : done === "0" || !token ? (
        <p>That unsubscribe link isn&apos;t valid. <Link href="/dashboard">Sign in</Link> to manage your alerts instead.</p>
      ) : (
        <>
          <p>Pause every seat alert for this email address?</p>
          <form action={confirm}><button className="btn">Pause all alerts</button></form>
        </>
      )}
    </div>
  );
}
