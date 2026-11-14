# Daily devotional email (free)

The reading stays on the website if you never do these steps. The signup form stays hidden until the two blanks in `js/devotional-email-config.js` are filled in. The daily send stays quiet until three GitHub secrets are set. Nothing here needs a credit card.

This uses [Brevo’s free plan](https://www.brevo.com). Brevo keeps the list and sends the email. The Bible site does not add Brevo’s tracking script, and it does not sell addresses.

The Clay Jar Translation site may use this same Brevo account. Give it a **different list**. A person who only asked for the Treasure Bible should not get the Translation email, and the other way around.

You can do this on an iPhone, in Safari. Have a password manager ready. The API key is shown only once.

## 1. Open a free Brevo account

1. In Safari, go to [https://www.brevo.com](https://www.brevo.com) and create an account. Choose the **free** plan.
2. Do not enter a card. If a screen pushes a paid plan, look for Free or Skip.
3. Brevo may text you a code to prove the account is real. That code is for Brevo. It is not part of this Bible site.
4. Open the confirmation email and finish signing in.

## 2. Make a list just for this Bible

1. In Brevo, open **Contacts**, then **Lists**.
2. Create a list. Name it `Treasure Bible devotional`.
3. Leave the Translation list alone if you already made one. Do not reuse it.
4. Open the new list. The address bar has a number, often after `list/` or `id=`. That number is the list id. Write it down. Example: `12`.

## 3. Turn on a sender address

Brevo will only send from an address it has checked.

1. Find **Senders** (sometimes under the account menu, SMTP & API, or Settings).
2. Add the From address you want readers to see. A normal email is enough. You do not need to buy a domain.
3. Open the message Brevo sends and tap the confirmation link.
4. Write that exact address down. It is the sender email.

Replies can go to [contact.clayjar@protonmail.com](mailto:contact.clayjar@protonmail.com). If Brevo asks for a reply address and will only accept a checked sender, use the same From address you just confirmed.

## 4. Make the signup form (double opt-in)

1. Open **Contacts**, then **Forms** (Signup forms).
2. Create a form. Choose the list `Treasure Bible devotional`. Do not choose the Translation list.
3. Turn on **double opt-in** (a confirmation email). A person is added only after they tap that message. The free default message is enough. You do not need a paid template.
4. The email field should stay named `EMAIL`. That is Brevo’s usual name. Do not rename it.
5. Save the form. Brevo shows a block of code, or a form address.
6. Copy only the `https://` address from `action="..."`. It looks like `https://something.sibforms.com/serve/` followed by a long code. That is the form action.
7. Do not copy Brevo’s JavaScript. This site posts a plain form and does not load Brevo’s tracker.

## 5. Paste the form address into the site

Still in Safari:

1. Open [js/devotional-email-config.js](https://github.com/clayjartranslation/treasure/blob/main/js/devotional-email-config.js).
2. Tap the pencil to edit this repo. If GitHub offers to fork it, cancel. You are editing `clayjartranslation/treasure`.
3. Put the form address between the quotes after `formAction`.
4. Put the list number between the quotes after `listId`. Example: `listId: '12'`.
5. Leave every other line as it is.
6. Commit the change to `main`.

Until both quotes are filled with a real `https://` address and a number, the form on the devotional page stays hidden, and the home page does not show “Get it by email.”

## 6. Create the API key

1. In Brevo, open **SMTP & API**, then **API keys**.
2. Generate a new key. Name it `treasure-devotional`.
3. Copy the key immediately and keep it in your password manager. Brevo will not show it again. If you lose it, generate another.
4. Do not put this key in `devotional-email-config.js` or in an email.

## 7. Add three secrets on GitHub

1. Open [github.com/clayjartranslation/treasure](https://github.com/clayjartranslation/treasure) while signed in as an owner.
2. Tap **Settings**. On a phone, the gear may be under the menu (the three lines).
3. Tap **Secrets and variables**, then **Actions**.
4. Tap **New repository secret** three times. The names must match exactly:

| Name | Value |
| --- | --- |
| `BREVO_API_KEY` | The key from step 6 |
| `BREVO_LIST_ID` | The same list number as `listId` in the config file |
| `BREVO_SENDER_EMAIL` | The sender address you confirmed in step 3 |

The form, `listId`, and `BREVO_LIST_ID` must all point at `Treasure Bible devotional`, not at a Translation list.

## 8. Try a dry run

1. On the repo, tap **Actions**.
2. Open **Daily devotional email**.
3. Tap **Run workflow**. Leave **Print counts and a sample email and do not send** on. Tap **Run workflow** again.
4. Open the run and read the log. You should see a count of contacts in each time zone, today’s title, the verse, the reflection, the prayer, the copyright line, and an unsubscribe link. Nothing is sent.

A live run (the print switch off) still emails only people whose local time is in the 4 AM hour. To send a one-off copy to yourself, use the **test email** box. That does not email the list.

## What the daily send does

GitHub starts a job at the top of every hour. The script emails only confirmed subscribers whose local time is in the 4 AM hour and who have not already received that local date’s reading. The reading itself is the one for the reader’s local date. If a time zone is missing or invalid, America/New_York is used.

The signup form posts a hidden `TIMEZONE` field. If the hosted Brevo form has no matching `TIMEZONE` attribute field, Brevo may ignore that value, and those readers are emailed at 4:00 Eastern until the time zone is stored. The send job creates the `TIMEZONE` and `LAST_DEVO_DATE` attributes if they are missing.

Unsubscribed or blocklisted addresses are skipped. Each email has an unsubscribe link to this site’s unsubscribe page, and Brevo adds a List-Unsubscribe header so Gmail, Yahoo, and Outlook can show their own Unsubscribe control. After a successful send, the job stores `LAST_DEVO_DATE` on the contact so a rerun never double-sends.

The email has the title, the date, the verse copied from `data/devotionals.json`, the reflection, the prayer, a link to that day’s page, the line `Devotionals © 2026 Jose Santiago. All rights reserved.`, and the unsubscribe link.

If there is no reading for that month and day, nothing is sent. If the three secrets are missing, the job ends normally and does not fail. A failure means the secrets are set and Brevo refused the send (for example the sender is not confirmed yet). Open the Actions log and read the message. If the log says the API key is not authorized for Contacts, edit or replace the key in Brevo so it can manage contacts. The job needs that to read time zones and to record who already received today’s reading.

Brevo’s free plan sends a limited number of emails a day (about 300). That is enough for this list. Do not add a card.

In Brevo’s campaign settings, leave Google Analytics / link tracking off if you see that switch. This site does not use ads or tracking.

Readers who want their address removed can use the unsubscribe link, or write to [contact.clayjar@protonmail.com](mailto:contact.clayjar@protonmail.com).
