const express = require('express');
const serverless = require('serverless-http');
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');

const app = express();
app.use(express.json());

function getFirebaseApp() {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  const {
    FIREBASE_PROJECT_ID,
    FIREBASE_CLIENT_EMAIL,
    FIREBASE_PRIVATE_KEY,
    FIREBASE_DATABASE_URL
  } = process.env;

  if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY || !FIREBASE_DATABASE_URL) {
    return null;
  }

  return initializeApp({
    credential: cert({
      projectId: FIREBASE_PROJECT_ID,
      clientEmail: FIREBASE_CLIENT_EMAIL,
      privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    }),
    databaseURL: FIREBASE_DATABASE_URL
  });
}

async function checkFirebaseConnection() {
  const firebaseApp = getFirebaseApp();

  if (!firebaseApp) {
    return {
      connected: false,
      reason: 'missing_firebase_env'
    };
  }

  try {
    const db = getDatabase(firebaseApp);
    await db.ref('__connection_check__').limitToFirst(1).get();

    return {
      connected: true
    };
  } catch (error) {
    return {
      connected: false,
      reason: error.message
    };
  }
}

app.get('/health', async (_req, res) => {
  const firebase = await checkFirebaseConnection();

  res.json({
    status: 'ok',
    service: 'api',
    firebase,
    timestamp: new Date().toISOString()
  });
});

app.get('/firebase/status', async (_req, res) => {
  const firebase = await checkFirebaseConnection();
  res.json(firebase);
});

// Placeholder route so frontend/API wiring can be validated immediately.
app.get('/students', (_req, res) => {
  res.json([]);
});

module.exports.handler = serverless(app);
