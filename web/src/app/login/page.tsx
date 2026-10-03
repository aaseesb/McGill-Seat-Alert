"use client";

import { useActionState } from "react";
import { sendMagicLink, type LoginState } from "./actions";

export default function Login() {
  const [state, action, pending] = useActionState<LoginState, FormData>(sendMagicLink, {});

  return (
    <div className="card stack" style={{ maxWidth: 440, margin: "0 auto" }}>
      <h1 style={{ fontSize: 28 }}>Sign in</h1>
      {state.ok ? (
        <div className="notice notice-ok">
          Check <strong>{state.email}</strong> for a sign-in link. It can take a minute, and may land in spam.
        </div>
      ) : (
        <form action={action} className="stack">
          <p className="muted">We&apos;ll email you a link to sign in. New here? The same link creates your account.</p>
          <div>
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" autoComplete="email" required defaultValue={state.email} placeholder="you@mail.mcgill.ca" />
          </div>
          {state.error && <div className="notice notice-err">{state.error}</div>}
          <button className="btn" disabled={pending}>{pending ? "Sending…" : "Email me a sign-in link"}</button>
        </form>
      )}
    </div>
  );
}
