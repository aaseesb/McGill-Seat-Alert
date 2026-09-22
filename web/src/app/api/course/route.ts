import { NextResponse, type NextRequest } from "next/server";
import { createUserClient } from "@/lib/supabase/server";
import { CourseNotFound, fetchCourse, normalizeCode, upcomingTerms } from "@/lib/vsb";

// Section list for the "add course" form; signed-in users only so it isn't an open VSB proxy
export async function GET(request: NextRequest) {
  const supabase = await createUserClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const code = normalizeCode(request.nextUrl.searchParams.get("code") ?? "");
  const term = request.nextUrl.searchParams.get("term") ?? "";
  if (!code) return NextResponse.json({ error: "Use a course code like COMP 250." }, { status: 400 });
  if (!upcomingTerms().includes(term)) return NextResponse.json({ error: "Pick a term." }, { status: 400 });

  try {
    return NextResponse.json(await fetchCourse(code, term));
  } catch (e) {
    if (e instanceof CourseNotFound)
      return NextResponse.json({ error: `${code.replace("-", " ")} isn't offered in that term.` }, { status: 404 });
    return NextResponse.json({ error: "Couldn't reach the Visual Schedule Builder. Try again." }, { status: 502 });
  }
}
