# McGill Seat Alert

Watches McGill's Visual Schedule Builder for open seats and emails you when a
section you want frees up. Runs for free on GitHub Actions every 10 minutes.

> Fork of [McGill Seat Alert](https://github.com/hanzili/mcgill-seat-alert) by
> [hanzili](https://github.com/hanzili), updated for the current VSB site, with
> per-CRN filtering and email alerts via Resend.

## Setup

1. **Fork this repository.**

2. **Pick your courses** in `config.json`:

   ```json
   {
       "courses": [
           { "code": "FACC 300", "crns": ["2678"] },
           { "code": "MATH 140" }
       ],
       "term": "202701"
   }
   ```

   - `code`: the course code as shown on VSB, e.g. `FACC 300`.
   - `crns`: optional. Omit it to be alerted about any section of the course.
   - `term`: year and month, e.g. `202609` (Fall 2026), `202701` (Winter 2027), `202705` (Summer 2027).

3. **Set up email** under Settings → Secrets and variables → Actions → New repository secret:

   | Secret | Value |
   | --- | --- |
   | `RESEND_API_KEY` | An API key from [resend.com](https://resend.com) (free tier is fine) |
   | `ALERT_EMAIL` | Where to send alerts. For several people, separate addresses with commas: `me@gmail.com,friend@mail.mcgill.ca` |
   | `RESEND_FROM` | Optional. A sender on a domain you've verified with Resend, e.g. `Seat Alert <alerts@yourdomain.com>` |

   Without a verified domain, Resend's free tier sends from
   `onboarding@resend.dev` and **will only deliver to the email you signed
   up to Resend with**. To alert other people, verify a domain in Resend and
   set `RESEND_FROM`.

   Skip this step entirely and you still get notified: the workflow fails on
   purpose when a seat opens, and GitHub emails you about the failed run
   (keep Settings → Notifications → Actions enabled on your account).

4. **Enable the workflow** in the Actions tab if GitHub hasn't already.

## Testing it

In the Actions tab, open **Check Course Availability** → **Run workflow**,
tick **Send a sample alert email instead of checking seats**, then run it.
The step log shows whether Resend accepted the email:

- `ALERT_EMAIL is not set` means the secret is missing or misspelled.
- `401` means the API key is wrong. Paste a new one over the secret.
- `403` usually means you're sending to an address Resend won't deliver to
  without a verified domain (see step 3).

Leave the box unticked to run a normal seat check on demand.

## Running locally

```bash
python -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python register.py --dry-run     # check seats, log the alert instead of sending it
.venv/bin/python register.py --test-email  # send a sample alert, no scraping
.venv/bin/python register.py               # check seats and email if one is open
```

Emailing needs `RESEND_API_KEY` and `ALERT_EMAIL` exported in your shell.
You'll also need Chrome installed.

## How it works

VSB only draws the sections of the one schedule it is currently
considering, so a section can be missing from the page even though it
exists. The script reads each course's section dropdown, then reloads the
page pinned to each combination (`dropdown_<i>_0`) so that every CRN's seat
and waitlist count shows up in the legend.

To check more or less often, edit the cron line in
`.github/workflows/course_check.yml`.

## Disclaimer

For educational purposes only. You're responsible for how you use it,
including compliance with McGill's registration policies.
