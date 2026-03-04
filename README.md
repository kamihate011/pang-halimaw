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

## Local Run
```bash
npm install
npm run start
```
