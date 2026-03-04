const express = require('express');
const serverless = require('serverless-http');
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');

const app = express();
app.use(express.json());

// Netlify may pass one of several path variants depending on rewrite/base config.
// Normalize all of them so Express routes like `/health` consistently match.
app.use((req, _res, next) => {
  req.url = req.url
    .replace(/^\/\.netlify\/functions\/api/, '')
    .replace(/^\/api/, '') || '/';
  next();
});

app.get('/health', (_req, res) => {
function getFirebaseApp() {
  if (getApps().length > 0) return getApps()[0];

  const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, FIREBASE_DATABASE_URL } = process.env;
  if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY || !FIREBASE_DATABASE_URL) return null;
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
}

function getDbOrThrow() {
  const firebaseApp = getFirebaseApp();
  if (!firebaseApp) {
    const error = new Error('Firebase environment is not configured.');
    error.statusCode = 503;
    throw error;
  }
  return getDatabase(firebaseApp);
}

function normalizeStudentInput(input = {}) {
  const gradeLevelRaw = String(input.gradeLevel || '').trim();
  const normalizedGrade = gradeLevelRaw && !gradeLevelRaw.startsWith('Grade ') ? `Grade ${gradeLevelRaw}` : gradeLevelRaw;

  return {
    fingerprintId: Number(input.fingerprintId),
    lrn: String(input.lrn || '').trim(),
    fullName: String(input.fullName || '').trim(),
    gender: String(input.gender || '').trim(),
    gradeLevel: normalizedGrade,
    strand: String(input.strand || '').trim(),
    section: String(input.section || '').trim(),
    assignedSupplies: Array.isArray(input.assignedSupplies)
      ? input.assignedSupplies.map((item) => String(item).trim()).filter(Boolean)
      : []
  };
}

function validateStudentInput(student) {
  if (!Number.isFinite(student.fingerprintId) || student.fingerprintId <= 0) return 'fingerprintId must be a positive number.';
  if (!student.lrn) return 'lrn is required.';
  if (!student.fullName) return 'fullName is required.';
  if (!student.gender) return 'gender is required.';
  if (!student.gradeLevel) return 'gradeLevel is required.';
  if (!student.section) return 'section is required.';
  return null;
}

async function getStudentById(db, studentId) {
  const snap = await db.ref(`students/${studentId}`).get();
  if (!snap.exists()) return null;
  return { _id: studentId, ...snap.val() };
}

async function getStudentByFingerprintId(db, fingerprintId) {
  const idSnap = await db.ref(`fingerprintIndex/${fingerprintId}`).get();
  if (!idSnap.exists()) return null;
  return getStudentById(db, String(idSnap.val()));
}

async function writeStudent(db, studentId, data) {
  await db.ref(`students/${studentId}`).set(data);
  await db.ref(`fingerprintIndex/${data.fingerprintId}`).set(studentId);
  return { _id: studentId, ...data };
}

async function emitEvent(db, type, payload) {
  const createdAt = new Date().toISOString();
  await db.ref('events').push({ type, payload, createdAt });
}

function verifyAdmin(req, res, next) {
  const expected = process.env.ADMIN_PASSWORD || '';
  if (!expected) return res.status(500).json({ message: 'ADMIN_PASSWORD is not configured.' });

  const provided = req.get('x-admin-password') || '';
  if (provided !== expected) return res.status(401).json({ message: 'Invalid admin password.' });
  return next();
}

function verifyDevice(req, res, next) {
  const expected = process.env.ESP32_DEVICE_KEY || '';
  if (!expected) return next();

  const provided = req.get('x-device-key') || '';
  if (provided !== expected) return res.status(401).json({ message: 'Invalid device key.' });
  return next();
}

async function checkFirebaseConnection() {
  try {
    const db = getDbOrThrow();
    await db.ref('__connection_check__').limitToFirst(1).get();
    return { connected: true };
  } catch (error) {
    return { connected: false, reason: error.message };
  }
}

app.get('/health', async (_req, res) => {
  const firebase = await checkFirebaseConnection();
  res.json({ status: 'ok', service: 'api', firebase, timestamp: new Date().toISOString() });
});

app.get('/firebase/status', async (_req, res) => {
  const firebase = await checkFirebaseConnection();
  res.json(firebase);
});

app.post('/students/admin/verify', (req, res) => {
  const expected = process.env.ADMIN_PASSWORD || '';
  if (!expected) return res.status(500).json({ message: 'ADMIN_PASSWORD is not configured.' });

  if ((req.body?.password || '') !== expected) {
    return res.status(401).json({ message: 'Invalid admin password.' });
  }

  return res.json({ ok: true });
});

app.get('/students', async (_req, res) => {
  try {
    const db = getDbOrThrow();
    const snap = await db.ref('students').get();
    const value = snap.val() || {};
    const list = Object.entries(value).map(([id, student]) => ({ _id: id, ...student }));
    res.json(list);
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message });
  }
});

app.get('/students/events', async (req, res) => {
  try {
    const db = getDbOrThrow();
    const since = String(req.query.since || '');

    let query = db.ref('events').orderByChild('createdAt');
    if (since) query = query.startAt(since);

    const snap = await query.limitToLast(200).get();
    const value = snap.val() || {};
    const events = Object.values(value)
      .filter((event) => !since || event.createdAt > since)
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));

    res.json(events);
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message });
  }
});

app.post('/students/scan', verifyDevice, async (req, res) => {
  try {
    const fingerprintId = Number(req.body?.fingerprintId);
    if (!Number.isFinite(fingerprintId) || fingerprintId <= 0) {
      return res.status(400).json({ message: 'fingerprintId must be a positive number.' });
    }

    const db = getDbOrThrow();
    const student = await getStudentByFingerprintId(db, fingerprintId);

    if (!student) {
      const payload = { fingerprintId };
      await emitEvent(db, 'scan:unknown', payload);
      return res.status(404).json({ matched: false, fingerprintId });
    }

    await emitEvent(db, 'scan:matched', student);
    return res.json({ matched: true, student });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
});

app.post('/students/profile-confirm', async (req, res) => {
  try {
    const db = getDbOrThrow();
    const normalized = normalizeStudentInput(req.body);
    const validationError = validateStudentInput(normalized);
    if (validationError) return res.status(400).json({ message: validationError });

    const now = new Date().toISOString();
    const existing = await getStudentByFingerprintId(db, normalized.fingerprintId);

    if (existing) {
      const updated = {
        ...existing,
        ...normalized,
        distributionStatus: 'DISTRIBUTED',
        updatedAt: now
      };
      const saved = await writeStudent(db, existing._id, updated);
      await emitEvent(db, 'student:updated', saved);
      return res.json(saved);
    }

    const studentId = db.ref('students').push().key;
    const created = {
      ...normalized,
      distributionStatus: 'DISTRIBUTED',
      createdAt: now,
      updatedAt: now
    };
    const saved = await writeStudent(db, studentId, created);
    await emitEvent(db, 'student:created', saved);
    return res.status(201).json(saved);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
});

app.post('/students', verifyAdmin, async (req, res) => {
  try {
    const db = getDbOrThrow();
    const normalized = normalizeStudentInput(req.body);
    const validationError = validateStudentInput(normalized);
    if (validationError) return res.status(400).json({ message: validationError });

    const existing = await getStudentByFingerprintId(db, normalized.fingerprintId);
    if (existing) return res.status(409).json({ message: 'fingerprintId already exists.' });

    const now = new Date().toISOString();
    const studentId = db.ref('students').push().key;
    const created = {
      ...normalized,
      distributionStatus: req.body?.distributionStatus || 'PENDING',
      createdAt: now,
      updatedAt: now
    };

    const saved = await writeStudent(db, studentId, created);
    await emitEvent(db, 'student:created', saved);
    return res.status(201).json(saved);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
});

app.put('/students/:id', verifyAdmin, async (req, res) => {
  try {
    const db = getDbOrThrow();
    const existing = await getStudentById(db, req.params.id);
    if (!existing) return res.status(404).json({ message: 'Student not found.' });

    const normalized = normalizeStudentInput(req.body);
    const validationError = validateStudentInput(normalized);
    if (validationError) return res.status(400).json({ message: validationError });

    if (existing.fingerprintId !== normalized.fingerprintId) {
      const conflict = await getStudentByFingerprintId(db, normalized.fingerprintId);
      if (conflict && conflict._id !== existing._id) {
        return res.status(409).json({ message: 'fingerprintId already exists.' });
      }
      await db.ref(`fingerprintIndex/${existing.fingerprintId}`).remove();
    }

    const updated = {
      ...existing,
      ...normalized,
      distributionStatus: req.body?.distributionStatus || existing.distributionStatus || 'PENDING',
      updatedAt: new Date().toISOString()
    };

    const saved = await writeStudent(db, existing._id, updated);
    await emitEvent(db, 'student:updated', saved);
    return res.json(saved);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
});

app.put('/students/:id/distribution', async (req, res) => {
  try {
    const status = String(req.body?.status || '').toUpperCase();
    if (!['PENDING', 'DISTRIBUTED'].includes(status)) {
      return res.status(400).json({ message: 'status must be PENDING or DISTRIBUTED.' });
    }

    const db = getDbOrThrow();
    const existing = await getStudentById(db, req.params.id);
    if (!existing) return res.status(404).json({ message: 'Student not found.' });

    const updated = {
      ...existing,
      distributionStatus: status,
      updatedAt: new Date().toISOString()
    };

    const saved = await writeStudent(db, existing._id, updated);
    await emitEvent(db, 'student:updated', saved);
    return res.json(saved);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
});

app.delete('/students/:id', verifyAdmin, async (req, res) => {
  try {
    const db = getDbOrThrow();
    const existing = await getStudentById(db, req.params.id);
    if (!existing) return res.status(404).json({ message: 'Student not found.' });

    await db.ref(`students/${existing._id}`).remove();
    await db.ref(`fingerprintIndex/${existing.fingerprintId}`).remove();
    await emitEvent(db, 'student:deleted', { _id: existing._id, fingerprintId: existing.fingerprintId });
    return res.json({ ok: true });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
app.get('/firebase/status', async (_req, res) => {
  const firebase = await checkFirebaseConnection();
  res.json(firebase);
});

// Placeholder route so frontend/API wiring can be validated immediately.
app.get('/students', (_req, res) => {
  res.json([]);
});

app.use((_req, res) => {
  res.status(404).json({
    error: 'Not found',
    hint: 'Try GET /api/health'
  });
});

module.exports.handler = serverless(app);
