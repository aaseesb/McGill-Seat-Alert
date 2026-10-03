from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential
import os
import re
import sys
import requests
import json
import argparse
import logging
import time
import traceback
import xml.etree.ElementTree as ET

# Use environment variables for credentials
RESEND_API_KEY = os.environ.get('RESEND_API_KEY')
RESEND_FROM = os.environ.get('RESEND_FROM') or 'Seat Alert <onboarding@resend.dev>'
# One or more addresses, separated by commas
EMAILS = [e.strip() for e in (os.environ.get('ALERT_EMAIL') or '').split(',') if e.strip()]
# Push notifications via ntfy (free, no account): one or more topics, comma-separated
NTFY_TOPICS = [t.strip() for t in (os.environ.get('NTFY_TOPIC') or '').split(',') if t.strip()]
NTFY_SERVER = (os.environ.get('NTFY_SERVER') or 'https://ntfy.sh').rstrip('/')
NTFY_TOKEN = os.environ.get('NTFY_TOKEN')

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')


def get_config(path):
    # Load configuration from JSON file
    try:
        with open(path, 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        logging.error(f"Config file not found: {path}")
        return None
    except json.JSONDecodeError:
        logging.error(f"Error reading config file: {path}")
        return None


def send_email(recipients, subject, html, text):
    # One Resend batch request sends a separate email to each recipient,
    # so nobody sees the other addresses
    if not RESEND_API_KEY:
        logging.warning("RESEND_API_KEY is not set; skipping email.")
        return False
    try:
        response = requests.post(
            "https://api.resend.com/emails/batch",
            headers={"Authorization": f"Bearer {RESEND_API_KEY}"},
            json=[
                {"from": RESEND_FROM, "to": [r], "subject": subject, "html": html, "text": text}
                for r in recipients
            ],
            timeout=30,
        )
        response.raise_for_status()
        logging.info(f"Email sent via Resend to {len(recipients)} recipient(s)")
        return True
    except requests.exceptions.RequestException as e:
        detail = e.response.text if e.response is not None else ''
        logging.error(f"Failed to send email: {e} {detail}")
        return False


def send_push(topics, title, message):
    # ntfy delivers to every phone subscribed to the topic in the ntfy app
    headers = {
        "Title": title.encode('utf-8'),
        "Priority": "high",
        "Tags": "rotating_light",
        "Click": "https://horizon.mcgill.ca/pban1/twbkwbis.P_WWWLogin",
    }
    if NTFY_TOKEN:
        headers["Authorization"] = f"Bearer {NTFY_TOKEN}"
    ok = True
    for topic in topics:
        try:
            response = requests.post(f"{NTFY_SERVER}/{topic}", data=message.encode('utf-8'),
                                     headers=headers, timeout=30)
            response.raise_for_status()
            logging.info(f"Push notification sent to ntfy topic '{topic}'")
        except requests.exceptions.RequestException as e:
            detail = e.response.text if e.response is not None else ''
            logging.error(f"Failed to send push to '{topic}': {e} {detail}")
            ok = False
    return ok


def build_push_text(available_courses):
    return "\n".join(
        f"{code} {section_type} (CRN {crn}): {availability}"
        for code, sections in available_courses.items()
        for crn, section_type, availability in sections
    )


NOTIFY_CHOICES = ('email', 'push', 'both')


def resolve_notify(cli_value, config):
    # Precedence: --notify flag, then ALERT_METHOD env var, then "notify" in config.json
    value = (cli_value or os.environ.get('ALERT_METHOD') or (config or {}).get('notify') or 'both')
    value = str(value).strip().lower()
    if value not in NOTIFY_CHOICES:
        logging.warning(f"Unknown notify option '{value}'; using 'both'.")
        value = 'both'
    return value in ('email', 'both'), value in ('push', 'both')


def send_alerts(notify, subject, html, text, push_text):
    use_email, use_push = notify
    sent_any, ok = False, True
    if use_email:
        if EMAILS:
            ok = send_email(EMAILS, subject, html, text) and ok
            sent_any = True
        else:
            logging.warning("Email alerts selected but ALERT_EMAIL is not set.")
    if use_push:
        if NTFY_TOPICS:
            ok = send_push(NTFY_TOPICS, subject, push_text) and ok
            sent_any = True
        else:
            logging.warning("Push alerts selected but NTFY_TOPIC is not set.")
    if not sent_any:
        logging.warning("No alert was sent.")
    return sent_any and ok


def normalize_courses(raw_courses):
    normalized = []

    for course in raw_courses:
        if isinstance(course, str):
            course = {"code": course}

        if not isinstance(course, dict) or not course.get("code"):
            logging.warning(f"Skipping malformed course entry: {course}")
            continue

        # VSB expects the dash form, e.g. FACC-300
        code = re.sub(r'\s+', '-', course["code"].strip().upper())
        crns = course.get("crns")
        normalized.append({
            "code": code,
            "display": code.replace('-', ' '),
            "crns": [str(c).strip() for c in crns] if crns else None,
        })

    return normalized


VSB_API = "https://vsb.mcgill.ca/vsb/api/class-data"


def vsb_token():
    # VSB rejects requests without this clock-derived token (its own JS computes it)
    t = int(time.time() / 60) % 1000
    return t, t % 3 + t % 39 + t % 42


# Retry only network trouble (not LookupError) and re-raise the original error when out of tries
@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=5, max=30),
       retry=retry_if_exception_type(requests.RequestException), reraise=True)
def fetch_sections(code, term):
    # Every section of one course in one request: {crn: {type, seats, waitlist}}
    t, e = vsb_token()
    response = requests.get(VSB_API, params={
        "term": term, "course_0_0": code, "rq_0_0": "null", "t": t, "e": e, "nouser": 1,
    }, timeout=30)
    response.raise_for_status()
    root = ET.fromstring(response.text)
    errors = [err.text for err in root.iter("error") if err.text]
    if errors:
        raise LookupError("; ".join(errors))
    sections = {}
    for block in root.iter("block"):
        sections[block.get("key")] = {
            "type": block.get("disp") or block.get("type"),
            "seats": int(block.get("os") or 0),
            "waitlist": int(block.get("ws") or 0),
        }
    return sections


def is_available(info):
    # A section counts as available if it has open seats or open waitlist spots
    if info["seats"] > 0:
        return "Open seats ({})".format(info["seats"])
    if info["waitlist"] > 0:
        return "Waitlist ({})".format(info["waitlist"])
    return None


TERM_NAMES = {'01': 'Winter', '05': 'Summer', '09': 'Fall'}


def term_label(term):
    term = str(term)
    season = TERM_NAMES.get(term[4:6])
    return f"{season} {term[:4]}" if season else term


def build_email_body(available_courses, term):
    # Inline styles only: mail clients strip <style> blocks and external CSS
    rows = []
    for code, sections in available_courses.items():
        for crn, section_type, availability in sections:
            rows.append(
                '<tr>'
                '<td style="padding:10px 14px;border-top:1px solid #e5e7eb;font-weight:600;color:#111827;">'
                f'{code}</td>'
                '<td style="padding:10px 14px;border-top:1px solid #e5e7eb;color:#374151;">'
                f'{section_type}</td>'
                '<td style="padding:10px 14px;border-top:1px solid #e5e7eb;color:#374151;'
                f'font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">{crn}</td>'
                '<td style="padding:10px 14px;border-top:1px solid #e5e7eb;color:#047857;font-weight:600;">'
                f'{availability}</td>'
                '</tr>'
            )

    return f"""\
<div style="margin:0;padding:24px 12px;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
    <tr>
      <td style="padding:20px 24px;background:#b91c1c;">
        <div style="color:#ffffff;font-size:18px;font-weight:700;">A seat just opened</div>
        <div style="color:#fecaca;font-size:13px;margin-top:4px;">McGill &middot; {term_label(term)}</div>
      </td>
    </tr>
    <tr>
      <td style="padding:8px 0 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="font-size:14px;border-collapse:collapse;">
          <tr style="background:#f9fafb;">
            <th align="left" style="padding:8px 14px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#6b7280;">Course</th>
            <th align="left" style="padding:8px 14px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#6b7280;">Section</th>
            <th align="left" style="padding:8px 14px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#6b7280;">CRN</th>
            <th align="left" style="padding:8px 14px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#6b7280;">Status</th>
          </tr>
          {''.join(rows)}
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:22px 24px 26px;">
        <a href="https://horizon.mcgill.ca" style="display:inline-block;padding:11px 20px;background:#b91c1c;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">Register on Minerva</a>
        <p style="margin:16px 0 0;color:#6b7280;font-size:12px;line-height:1.5;">
          Seats go fast &mdash; register now. Sent by your McGill seat alert.
        </p>
      </td>
    </tr>
  </table>
</div>"""


def build_email_text(available_courses, term):
    lines = [f"A seat just opened - McGill {term_label(term)}", ""]
    for code, sections in available_courses.items():
        for crn, section_type, availability in sections:
            lines.append(f"  {code}  {section_type}  CRN {crn}  ->  {availability}")
    lines += ["", "Register: https://horizon.mcgill.ca/pban1/twbkwbis.P_WWWLogin"]
    return "\n".join(lines)


def write_github_summary(text):
    # GitHub Actions emails you about failed runs; the summary shows what happened
    summary = os.environ.get('GITHUB_STEP_SUMMARY')
    if not summary:
        return
    try:
        with open(summary, 'a') as f:
            f.write(text + "\n")
    except OSError as e:
        logging.warning(f"Could not write job summary: {e}")


def perform_web_task(config_path, dry_run=False, fail_on_available=False, notify_flag=None):
    logging.info("Starting web task...")

    config = get_config(config_path)
    if not config:
        return 2

    notify = resolve_notify(notify_flag, config)
    courses = normalize_courses(config.get('courses', []))
    term = str(config.get('term', '202701'))

    if not courses:
        logging.info("No courses to check. Exiting.")
        return 0

    logging.info(f"Checking availability for: {[c['display'] for c in courses]} (term {term})")

    available_courses = {}
    unreachable = []

    try:
        for course in courses:
            try:
                sections = fetch_sections(course['code'], term)
            except LookupError as e:
                logging.warning(f"{course['display']}: {e}")
                continue
            except requests.RequestException as e:
                # VSB is down or slow; skip it so the next hourly run tries again
                logging.warning(f"{course['display']}: VSB unreachable ({type(e).__name__}: {e})")
                unreachable.append(course['display'])
                continue
            if course['crns']:
                missing = [c for c in course['crns'] if c not in sections]
                if missing:
                    logging.warning(f"CRN(s) {missing} not found for {course['display']}")
                sections = {crn: info for crn, info in sections.items() if crn in course['crns']}

            hits = []
            for crn, info in sections.items():
                availability = is_available(info)
                logging.info(f"{course['display']} {info['type']} CRN {crn}: {availability or 'Full'}")
                if availability:
                    hits.append((crn, info["type"], availability))

            if hits:
                available_courses[course['display']] = hits

        if available_courses:
            num_sections = sum(len(s) for s in available_courses.values())
            subject = "{} section(s) available: {}".format(
                num_sections, ", ".join(available_courses)
            )
            body = build_email_body(available_courses, term)
            text = build_email_text(available_courses, term)
            write_github_summary(f"## 🎉 {subject}\n\n{body}")

            if dry_run:
                logging.info(f"[dry-run] Subject: {subject}")
                logging.info(f"[dry-run] Body:\n{text}")
                delivered = True
            else:
                delivered = send_alerts(notify, subject, body, text, build_push_text(available_courses))

            if fail_on_available and not delivered:
                # Backup: a failed run makes GitHub email you when the alert couldn't be sent
                return 1
        elif unreachable:
            logging.warning(f"Could not reach VSB for: {unreachable}; will retry next run.")
            write_github_summary(f"⚠️ VSB was unreachable for {', '.join(unreachable)}; skipped this check.")
        else:
            logging.info("No courses are currently available.")
            write_github_summary("No sections available on this check.")

        logging.info("All courses have been checked for availability.")
        return 0
    except Exception as e:
        logging.error(f"An error occurred during web task: {e}")
        logging.debug("Traceback:\n%s", traceback.format_exc())
        return 2


def send_test_email(config_path, notify_flag=None):
    # Verify the chosen alert channels work without waiting for a real seat opening
    notify = resolve_notify(notify_flag, get_config(config_path))
    sample = {"FACC 300": [("2678", "Lec 002", "Open seats (3)")]}
    ok = send_alerts(
        notify,
        "[test] 1 section(s) available: FACC 300",
        build_email_body(sample, "202701"),
        build_email_text(sample, "202701"),
        build_push_text(sample),
    )
    if ok:
        where = [w for w, on in zip(("your inbox (and spam)", "the ntfy app"), notify) if on]
        logging.info(f"Test alert sent — check {' and '.join(where)}.")
    return 0 if ok else 2


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Check course availability at McGill')
    parser.add_argument('--config', default='config.json', help='Path to the configuration file')
    parser.add_argument('--dry-run', action='store_true', help='Log the alert instead of sending it')
    parser.add_argument('--fail-on-available', action='store_true',
                        help='Exit 1 when a seat opens but the alert could not be sent (GitHub then emails you about the failed run)')
    parser.add_argument('--test-email', action='store_true',
                        help='Send a sample alert to ALERT_EMAIL / NTFY_TOPIC and exit (no scraping)')
    parser.add_argument('--notify', choices=NOTIFY_CHOICES,
                        help='How to alert: email, push, or both (overrides ALERT_METHOD and config.json)')
    args = parser.parse_args()

    if args.test_email:
        sys.exit(send_test_email(args.config, args.notify))

    sys.exit(perform_web_task(args.config, args.dry_run, args.fail_on_available, args.notify))
