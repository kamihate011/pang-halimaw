const express = require("express");
const admin = require("firebase-admin");
const serverless = require("serverless-http");

const app = express();
app.use(express.json());

let firebaseInitError = null;

function getEnv(name) {
  if (typeof Netlify !== "undefined" && Netlify.env && typeof Netlify.env.get === "function") {
    return Netlify.env.get(name);
  }
  return process.env[name];
}

function normalizePrivateKey(rawValue) {
  if (!rawValue) return "";
  return String(rawValue).replace(/^"(.*)"$/, "$1").replace(/\\n/g, "\n").trim();
}

function decodeBase64Key(encoded) {
  if (!encoded) return "";
  try {
    return Buffer.from(encoded, "base64").toString("utf8").trim();
  } catch (_err) {
    return "";
  }
}

function parseServiceAccountJson() {
  const jsonValue =
    getEnv("FIREBASE_SERVICE_ACCOUNT_JSON") ||
    getEnv("FIREBASE_SERVICE_ACCOUNT") ||
    getEnv("GOOGLE_APPLICATION_CREDENTIALS_JSON");

  if (!jsonValue) return null;
  try {
    const parsed = JSON.parse(jsonValue);
    if (parsed && typeof parsed === "object") return parsed;
  } catch (_err) {
    return null;
  }
  return null;
}

function resolveFirebaseCredentials() {
  const serviceAccount = parseServiceAccountJson();
  const projectId = getEnv("FIREBASE_PROJECT_ID") || serviceAccount?.project_id || "";
  const clientEmail =
    getEnv("FIREBASE_CLIENT_EMAIL") ||
    getEnv("GOOGLE_CLIENT_EMAIL") ||
    getEnv("NETLIFY_EMAILS_PROVIDER") ||
    serviceAccount?.client_email ||
    "";

  const privateKey =
    normalizePrivateKey(getEnv("FIREBASE_PRIVATE_KEY")) ||
    normalizePrivateKey(decodeBase64Key(getEnv("FIREBASE_PRIVATE_KEY_BASE64"))) ||
    normalizePrivateKey(serviceAccount?.private_key);

  return { projectId, clientEmail, privateKey };
}

function validateFirebaseCredentials() {
  const credentials = resolveFirebaseCredentials();
  const missing = [];

  if (!credentials.projectId) missing.push("FIREBASE_PROJECT_ID");
  if (!credentials.clientEmail) missing.push("FIREBASE_CLIENT_EMAIL");
  if (!credentials.privateKey) missing.push("FIREBASE_PRIVATE_KEY");

  if (missing.length > 0) {
    return {
      ok: false,
      reason: `Missing required Firebase credentials: ${missing.join(", ")}`,
      credentials,
    };
  }

  if (!credentials.privateKey.includes("BEGIN PRIVATE KEY") || !credentials.privateKey.includes("END PRIVATE KEY")) {
    return {
      ok: false,
      reason: "FIREBASE_PRIVATE_KEY format is invalid. Expected a PEM private key.",
      credentials,
    };
  }

  return { ok: true, credentials };
}

function initializeFirebase() {
  if (admin.apps.length > 0) return true;
  if (firebaseInitError) return false;

  const validation = validateFirebaseCredentials();
  if (!validation.ok) {
    firebaseInitError = validation.reason;
    return false;
  }

  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: validation.credentials.projectId,
        clientEmail: validation.credentials.clientEmail,
        privateKey: validation.credentials.privateKey,
      }),
      databaseURL: getEnv("FIREBASE_DATABASE_URL"),
    });
    return true;
  } catch (err) {
    firebaseInitError = err instanceof Error ? err.message : "Unknown Firebase initialization error";
    return false;
  }
}

app.get("/api/health", (_req, res) => {
  const isReady = initializeFirebase();
  res.status(200).json({
    ok: true,
    backend: "netlify-function",
    firebaseReady: isReady,
    detail: isReady ? "Firebase initialized" : "Firebase is not initialized",
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/students", async (_req, res) => {
  if (!initializeFirebase()) {
    return res.status(500).json({
      message: "Internal server error.",
      detail: firebaseInitError || "Firebase credentials are not configured correctly.",
    });
  }

  try {
    const snapshot = await admin.firestore().collection("students").get();
    const students = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    return res.status(200).json(students);
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Unknown error";
    return res.status(500).json({
      message: "Internal server error.",
      detail: `Failed to fetch students: ${detail}`,
    });
  }
});

app.use("/api/*", (_req, res) => {
  res.status(404).json({ message: "Not found" });
});

module.exports.handler = serverless(app);
