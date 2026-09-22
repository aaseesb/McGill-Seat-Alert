"use client";

import { useActionState } from "react";
import { sendTestAlert, type ActionState } from "./actions";

export default function TestAlert({ channel, label }: { channel: "email" | "push"; label: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(sendTestAlert, {});
  return (
    <form action={action}>
      <input type="hidden" name="channel" value={channel} />
      <button className="btn btn-ghost btn-small" disabled={pending}>{pending ? "Sending…" : label}</button>
      {state.ok && <p className="small" style={{ color: "var(--ok)", marginTop: 6 }}>{state.ok}</p>}
      {state.error && <p className="small" style={{ color: "var(--accent)", marginTop: 6 }}>{state.error}</p>}
    </form>
  );
}
