# Chatbot setup

## Why there is a PHP file

**Never put your API key in JavaScript.** Anything in a `.js` file, or in the
HTML, is downloaded by every visitor and readable in two clicks via DevTools.
A scraped key gets used until your credits are gone, and the bill is yours.

So the flow is:

```
browser  ──POST──▶  chat-proxy.php  ──POST──▶  AICredits API
(no key)            (holds the key,            
                     on your server)
```

The browser only ever talks to your own domain.

## Steps

### 1. Put the key on the server

Preferred — in `.htaccess` next to `index.html`:

```apache
SetEnv AICREDITS_API_KEY sk-your-real-key-here
```

If your host has no env support, open `chat-proxy.php` and replace
`PASTE_YOUR_KEY_HERE` on the `$API_KEY` line.

Either way: do not commit the key to git.

### 2. Confirm the endpoint and model

At the top of `chat-proxy.php`:

```php
const API_BASE = 'https://api.aicredits.in/v1';
const MODEL    = 'gpt-4o-mini';
```

Two different services go by this name, so check which one your account is on:

| Your account | `API_BASE` |
|---|---|
| aicredits.in (pay in ₹ via UPI, 300+ models) | `https://api.aicredits.in/v1` |
| aicreditsapi.com (DeepSeek-focused) | `https://api.aicreditsapi.com/v1` |

Both are OpenAI-compatible, so only this line changes. Set `MODEL` to any
model your plan allows.

### 3. Lock down who can call it

In `chat-proxy.php`, set `ALLOWED_ORIGINS` to your real domain(s):

```php
const ALLOWED_ORIGINS = [
    'https://tridentpublicschool.com',
    'https://www.tridentpublicschool.com',
];
```

Remove `http://localhost` before going live.

### 4. Upload

Put `chat-proxy.php` in the same folder as `index.html`. Needs PHP 7.4+ with
the cURL extension — standard on virtually all shared hosting.

## Testing locally

The chatbot needs PHP running, so opening `index.html` by double-clicking will
show the widget but every message will return the "could not reach the
assistant" error. That is expected. To test properly, run any PHP host, e.g.:

```bash
php -S localhost:8000
```

Then open `http://localhost:8000`.

## What is already built in

- **Rate limiting** — 20 messages per IP per 5 minutes. Tune
  `RATE_LIMIT_HITS` / `RATE_LIMIT_SECS`.
- **Input caps** — 1500 characters per message, last 20 turns only, so a
  visitor cannot run up your bill with one enormous paste.
- **Server-owned system prompt** — the browser cannot override the assistant's
  instructions or swap the model. Everything the browser sends is rebuilt
  server-side and only `user` / `assistant` roles are accepted.
- **No leaked upstream errors** — provider errors are logged for you and
  replaced with a plain message for the visitor, since upstream errors can
  echo back account details.
- **XSS-safe rendering** — replies are inserted with `textContent`, so model
  output can never become markup in the page.

## Changing what the bot knows

Edit `SYSTEM_PROMPT` in `chat-proxy.php`. It currently holds the school's
affiliation, the four branches with their classes and student counts, the
facilities, the 2025 results, the Principal's details, and office hours.

It is told to refuse to invent fees, dates or marks and to redirect those to
the office phone number — keep that instruction. Update the facts whenever the
site content changes, otherwise the bot will confidently state stale numbers.

## Cost control

Currently set to `max_tokens: 500` and `temperature: 0.3` (factual, not
chatty). The whole system prompt is sent on every message, which is normal but
means each exchange costs roughly the prompt plus the conversation so far.
Trimming `MAX_MESSAGES` lowers cost at the expense of the bot's memory within
a conversation.

---

# Deploying to Vercel

Vercel does **not** run PHP. The same proxy is provided as a serverless
function at `api/chat.js`, which Vercel serves at `/api/chat`. That is what
`chatbot.js` calls by default, so nothing in the front-end needs changing.

`chat-proxy.php` is kept only for shared/cPanel hosting. If you deploy to
Vercel you can delete it — and if you use PHP hosting instead, delete `api/`
and change `ENDPOINT` in `chatbot.js` back to `'chat-proxy.php'`.

## 1. Push the folder to GitHub

```bash
git init
git add .
git commit -m "Trident Public School website"
git branch -M main
git remote add origin https://github.com/<you>/trident-school.git
git push -u origin main
```

`.gitignore` already excludes `.env`, `.htaccess` and `.vercel`, so your key
cannot be committed by accident. Do commit `images/` — those are the site's
photos.

## 2. Import into Vercel

vercel.com → **Add New… → Project** → pick the repo → **Deploy**.

Framework preset: **Other**. There is no build step — it is a static site plus
one function, and `vercel.json` already sets caching and security headers.

## 3. Add the API key as an environment variable

Project → **Settings → Environment Variables**:

| Name | Value | Environments |
|---|---|---|
| `AICREDITS_API_KEY` | your real key | Production, Preview, Development |
| `AICREDITS_API_BASE` | `https://api.aicredits.in/v1` | all (optional) |
| `AICREDITS_MODEL` | `gpt-4o-mini` | all (optional) |

Then **redeploy** — a running deployment does not pick up new variables until
it is rebuilt.

This is the correct place for the key: it lives on Vercel's servers, is
injected into the function at runtime, and is never included in anything sent
to a browser.

## 4. Test it

Open the deployment URL and send a message in the chat. If you get
"The chat service is not configured yet", the env var is missing or the
project was not redeployed after adding it. Check **Deployments → your
deployment → Functions → /api/chat** for the logs.

## Running it locally

```bash
npm i -g vercel
vercel dev
```

`vercel dev` serves the static files and the function together on
`http://localhost:3000`. Add the key to a local `.env` file (already
gitignored):

```
AICREDITS_API_KEY=sk-your-key
```

Opening `index.html` by double-clicking will show the whole site but the chat
will return its fallback error, because nothing is serving `/api/chat`.

## Custom domain

Project → **Settings → Domains** → add `tridentpublicschool.com` and follow
the DNS instructions. HTTPS is issued automatically.
