const SEASONS: Record<string, string> = { "01": "Winter", "05": "Summer", "09": "Fall" };

export function termLabel(term: string) {
  const season = SEASONS[term.slice(4)];
  return season ? `${season} ${term.slice(0, 4)}` : term;
}

// The current term plus the next two, e.g. in Sep 2026: Fall 2026, Winter 2027, Summer 2027
export function upcomingTerms(now = new Date()) {
  const starts = [1, 5, 9];
  let year = now.getFullYear();
  let idx = [...starts].reverse().findIndex((m) => now.getMonth() + 1 >= m);
  idx = idx === -1 ? 0 : starts.length - 1 - idx;
  const terms: string[] = [];
  for (let i = 0; i < 3; i++) {
    terms.push(`${year}${String(starts[idx]).padStart(2, "0")}`);
    if (++idx === starts.length) { idx = 0; year++; }
  }
  return terms;
}
