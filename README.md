# Biometric Distribution System (Netlify + Firebase)

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
After deploy:
- Open `/api/health` and confirm `firebase.connected: true`
- Or open `/api/firebase/status` and confirm `{ "connected": true }`

If it returns `Invalid PEM formatted message`, your `FIREBASE_PRIVATE_KEY` value is incorrect.

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
