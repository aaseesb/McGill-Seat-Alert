import { createServiceClient } from "@/lib/supabase/server";

// Accounts created before the profile trigger existed have no profile row, which breaks alerts and hides the ntfy topic
export async function ensureProfile(id: string, email?: string) {
  await createServiceClient()
    .from("profiles").upsert({ id, email: email ?? "" }, { onConflict: "id", ignoreDuplicates: true });
}
