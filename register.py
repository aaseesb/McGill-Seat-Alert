from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException
from tenacity import retry, stop_after_attempt, wait_fixed
import os
import re
import sys
import smtplib
import requests
import json
import argparse
import logging
import traceback
from email.message import EmailMessage

# Use environment variables for credentials
RESEND_API_KEY = os.environ.get('RESEND_API_KEY')
RESEND_FROM = os.environ.get('RESEND_FROM', 'Seat Alert <onboarding@resend.dev>')
EMAIL = os.environ.get('ALERT_EMAIL')

# Optional SMTP fallback (e.g. Gmail with an app password)
SMTP_HOST = os.environ.get('SMTP_HOST')
SMTP_PORT = int(os.environ.get('SMTP_PORT', '587'))
SMTP_USER = os.environ.get('SMTP_USER')
SMTP_PASSWORD = os.environ.get('SMTP_PASSWORD')

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


@retry(stop=stop_after_attempt(3), wait=wait_fixed(2))
def load_webpage(driver, url):
    # Load webpage with retry mechanism in case of failure
    driver.get(url)
    WebDriverWait(driver, 40).until(
        EC.presence_of_element_located((By.CLASS_NAME, "course_box"))
    )
    logging.info(f"Webpage loaded successfully: {url}")


def send_email(recipient, subject, body):
    # Prefer Resend when configured, otherwise fall back to plain SMTP
    if RESEND_API_KEY:
        return _send_email_resend(recipient, subject, body)
    if SMTP_HOST and SMTP_USER and SMTP_PASSWORD:
        return _send_email_smtp(recipient, subject, body)
    logging.warning("No email provider configured (set RESEND_API_KEY or SMTP_*); skipping email.")
    return False


def _send_email_resend(recipient, subject, body):
    try:
        response = requests.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {RESEND_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "from": RESEND_FROM,
                "to": [recipient],
                "subject": subject,
                "html": body,
            },
            timeout=30,
        )
        response.raise_for_status()
        logging.info(f"Email sent successfully to {recipient}")
        return True
    except requests.exceptions.RequestException as e:
        detail = getattr(e.response, 'text', '') if getattr(e, 'response', None) is not None else ''
        logging.error(f"Failed to send email to {recipient}: {e} {detail}")
        return False


def _send_email_smtp(recipient, subject, body):
    try:
        msg = EmailMessage()
        msg["From"] = os.environ.get('SMTP_FROM', SMTP_USER)
        msg["To"] = recipient
        msg["Subject"] = subject
        msg.set_content(re.sub(r'<[^>]+>', '', body))
        msg.add_alternative(body, subtype='html')

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=30) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.send_message(msg)
        logging.info(f"Email sent successfully to {recipient} via SMTP")
        return True
    except Exception as e:
        logging.error(f"Failed to send email to {recipient} via SMTP: {e}")
        return False


def build_url(courses, term, page="results", dropdowns=None):
    # Build a VSB URL holding every course; `dropdowns` pins a specific
    # section combination per course index (see get_section_options)
    term = term.replace(' ', '-')
    base = (
        f"https://vsb.mcgill.ca/vsb/criteria.jsp?"
        f"access=0&lang=en&tip=1&page={page}&scratch=0&advice=0&legend=1"
        f"&term={term}&sort=none&filters=iiiiiiiiii"
        "&bbs=&ds=&cams=DISTANCE_DOWNTOWN_MACDONALD_OFF-CAMPUS"
        "&locs=any&isrts=any&ses=any&pl=&pac=1"
    )

    for i, course in enumerate(courses):
        base += f"&course_{i}_0={course['code']}"
        if dropdowns and dropdowns.get(i):
            base += f"&dropdown_{i}_0={dropdowns[i]}"

    return base


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


def _read_options(select):
    options = []
    for option in select.find_elements(By.TAG_NAME, "option"):
        value = option.get_attribute("value") or ""
        if value.startswith("us_"):
            options.append((value, re.findall(r'\d{4,}', value)))
    return options


def get_section_options(driver, course):
    # VSB only renders the sections of the schedule it is currently considering.
    # Each course has a dropdown listing every section combination, e.g.
    # value="us_--202701_2678-2679-" -> "Lec 002 - Tut 003 or Lec 006 - Tut 003".
    # Reloading with dropdown_<i>_0 set forces that combination into the legend.
    # The first dropdown on the page belongs to a hidden template, so the
    # dropdown is located through the course's own code cell.
    for cell in driver.find_elements(By.CLASS_NAME, "cbox-cn"):
        code = re.sub(r'\s+', '-', cell.text.strip().upper())
        if code != course["code"]:
            continue
        try:
            row = cell.find_element(By.XPATH, "ancestor::table[contains(@class,'cbox-expand-region')][1]")
            select = row.find_element(By.CSS_SELECTOR, "select.cbox-dropdown")
        except NoSuchElementException:
            continue
        options = _read_options(select)
        if options:
            return options

    logging.warning(f"No section dropdown found for {course['display']}")
    return []


def parse_course_box(driver, course):
    # Read every section currently rendered in the legend for this course
    sections = {}
    for box in driver.find_elements(By.CLASS_NAME, "course_box"):
        try:
            title = box.find_element(By.CLASS_NAME, "course_title").text.strip()
        except NoSuchElementException:
            continue
        if title.upper() != course["display"]:
            continue

        for cell in box.find_elements(By.CSS_SELECTOR, "td"):
            try:
                section_type = cell.find_element(By.CLASS_NAME, "type_block").text.strip()
                crn = cell.find_element(By.CLASS_NAME, "crn_value").text.strip()
            except NoSuchElementException:
                continue

            seats = None
            for cls in ("seatText", "fullText"):
                try:
                    seats = cell.find_element(By.CSS_SELECTOR, f"span.nowrap span.{cls}").text.strip()
                    break
                except NoSuchElementException:
                    continue

            waitlist = None
            try:
                waitlist_text = cell.find_element(By.CLASS_NAME, "legend_waitlist").text.strip()
                waitlist = waitlist_text.split(":", 1)[-1].strip()
            except NoSuchElementException:
                pass

            sections[crn] = {"type": section_type, "seats": seats, "waitlist": waitlist}

    return sections


def get_course_sections(driver, courses, course_index, term):
    # Walk every section combination for one course and collect seat status per CRN
    course = courses[course_index]
    target_crns = course["crns"]

    options = get_section_options(driver, course)
    if not options:
        logging.warning(f"No sections listed for {course['display']}; is the code or term wrong?")
        return {}

    if target_crns:
        wanted = [opt for opt in options if any(c in opt[1] for c in target_crns)]
        if not wanted:
            logging.warning(
                f"CRN(s) {target_crns} not found in the section list for {course['display']}; checking all sections."
            )
            wanted = options
    else:
        wanted = options

    sections = {}
    for value, _ in wanted:
        url = build_url(courses, term, dropdowns={course_index: value})
        load_webpage(driver, url)
        found = parse_course_box(driver, course)
        logging.info(f"{course['display']} [{value}] -> {found}")
        sections.update(found)

        if target_crns and all(c in sections for c in target_crns):
            break

    if target_crns:
        sections = {crn: info for crn, info in sections.items() if crn in target_crns}

    return sections


def is_available(info):
    # A section counts as available if it has open seats or an open waitlist
    seats = (info.get("seats") or "").strip()
    waitlist = (info.get("waitlist") or "").strip()

    if seats and seats.lower() != "full" and seats != "0":
        return "Open seats ({})".format(seats)
    if waitlist and waitlist.lower() not in ("none", "full", "0"):
        return "Waitlist ({})".format(waitlist)
    return None


def setup_driver():
    # Configure and initialize Chrome WebDriver
    chrome_options = Options()
    chrome_options.add_argument('--headless=new')
    chrome_options.add_argument('--no-sandbox')
    chrome_options.add_argument('--disable-dev-shm-usage')
    chrome_options.add_argument('--window-size=1280,2000')

    driver = webdriver.Chrome(options=chrome_options)
    driver.set_page_load_timeout(90)
    return driver


def build_email_body(available_courses, term):
    body = [
        "<h2>Course Availability Alert</h2>",
        f"<p>The following sections are available for term {term}:</p>",
        "<ul>",
    ]
    for code, sections in available_courses.items():
        body.append(f"<li><strong>{code}</strong><ul>")
        for crn, section_type, availability in sections:
            body.append(f"<li>{section_type} &mdash; CRN {crn}: {availability}</li>")
        body.append("</ul></li>")
    body.append("</ul>")
    body.append('<p><a href="https://horizon.mcgill.ca">Register on Minerva</a></p>')
    return "".join(body)


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


def perform_web_task(config_path, dry_run=False, fail_on_available=False):
    logging.info("Starting web task...")

    config = get_config(config_path)
    if not config:
        return 2

    courses = normalize_courses(config.get('courses', []))
    term = str(config.get('term', '202701'))

    if not courses:
        logging.info("No courses to check. Exiting.")
        return 0

    logging.info(f"Checking availability for: {[c['display'] for c in courses]} (term {term})")

    driver = setup_driver()
    available_courses = {}

    try:
        # One load to read the section dropdowns for every course
        load_webpage(driver, build_url(courses, term))

        for i, course in enumerate(courses):
            sections = get_course_sections(driver, courses, i, term)
            if not sections:
                logging.warning(f"No section data found for {course['display']}")
                continue

            hits = []
            for crn, info in sections.items():
                availability = is_available(info)
                status = availability or "Full (waitlist: {})".format(info.get("waitlist") or "n/a")
                logging.info(f"{course['display']} {info['type']} CRN {crn}: {status}")
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
            write_github_summary(f"## 🎉 {subject}\n\n{body}")

            if dry_run:
                logging.info(f"[dry-run] Subject: {subject}")
                logging.info(f"[dry-run] Body: {body}")
            elif EMAIL:
                send_email(EMAIL, subject, body)
            else:
                logging.warning("ALERT_EMAIL is not set; no email sent.")

            if fail_on_available:
                # Non-zero exit makes GitHub Actions email you about the run
                return 1
        else:
            logging.info("No courses are currently available.")
            write_github_summary("No sections available on this check.")

        logging.info("All courses have been checked for availability.")
        return 0
    except Exception as e:
        logging.error(f"An error occurred during web task: {e}")
        logging.debug("Traceback:\n%s", traceback.format_exc())
        return 2
    finally:
        driver.quit()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Check course availability at McGill')
    parser.add_argument('--config', default='config.json', help='Path to the configuration file')
    parser.add_argument('--dry-run', action='store_true', help='Log the alert instead of sending it')
    parser.add_argument('--fail-on-available', action='store_true',
                        help='Exit 1 when a seat opens (GitHub Actions then emails you about the failed run)')
    args = parser.parse_args()

    sys.exit(perform_web_task(args.config, args.dry_run, args.fail_on_available))
