import { createServiceClient } from "./supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Pauses every alert for the profile holding this token; true if the token matched
export async function unsubscribeByToken(token: string | null) {
  if (!token || !UUID.test(token)) return false;
  const db = createServiceClient();
  const { data: profile } = await db.from("profiles").select("id").eq("unsubscribe_token", token).maybeSingle();
  if (!profile) return false;
  await db.from("subscriptions").update({ active: false }).eq("user_id", profile.id);
  return true;
}
