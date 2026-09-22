# McGill Seat Alert

An automated tool to check course availability at McGill University and send notifications when courses become available.

> This project is a fork of the original [McGill Seat Alert](https://github.com/hanzili/mcgill-seat-alert) by [hanzili](https://github.com/hanzili), with modifications to support:
> - Optional filtering for specific CRNs
> - Updated for the current McGill VSB course selection page

## Description

This script automatically checks the availability of courses at McGill University.
It supports:
- Monitoring multiple courses in a single page load
- Optional filtering for specific CRNs per course
- Notifications when sections have open seats

This script automatically checks the availability of specified courses at McGill University using GitHub Actions. When a course becomes available, it emails you.

### Automation via GitHub Actions
- The workflow runs automatically every 10 minutes to monitor course availability.
- This acts as a lightweight CI/CD process, letting you receive notifications without manually running the script.

## Setup

1. Fork this repository to your GitHub account.

2. Choose how you want to be notified (all email, no Pushover):
   - **Nothing to set up (default):** the script exits with a failure when a seat
     opens, and GitHub emails you about the failed workflow run. Make sure
     GitHub > Settings > Notifications > Actions has email notifications enabled.
   - **Resend (recommended — a real formatted email):** create a free account at
     https://resend.com, make an API key under *API Keys*, and add the repository
     secrets `RESEND_API_KEY` and `ALERT_EMAIL`. The free tier sends from
     `onboarding@resend.dev` with no domain setup; if you verify your own domain,
     set `RESEND_FROM` (e.g. `Seat Alert <alerts@yourdomain.com>`) as well.
     Check it works with `python register.py --test-email`.
   - **Any SMTP mailbox (e.g. Gmail app password):** add the repository secrets
     `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` and `ALERT_EMAIL`.

3. Set up GitHub Secrets (only for the Resend/SMTP options):
   - Go to your forked repository on GitHub
   - Navigate to Settings > Secrets and variables > Actions
   - Add the secrets listed above for your chosen option

4. Configure courses:
   - Edit the `config.json` file in the repository:
     ```json
     {
         "courses": [
              { "code": "COURSE-1", "crns": ["CRN1", "CRN2"] },
              { "code": "COURSE-2" }
           ],
         "term": "YYYYMM"
     }
     ```
   - Replace `"COURSE-1"`, `"COURSE-2"` with the courses you want to check
   - CRNs are optional per course. If omitted, all sections of that course are monitored
   - Set the `"term"` to the desired semester (e.g., "202409" for Fall 2024, "202601" for Winter 2026)

5. Enable GitHub Actions:
   - Go to the "Actions" tab in your forked repository
   - You should see the "Check Course Availability" workflow
   - Enable the workflow if it's not already enabled

## Usage

Once set up, the GitHub Action will run automatically every 10 minutes to check course availability. You can also manually trigger the workflow:

1. Go to the "Actions" tab in your repository
2. Select the "Check Course Availability" workflow
3. Click "Run workflow"

You will be emailed when any of your specified sections become available.

Run it locally too:

```bash
python register.py --dry-run          # log the alert instead of sending it
python register.py                    # send the alert if a seat is open
python register.py --test-email       # send a sample alert, no scraping
```

With Resend, set the two variables in the same shell first:

```bash
export RESEND_API_KEY=re_xxxxxxxx
export ALERT_EMAIL=you@example.com
```

### How it works

VSB only renders the sections belonging to the schedule it is currently
considering, so a section can be missing from the page even though it exists.
The script reads each course's section dropdown, then reloads the page pinned to
each section combination (`dropdown_<i>_0`) so every CRN's seat and waitlist
count is read directly from the legend.

## Customization

- To change the check frequency, edit the cron schedule in `.github/workflows/course_check.yml`
- To modify the script behavior, edit `register.py`

## Disclaimer

This tool is for educational purposes only. The user is responsible for any consequences of using this script, including potential violations of McGill University's registration policies.
