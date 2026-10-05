# Putting the website on Hostinger

Everything you upload is in **`hostinger-upload.zip`** (the same files are in
the `hostinger/` folder). Enquiries from the admission form go into a
**Google Sheet**, and that sheet is your list of leads.

```
enquiry form ──▶ api/leads.php (Hostinger) ──▶ Google Apps Script ──▶ Google Sheet
chatbot      ──▶ chat-proxy.php (Hostinger) ──▶ AICredits API
```

You will set three things up, in this order:

1. The Google Sheet (about 10 minutes)
2. Upload the website to Hostinger (about 5 minutes)
3. Fill in `config.php` on Hostinger (about 2 minutes)

---

## 1. Create the Google Sheet

1. Go to [sheets.new](https://sheets.new) while signed in to the school's
   Google account. Name it, e.g. **RKMEC Admission Enquiries**.
2. Open **Extensions → Apps Script**.
3. Delete everything in the editor. Paste in all of
   [`google-sheet-leads.gs`](google-sheet-leads.gs) from this repo.
4. Make up a **secret**: a long random password, e.g. 30+ letters and
   numbers from a password generator. Replace
   `PASTE_THE_SAME_SECRET_AS_IN_CONFIG_PHP` on the `var SECRET =` line
   with it. Keep it somewhere safe, because you need it again in step 3.
5. Click **💾 Save**.
6. Click **Deploy → New deployment**. Next to "Select type", click the ⚙️
   gear and choose **Web app**. Then set:
   - **Execute as:** Me
   - **Who has access:** Anyone
7. Click **Deploy**. Google asks you to **Authorize access**. Pick your
   account. If you see "Google hasn't verified this app", click
   **Advanced → Go to (project name) → Allow**. This is your own script,
   so it is safe.
8. Copy the **Web app URL**. It ends in `/exec`, and you need it in step 3.

The **Leads** tab is created by itself when the first enquiry arrives. It
has the columns Date, Name, Phone, Class, Message, Page, **Status** (a
dropdown: New / Contacted / Enrolled / Lost) and **Note**. Staff update
Status and Note right in the sheet. Share the sheet only with staff who
need it.

> If you edit the script later, use **Deploy → Manage deployments →
> ✏️ Edit → Version: New version → Deploy**, so the URL stays the same.

---

## 2. Upload the website

1. Download **`hostinger-upload.zip`** from GitHub. Open the file, then click
   **Download raw file**.
2. Log in to [hPanel](https://hpanel.hostinger.com). Go to **Websites**,
   find your domain and click **Manage**. Then open **Files → File
   Manager**.
3. Open the **`public_html`** folder. Delete the default `default.php` or
   `index.php` if there is one.
4. Upload `hostinger-upload.zip` into `public_html`. Right-click it and
   choose **Extract**. Extract it **into `public_html` itself**, not into a
   new folder. Then delete the zip.
5. Check that `index.html`, `config.php`, `.htaccess` and the `images` and
   `api` folders are now directly inside `public_html`.
   (`.htaccess` starts with a dot, so File Manager may hide it. That's fine.)
6. In hPanel, go to **Security → SSL**. Install the free SSL, and turn on
   **Force HTTPS**.

---

## 3. Fill in `config.php` (on Hostinger only)

In File Manager, right-click `public_html/config.php` and choose **Edit**:

| Setting | What to put |
|---|---|
| `site_domain` | Your domain, without `https://` or `www`, e.g. `'rkmec.in'` |
| `sheet_url` | The Web app URL from step 1.8 (ends in `/exec`) |
| `sheet_secret` | The same secret you put in the Apps Script in step 1.4 |
| `ai_api_key` | Your AICredits key, for the chatbot. Leave it `''` to keep the chatbot off |
| `ai_api_base` | `https://api.aicredits.in/v1`, or `https://api.aicreditsapi.com/v1` if your account is on aicreditsapi.com |

Click **Save**.

⚠️ **Only ever type the real secret and API key on Hostinger.** Never put
them in the copy of `config.php` on GitHub. Visitors can't read
`config.php`: it shows nothing in a browser, and `.htaccess` blocks it.

---

## 4. Test it

1. Open your domain. Click through the pages and check that the photos load.
2. Fill in the admission enquiry form with a test name. WhatsApp opens,
   and within a few seconds a new row appears in the **Leads** tab of the
   sheet.
3. Open the chatbot and ask a question (if you set the AI key).

If no row appears, check that `sheet_url` and `sheet_secret` in
`config.php` are right. The secret must match the Apps Script exactly.
Also check that the Apps Script deployment's access is **Anyone**.

---

## Updating the website later

After changing the site on GitHub, rebuild the upload files:

```bash
./make-hostinger.sh                 # or: ./make-hostinger.sh www.your-domain.com
```

This refreshes `hostinger/` and `hostinger-upload.zip`. Passing your domain
also puts it into the page links, the sitemap and `config.php`.

When you upload again, **don't overwrite `config.php` on Hostinger**.
Otherwise your secret and API key are replaced with blanks. Either delete
`config.php` from the zip before uploading, or upload just the files that
changed.
