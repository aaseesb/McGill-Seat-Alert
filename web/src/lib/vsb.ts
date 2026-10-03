import { XMLParser } from "fast-xml-parser";

const VSB_API = "https://vsb.mcgill.ca/vsb/api/class-data";

export type Section = {
  crn: string;
  type: string;
  seats: number;
  waitlist: number;
};

export type CourseData = {
  code: string;
  title: string;
  sections: Section[];
};

export class CourseNotFound extends Error {}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  isArray: (name) => ["error", "course", "uselection", "selection", "block"].includes(name),
});

// VSB rejects requests without this clock-derived token (its own JS computes it)
function token() {
  const t = Math.floor(Date.now() / 60000) % 1000;
  return { t, e: (t % 3) + (t % 39) + (t % 42) };
}

// "comp 250" / "COMP250" / "comp-250" -> "COMP-250"
export function normalizeCode(input: string): string | null {
  const m = input.trim().toUpperCase().match(/^([A-Z]{3,4})[\s-]*(\d{3}(?:[A-Z]\d?)?)$/);
  return m ? `${m[1]}-${m[2]}` : null;
}

export const displayCode = (code: string) => code.replace("-", " ");

type RawBlock = { key: string; disp?: string; type?: string; os?: string; ws?: string };
type RawCourse = {
  key: string;
  offering?: { title?: string };
  uselection?: { selection?: { block?: RawBlock[] }[] }[];
};

export async function fetchCourse(code: string, term: string): Promise<CourseData> {
  const { t, e } = token();
  const params = new URLSearchParams({
    term, course_0_0: code, rq_0_0: "null", t: String(t), e: String(e), nouser: "1",
  });
  const res = await fetch(`${VSB_API}?${params}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`VSB returned ${res.status} for ${code}`);

  const doc = parser.parse(await res.text()).addcourse;
  const errors: unknown[] = doc?.errors?.error ?? [];
  if (errors.length) throw new CourseNotFound(String(errors[0]));

  const course: RawCourse | undefined = doc?.classdata?.course?.[0];
  if (!course) throw new CourseNotFound(`${displayCode(code)} has no sections this term.`);

  // Each section combination repeats shared blocks (e.g. a tutorial), so dedupe by CRN
  const sections = new Map<string, Section>();
  for (const us of course.uselection ?? [])
    for (const sel of us.selection ?? [])
      for (const b of sel.block ?? [])
        sections.set(b.key, {
          crn: b.key,
          type: b.disp ?? b.type ?? "",
          seats: Number(b.os) || 0,
          waitlist: Number(b.ws) || 0,
        });

  return {
    code,
    title: course.offering?.title ?? "",
    sections: [...sections.values()].sort((a, b) => a.type.localeCompare(b.type)),
  };
}

export function availability(s: Section): string | null {
  if (s.seats > 0) return `Open seats (${s.seats})`;
  if (s.waitlist > 0) return `Waitlist (${s.waitlist})`;
  return null;
}

export { termLabel, upcomingTerms } from "./terms";
