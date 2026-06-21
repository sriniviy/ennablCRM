# Ennabl CRM — Gmail Add-on Deployment

## What this is

A Google Workspace Add-on that runs natively inside Gmail (web + mobile).
When composing an email, it automatically detects recipients who are Ennabl CRM
contacts and injects a BCC tracking address so the email is logged.

---

## How to deploy (one-time setup, ~10 minutes)

### Step 1 — Create a Google Apps Script project

1. Go to script.google.com → **New project**
2. Name it `Ennabl CRM Add-on`
3. Delete the default `Code.gs` content

### Step 2 — Copy the add-on files

**`appsscript.json`** — set this as the project manifest:
- In the editor: View → Show manifest file
- Paste the contents of `appsscript.json` into the manifest

**`Code.gs`** — paste into the main `Code.gs` file

**`Settings.gs`** — create a new file (+ button → Script), name it `Settings`, paste content

### Step 3 — Add your CRM domain to the allowlist

In `appsscript.json`, the `urlFetchWhitelist` must include your CRM API URL.
If deploying locally with ngrok, add the ngrok URL during testing (e.g., `https://abc123.ngrok.io/`).

For production, change to your real domain (e.g., `https://crm.ennabl.com/`).

Update `appsscript.json` and add:
```json
"urlFetchWhitelist": ["https://your-crm-url/"]
```

### Step 4 — Deploy as a private add-on

1. In Apps Script editor: **Deploy → New deployment**
2. Type: **Add-on**
3. Description: `Ennabl CRM Gmail Add-on v1`
4. Click **Deploy**
5. Copy the **Deployment ID**

### Step 5 — Install for yourself (testing)

1. In Apps Script: **Deploy → Test deployments**
2. Click **Install** → **Done**
3. Open Gmail — the Ennabl CRM icon appears in the right sidebar

### Step 6 — Configure in Gmail

1. Open the Ennabl CRM sidebar in Gmail
2. Click **Open Settings**
3. Enter:
   - **CRM API URL**: `http://localhost:4000/api` (local) or `https://crm.ennabl.com/api` (prod)
   - **API Token**: your token from CRM Settings → Account (or generate one)
4. Click **Save**

### Step 7 — Test

1. Compose a new email to `bob@techflow.io` (a CRM contact)
2. Ennabl CRM sidebar shows: "✓ Logging to CRM — Bob Martinez · TechFlow"
3. BCC field is auto-populated with `{contactId}@mail.ennabl.com`
4. Send the email → run the test script to verify the inbound parse endpoint captures it

---

## Install for the whole team (admin)

1. Go to Google Workspace Admin Console → Apps → Google Workspace Marketplace apps
2. Select **Add app from private Workspace Marketplace listing** (or use the deployment ID)
3. Push the add-on to all users in your org

No Chrome extension, no manual BCC, no individual OAuth setup needed — everyone gets it automatically.

---

## Local testing note

During local development, the add-on needs to reach `http://localhost:4000`.
Google Apps Script cannot call `localhost` directly — use ngrok:

```bash
ngrok http 4000
# Use the https URL as your CRM API URL in Settings
```

Set the ngrok URL in both the add-on Settings AND `urlFetchWhitelist` in `appsscript.json`.
