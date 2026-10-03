"use server";

import { headers } from "next/headers";
import { createUserClient } from "@/lib/supabase/server";

export type LoginState = { ok?: boolean; error?: string; email?: string };

export async function sendMagicLink(_: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email address.", email };

  const origin = process.env.SITE_URL ?? (await headers()).get("origin") ?? "http://localhost:3000";
  const supabase = await createUserClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin.replace(/\/$/, "")}/auth/callback` },
  });
  if (error) return { error: error.message, email };
  return { ok: true, email };
}
