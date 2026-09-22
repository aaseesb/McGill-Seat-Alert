# McGill Seat Alert

Watches McGill's Visual Schedule Builder for open seats and alerts you when a
section you want frees up, by email, phone push notification, or both. Runs
for free on GitHub Actions every 10 minutes.

> Fork of [McGill Seat Alert](https://github.com/hanzili/mcgill-seat-alert) by
> [hanzili](https://github.com/hanzili), updated for the current VSB site, with
> per-CRN filtering, email alerts via Resend and push notifications via ntfy.

## Setup

1. **Fork this repository.**

2. **Pick your courses and how to be alerted** in `config.json`:

   ```json
   {
       "courses": [
           { "code": "FACC 300", "crns": ["2678"] },
           { "code": "MATH 140" }
       ],
       "term": "202701",
       "notify": "both"
   }
   ```

   - `code`: the course code as shown on VSB, e.g. `FACC 300`.
   - `crns`: optional. Omit it to be alerted about any section of the course.
   - `term`: year and month, e.g. `202609` (Fall 2026), `202701` (Winter 2027), `202705` (Summer 2027).
   - `notify`: how you want to be alerted:

     | Value | You get | Set up |
     | --- | --- | --- |
     | `"email"` | An email | Step 3 |
     | `"push"` | A phone notification | Step 4 |
     | `"both"` (default) | Both | Steps 3 and 4 |

   You can also override `notify` without editing the file by adding a
   repository **variable** (not a secret) named `ALERT_METHOD` set to
   `email`, `push` or `both`, under Settings → Secrets and variables →
   Actions → Variables.

   Repository secrets for steps 3 and 4 go under Settings → Secrets and
   variables → Actions → New repository secret.

3. **Email** (for `"email"` or `"both"`):

   | Secret | Value |
   | --- | --- |
   | `RESEND_API_KEY` | An API key from [resend.com](https://resend.com) (free tier is fine) |
   | `ALERT_EMAIL` | Where to send alerts. For several people, separate addresses with commas: `me@gmail.com,friend@mail.mcgill.ca` |
   | `RESEND_FROM` | Optional. A sender on a domain you've verified with Resend, e.g. `Seat Alert <alerts@yourdomain.com>` |

   Without a verified domain, Resend's free tier sends from
   `onboarding@resend.dev` and **will only deliver to the email you signed
   up to Resend with**. To alert other people, verify a domain in Resend and
   set `RESEND_FROM`.

4. **Phone push notifications** (for `"push"` or `"both"`) with
   [ntfy](https://ntfy.sh), which is free, open source and needs no account:

   1. Install the ntfy app ([iOS](https://apps.apple.com/app/ntfy/id1625396347) /
      [Android](https://play.google.com/store/apps/details?id=io.heckel.ntfy)).
   2. Tap **+** and subscribe to a topic name that's hard to guess, e.g.
      `mcgill-seats-7fq29xk`. Anyone who knows the name can read it, so don't
      use something obvious.
   3. Add a repository secret `NTFY_TOPIC` with that name. For several people,
      separate topics with commas (or have everyone subscribe to the same one).

   Tapping the notification opens Minerva.

5. **Enable the workflow** in the Actions tab if GitHub hasn't already.

As a backup, if a seat opens but the alert can't be sent (bad key, service
down, secrets missing), the run fails and GitHub emails you about it instead.

## Testing it

In the Actions tab, open **Check Course Availability** → **Run workflow**,
tick **Send a sample alert (email/push) instead of checking seats**, then run it.
It sends a sample alert through whichever method `notify` selects. The step
log shows what happened:

- `Email alerts selected but ALERT_EMAIL is not set` or
  `Push alerts selected but NTFY_TOPIC is not set` means that secret is
  missing or misspelled.
- `401` from Resend means the API key is wrong. Paste a new one over the secret.
- `403` from Resend usually means you're sending to an address it won't
  deliver to without a verified domain (see step 3).
- No push on your phone despite `Push notification sent`: check the topic in
  the app matches `NTFY_TOPIC` exactly, and that ntfy is allowed to send
  notifications.

Leave the box unticked to run a normal seat check on demand.

## Running locally

```bash
python -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python register.py --dry-run     # check seats, log the alert instead of sending it
.venv/bin/python register.py --test-email  # send a sample alert, no scraping
.venv/bin/python register.py               # check seats and alert if one is open
.venv/bin/python register.py --notify push # same, but only send a push this run
```

Export the same values as environment variables in your shell:
`RESEND_API_KEY` and `ALERT_EMAIL` for email, `NTFY_TOPIC` for push.
`--notify email|push|both` overrides `ALERT_METHOD` and `config.json` for one run.
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
