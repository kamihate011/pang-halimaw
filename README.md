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



## Web Interface
- Web interface: `/`
- API health: `/api/health`
- API students: `/api/students`
