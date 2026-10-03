import { NextResponse, type NextRequest } from "next/server";
import { runCheck } from "@/lib/checker";
import { createServiceClient } from "@/lib/supabase/server";

export const maxDuration = 60;

// Called on a schedule by GitHub Actions or Vercel Cron with `Authorization: Bearer $CRON_SECRET`
async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const summary = await runCheck(createServiceClient());
  return NextResponse.json(summary);
}

export const GET = handle;
export const POST = handle;
