# Biometric Distribution System (Netlify + Firebase)

## Web Interface
- Main UI: `/`
- API health: `/api/health`
- API students: `/api/students`

## Netlify Structure
- `public/` static frontend
- `netlify/functions/api.js` serverless API handler
- `netlify.toml` build + redirect config

## Netlify Settings
This project is organized for direct Netlify deployment:
- Static frontend in `public/`
- Serverless API in `netlify/functions/api.js`
- Redirect from `/api/*` to `/.netlify/functions/api/:splat`

## Folder Layout
- `public/` frontend UI
- `netlify/functions/api.js` API routes (Express + serverless-http)
- `netlify.toml` build + API redirects

## Netlify Build Settings
If you configure these manually in the Netlify UI, use:
- **Base directory:** `.` (repo root)
- **Publish directory:** `public`
- **Functions directory:** `netlify/functions`

`netlify.toml` already contains these values.

## Legacy Compatibility (`yo/`)
A minimal `yo/` mirror exists only for old Netlify sites that still have `Base directory = yo`.
- `yo/public/index.html`
- `yo/netlify/functions/api.js`
- `yo/package.json`

If possible, update your Netlify UI to use root (`.` or empty) and treat `yo/` as fallback only.

> If Netlify still shows `Base directory = yo`, update it to `.` (or clear it) in Site settings.

## Connect Firebase to the web interface
The browser UI should **not** talk directly to Firebase Admin SDK. Instead:
1. Frontend calls the Netlify API (`/api/...`).
2. Netlify function talks to Firebase using server-side service-account credentials.

### 1) Create a Firebase service account key
In Firebase Console:
- Project Settings → **Service accounts** → **Generate new private key**
- Download the JSON file and copy these fields:
  - `project_id`
  - `client_email`
  - `private_key`

> Important: `private_key` must be a real PEM key from that JSON file. Do **not** use a Web API key (`AIza...`) for `FIREBASE_PRIVATE_KEY`.

### 2) Add environment variables in Netlify
Set these in Site Settings → Environment Variables:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_DATABASE_URL`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`

For `FIREBASE_PRIVATE_KEY`, paste the full PEM from the service-account JSON. Either format works:
- multiline value
- single-line escaped value (`\n`), because the API normalizes `\n` to newlines

### 3) Deploy and verify connectivity

### 4) ESP32 -> Firebase -> Web app event flow
Use the API route below when ESP32 + R307 reports a fingerprint scan:

- `POST /api/students/scan`
- body: `{ "fingerprintId": 12 }`
- optional header: `x-device-key: <ESP32_DEVICE_KEY>` (if configured)

Behavior:
- if fingerprint exists: API emits `scan:matched` event, webapp auto-loads profile
- if fingerprint is unknown: API emits `scan:unknown`, webapp opens new profile form for enrollment

Example (from ESP32 firmware or test script):
```bash
curl -X POST https://<your-site>.netlify.app/api/students/scan \
  -H 'Content-Type: application/json' \
  -H 'x-device-key: <ESP32_DEVICE_KEY>' \
  -d '{"fingerprintId":12}'
```

### 5) ESP32 firmware integration (R307 -> Netlify API)
A ready-to-edit Arduino sketch is included at:
- `esp32/esp32_fingerprint_api.ino`

What it does:
- reads fingerprint from R307
- sends matched `fingerprintId` to `POST /api/students/scan`
- handles API responses:
  - `200`: matched student
  - `404`: unknown fingerprint in backend (web app opens enrollment form)

Before uploading to ESP32, set these in the sketch:
- `WIFI_SSID`
- `WIFI_PASSWORD`
- `API_BASE_URL` (example: `https://your-site.netlify.app/api`)
- `DEVICE_KEY` (must match `ESP32_DEVICE_KEY` in Netlify env)

After deploy:
- Open `/api/health` and confirm `firebase.connected: true`
- Or open `/api/firebase/status` and confirm `{ "connected": true }`

If it returns `Invalid PEM formatted message`, your `FIREBASE_PRIVATE_KEY` value is incorrect.

- If API returns `502 Runtime.UserCodeSyntaxError` (example: `Unexpected identifier 'app'`), the deployed function bundle is broken/outdated. Trigger a fresh deploy from the latest commit and verify both root and `yo/` function files are in sync.

## Local Run
```bash
npm install
npm run start
```

Then open the Netlify dev URL and verify:
- Frontend loads `/`
- API health endpoint works at `/api/health`

## Compatibility for Stale Netlify Base Directory
Some Netlify sites still have **Base directory = `yo`** saved in UI settings.
To prevent parse/build failure (`Base directory does not exist: /opt/build/repo/yo`), this repo includes a mirrored fallback app under `yo/`:
- `yo/public/index.html`
- `yo/netlify/functions/api.js`
- `yo/package.json`

You should still update Netlify UI to use **Base directory = `.`** (or empty) for the canonical root deploy.
