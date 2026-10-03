import { displayCode, termLabel } from "./vsb";

export type Hit = { term: string; code: string; crn: string; type: string; status: string };

const MINERVA = "https://horizon.mcgill.ca/pban1/twbkwbis.P_WWWLogin";
const siteUrl = () => (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function alertSubject(hits: Hit[]) {
  const courses = [...new Set(hits.map((h) => displayCode(h.code)))];
  return `Seat open: ${courses.join(", ")}`;
}

export function alertText(hits: Hit[], unsubscribeToken?: string) {
  const lines = hits.map(
    (h) => `${displayCode(h.code)} ${h.type} (CRN ${h.crn}, ${termLabel(h.term)}): ${h.status}`,
  );
  lines.push("", `Register: ${MINERVA}`);
  if (unsubscribeToken) lines.push(`Stop these alerts: ${siteUrl()}/unsubscribe?token=${unsubscribeToken}`);
  return lines.join("\n");
}

// Inline styles only: mail clients strip <style> blocks
export function alertHtml(hits: Hit[], unsubscribeToken: string) {
  const td = "padding:10px 14px;border-top:1px solid #e5e7eb;";
  const rows = hits
    .map(
      (h) => `<tr>
        <td style="${td}font-weight:600;color:#111827;">${esc(displayCode(h.code))}</td>
        <td style="${td}color:#374151;">${esc(h.type)}</td>
        <td style="${td}color:#374151;font-family:ui-monospace,Menlo,monospace;">${esc(h.crn)}</td>
        <td style="${td}color:#047857;font-weight:600;">${esc(h.status)}</td>
      </tr>`,
    )
    .join("");
  const th = "padding:8px 14px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#6b7280;text-align:left;";
  const terms = [...new Set(hits.map((h) => termLabel(h.term)))].join(", ");
  return `<div style="margin:0;padding:24px 12px;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
    <tr><td style="padding:20px 24px;background:#b91c1c;">
      <div style="color:#fff;font-size:18px;font-weight:700;">A seat just opened</div>
      <div style="color:#fecaca;font-size:13px;margin-top:4px;">${esc(terms)}</div>
    </td></tr>
    <tr><td style="padding:8px 0 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="font-size:14px;border-collapse:collapse;">
        <tr style="background:#f9fafb;"><th style="${th}">Course</th><th style="${th}">Section</th><th style="${th}">CRN</th><th style="${th}">Status</th></tr>
        ${rows}
      </table>
    </td></tr>
    <tr><td style="padding:22px 24px 26px;">
      <a href="${MINERVA}" style="display:inline-block;padding:11px 20px;background:#b91c1c;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">Register on Minerva</a>
      <p style="margin:16px 0 0;color:#6b7280;font-size:12px;line-height:1.5;">
        Seats go fast, so register now. <a href="${siteUrl()}/dashboard" style="color:#6b7280;">Manage alerts</a> &middot;
        <a href="${siteUrl()}/unsubscribe?token=${unsubscribeToken}" style="color:#6b7280;">Unsubscribe from all</a><br>
        Not affiliated with McGill University.
      </p>
    </td></tr>
  </table>
</div>`;
}

export type Email = { to: string; subject: string; html: string; text: string; unsubscribeToken: string };

// Resend's batch endpoint takes up to 100 emails per call
export async function sendEmails(emails: Email[]) {
  if (!emails.length) return;
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not set");
  const from = process.env.RESEND_FROM ?? "Seat Alert <onboarding@resend.dev>";
  for (let i = 0; i < emails.length; i += 100) {
    const res = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(
        emails.slice(i, i + 100).map((e) => ({
          from, to: [e.to], subject: e.subject, html: e.html, text: e.text,
          headers: {
            "List-Unsubscribe": `<${siteUrl()}/api/unsubscribe?token=${e.unsubscribeToken}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        })),
      ),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  }
}

export async function sendPush(topic: string, title: string, message: string) {
  const server = (process.env.NTFY_SERVER ?? "https://ntfy.sh").replace(/\/$/, "");
  const res = await fetch(`${server}/${encodeURIComponent(topic)}`, {
    method: "POST",
    // Header values must be ASCII
    headers: { Title: title.replace(/[^\x20-\x7e]/g, ""), Priority: "high", Tags: "rotating_light", Click: MINERVA },
    body: message,
  });
  if (!res.ok) throw new Error(`ntfy ${res.status}: ${await res.text()}`);
}
