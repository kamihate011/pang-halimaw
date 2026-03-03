# Biometric Distribution System (Netlify + Firebase)

This project is now organized for direct Netlify deployment:
- Static frontend in `public/`
- Serverless API in `netlify/functions/api.js`
- Database: **Firebase Firestore** via `firebase-admin`

## Folder Layout
- `public/` frontend UI (fingerprint session + admin mode)
- `netlify/functions/api.js` API routes
- `netlify.toml` build + API redirects
- `firmware/` ESP32 sketch

## Required Netlify Environment Variables
Set these in Netlify Site Settings -> Environment Variables:

- `ADMIN_PASSWORD`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_DATABASE_URL` (optional, recommended)
- `FIREBASE_CLIENT_EMAIL` (falls back to `NETLIFY_EMAILS_PROVIDER`)
- `FIREBASE_PRIVATE_KEY`
- `FIREBASE_PRIVATE_KEY_BASE64` (optional alternative to `FIREBASE_PRIVATE_KEY`)

Example private key format:
```env
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

Important: this must be the full Firebase service-account private key. API keys (for example values that start with `AIza`) will fail authentication.

## API Base
Frontend calls `/api/*`, Netlify redirects to `/.netlify/functions/api/*`.

## Core Endpoints
- `GET /api/health`
- `GET /api/students`
- `GET /api/students/events?since=<ISO_DATE>`
- `POST /api/students/scan`
- `POST /api/students/profile-confirm`
- `PUT /api/students/:id/distribution`
- `POST /api/students/admin/verify`
- `POST /api/students` (admin)
- `PUT /api/students/:id` (admin)
- `DELETE /api/students/:id` (admin)

## Deploy to Netlify
1. Push this folder to a Git repo.
2. Import repo in Netlify.
3. Build settings:
   - Publish directory: `public`
   - Functions directory: `netlify/functions`
4. Add environment variables listed above.
5. Deploy.

## Local Netlify Dev
```bash
npm install
npx netlify dev
```

App should open at the Netlify dev URL and API should work through `/api/...`.
