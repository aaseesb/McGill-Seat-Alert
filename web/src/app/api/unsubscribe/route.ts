import { NextResponse, type NextRequest } from "next/server";
import { unsubscribeByToken } from "@/lib/unsubscribe";

// One-click unsubscribe (RFC 8058): mail apps POST here from the List-Unsubscribe header
export async function POST(request: NextRequest) {
  const ok = await unsubscribeByToken(request.nextUrl.searchParams.get("token"));
  return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
}
