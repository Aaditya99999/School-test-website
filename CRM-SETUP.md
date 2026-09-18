# Leads CRM setup

The admission enquiry form on the home page and the Contact page saves every
submission as a lead, viewable at `/crm.html`. Two things need to be set up
in the Vercel dashboard before it works — both are one-time, a few minutes
each.

```
enquiry form ──POST──▶  /api/leads  ──▶  Postgres
                                           ▲
/crm.html   ──GET/PATCH/DELETE──▶  /api/leads  (admin key required)
```

## 1. Create a Postgres database

Vercel dashboard → your project → **Storage** tab → **Create Database** →
choose **Postgres** (Neon). Accept the defaults and connect it to this
project. Vercel sets the `POSTGRES_URL` environment variable for you
automatically — nothing to copy by hand.

The `leads` table is created automatically the first time someone submits
the form or opens the CRM, so there is no migration step.

## 2. Set an admin key

Vercel dashboard → your project → **Settings** → **Environment Variables** →
add:

```
CRM_ADMIN_KEY = <a long random password>
```

This is the password `/crm.html` asks for. Anyone who has it can see and
delete every lead, so:

- Make it long and random (a password manager's "generate" button is fine).
- Only share it with staff who need to see enquiries.
- Never put it in any file that gets committed to git.

## 3. Redeploy

Environment variables only take effect on the next deployment — push a
commit, or use **Redeploy** in the Vercel dashboard.

## Using it

Open `yourdomain.com/crm.html`, enter the admin key once (it stays in the
browser tab's session, not saved to disk), and you'll see every enquiry:
name, phone (click to call or open WhatsApp), class/programme, message, and
which page it came from. Change a lead's status (New / Contacted / Enrolled
/ Lost), leave a note, or delete it — changes save immediately.

`/crm.html` is excluded from search engines (`noindex`) but is not otherwise
hidden — the admin key is what protects it, so keep that key private.
