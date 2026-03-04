const API_ROOT_CANDIDATES = ["/api", "/.netlify/functions/api"];
let API_ROOT = API_ROOT_CANDIDATES[0];
let API_BASE = `${API_ROOT}/students`;
const API_BASE_CANDIDATES = ["/api/students", "/.netlify/functions/api/students"];
let API_BASE = API_BASE_CANDIDATES[0];
const POLL_MS = 2000;

const connectionStatusEl = document.getElementById("connectionStatus");
const scanPanelEl = document.getElementById("scanPanel");
const tableWrapperEl = document.getElementById("tableWrapper");
const adminToggleBtn = document.getElementById("adminToggleBtn");
const adminPanelEl = document.getElementById("adminPanel");
const adminFormContainerEl = document.getElementById("adminFormContainer");

const SUPPLY_OPTIONS = {
  MALE: ["Polo Uniform", "Slacks Pants", "PE Pants", "PE Shirt", "Rubber Shoes", "Black Shoes"],
  FEMALE: ["Blouse", "Skirt", "Neck Tie", "PE Shirt", "PE Pants", "Doll Shoes", "Rubber Shoes"]
};

let students = [];
let activeFingerprintId = null;
let flashMessage = null;
let adminMode = false;
let adminEditingId = null;
let adminPassword = sessionStorage.getItem("admin_password") || "";
let lastEventCursor = "";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function statusBadge(status) {
  const css = status === "DISTRIBUTED" ? "distributed" : "pending";
  return `<span class="status ${css}">${status}</span>`;
}

function setConnectionStatus(state) {
  connectionStatusEl.textContent = state;
}

function showMessage(type, text) {
  flashMessage = { type, text };
}

function clearMessage() {
  flashMessage = null;
}

function renderMessage() {
  if (!flashMessage) return "";
  return `<div class="message ${flashMessage.type}">${escapeHtml(flashMessage.text)}</div>`;
}

function gradeOptions(selected) {
  return ["7", "8", "9", "10", "11", "12"]
    .map((grade) => `<option value="${grade}" ${selected === grade ? "selected" : ""}>Grade ${grade}</option>`)
    .join("");
}

function strandOptions(selected) {
  const list = ["STEM", "ABM", "HUMSS", "GAS", "TVL", "ICT"];
  const opts = [`<option value="">Select strand</option>`];
  list.forEach((strand) => opts.push(`<option value="${strand}" ${selected === strand ? "selected" : ""}>${strand}</option>`));
  return opts.join("");
}

function supplyChecklist(gender, selectedSupplies, name = "assignedSupplies") {
  const list = SUPPLY_OPTIONS[gender] || [];
  return list
    .map((item) => {
      const checked = selectedSupplies.includes(item) ? "checked" : "";
      return `<label class="check-item"><input type="checkbox" name="${name}" value="${escapeHtml(item)}" ${checked} /><span>${escapeHtml(item)}</span></label>`;
    })
    .join("");
}

function normalizeGrade(gradeLevel) {
  return String(gradeLevel || "").replace("Grade ", "");
}

function upsertStudent(student) {
  const idx = students.findIndex((s) => s._id === student._id);
  if (idx === -1) students.push(student);
  else students[idx] = student;
}

function removeStudent(studentId) {
  students = students.filter((s) => s._id !== studentId);
}

function getAdminHeaders(base = {}) {
  return { ...base, "x-admin-password": adminPassword };
}

async function jsonFetch(url, options = {}) {
  const response = await fetch(url, options);
  const rawBody = await response.text();

  let data = {};
  if (rawBody) {
    try {
      data = JSON.parse(rawBody);
    } catch (_error) {
      data = { message: rawBody };
    }
  }

  if (!response.ok) {
    const fallback = `Request failed (${response.status}).`;
    throw new Error(data.message || fallback);
  }

  return data;
}


async function resolveApiBase() {
  let lastError = null;

  for (const candidate of API_ROOT_CANDIDATES) {
    try {
      await jsonFetch(`${candidate}/health`);
      API_ROOT = candidate;
      API_BASE = `${API_ROOT}/students`;
      return candidate;
    } catch (error) {
      lastError = error;
    }
  }

  const detail = lastError?.message ? ` ${lastError.message}` : "";
  throw new Error(`Cannot reach API routes. Check Netlify redirects/function deploy.${detail}`);
  for (const candidate of API_BASE_CANDIDATES) {
    try {
      await jsonFetch(candidate);
      API_BASE = candidate;
      return candidate;
    } catch (_error) {
      // Try next candidate
    }
  }

  throw new Error("Cannot reach API routes. Check Netlify redirects and function deployment.");
}

async function verifyAdminPassword(password) {
  await jsonFetch(`${API_BASE}/admin/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password })
  });
}

function renderTable() {
  if (!students.length) {
    tableWrapperEl.innerHTML = '<p class="muted">No student records yet.</p>';
    return;
  }

  const rows = students
    .slice()
    .sort((a, b) => String(a.fullName).localeCompare(String(b.fullName)))
    .map((student) => {
      const actions = adminMode
        ? `<div class="actions-cell">
             <button class="secondary small" data-action="edit" data-id="${student._id}">Edit</button>
             <button class="secondary small" data-action="pending" data-id="${student._id}">Set Pending</button>
             <button class="warn small" data-action="distributed" data-id="${student._id}">Set Distributed</button>
             <button class="danger small" data-action="delete" data-id="${student._id}">Delete</button>
           </div>`
        : "-";

      return `<tr>
        <td>${escapeHtml(student.lrn)}</td>
        <td>${escapeHtml(student.fullName)}</td>
        <td>${escapeHtml(student.gender || "-")}</td>
        <td>${escapeHtml(student.gradeLevel || "-")}</td>
        <td>${escapeHtml(student.strand || "-")}</td>
        <td>${escapeHtml(student.section || "-")}</td>
        <td>${escapeHtml((student.assignedSupplies || []).join(", "))}</td>
        <td>${statusBadge(student.distributionStatus || "PENDING")}</td>
        <td>${escapeHtml(student.fingerprintId || "-")}</td>
        <td>${actions}</td>
      </tr>`;
    })
    .join("");

  tableWrapperEl.innerHTML = `<table><thead><tr>
      <th>LRN</th><th>Full Name</th><th>Gender</th><th>Grade</th><th>Strand</th><th>Section</th><th>Supplies</th><th>Status</th><th>Fingerprint ID</th><th>Actions</th>
    </tr></thead><tbody>${rows}</tbody></table>`;

  tableWrapperEl.querySelectorAll("button[data-action]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      const student = students.find((s) => s._id === id);
      if (!student) return;

      try {
        if (action === "edit") {
          adminEditingId = id;
          renderAdminForm(student);
          return;
        }
        if (action === "delete") {
          if (!confirm(`Delete ${student.fullName}?`)) return;
          await jsonFetch(`${API_BASE}/${id}`, { method: "DELETE", headers: getAdminHeaders() });
          removeStudent(id);
          renderTable();
          renderAdminForm(null);
          return;
        }
        if (action === "pending" || action === "distributed") {
          const status = action === "pending" ? "PENDING" : "DISTRIBUTED";
          const updated = await jsonFetch(`${API_BASE}/${id}/distribution`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status })
          });
          upsertStudent(updated);
          renderTable();
          if (adminEditingId === id) renderAdminForm(updated);
        }
      } catch (error) {
        alert(error.message);
      }
    });
  });
}

function renderIdle() {
  scanPanelEl.innerHTML = `<h2>Fingerprint Session</h2><div class="scan-banner"><p class="muted">Waiting for fingerprint scan from ESP32...</p></div>${renderMessage()}`;
}

function bindDynamicSupplies(form, genderName, suppliesContainerId, suppliesInputName) {
  const selectedValues = () => Array.from(form.querySelectorAll(`input[name="${suppliesInputName}"]:checked`)).map((x) => x.value);
  form.querySelectorAll(`input[name="${genderName}"]`).forEach((radio) => {
    radio.addEventListener("change", () => {
      const chosen = form.querySelector(`input[name="${genderName}"]:checked`)?.value || "MALE";
      document.getElementById(suppliesContainerId).innerHTML = supplyChecklist(chosen, selectedValues(), suppliesInputName);
    });
  });
}

function bindGradeStrand(form, gradeId, strandContainerId, strandId) {
  const gradeSelect = document.getElementById(gradeId);
  const strandContainer = document.getElementById(strandContainerId);
  const strandSelect = document.getElementById(strandId);
  const sync = () => {
    const needs = gradeSelect.value === "11" || gradeSelect.value === "12";
    strandContainer.style.display = needs ? "" : "none";
    strandSelect.required = needs;
    if (!needs) strandSelect.value = "";
  };
  gradeSelect.addEventListener("change", sync);
  sync();
}

function renderProfileForm({ fingerprintId, student = null }) {
  activeFingerprintId = fingerprintId;
  const gender = student?.gender || "MALE";
  const selectedSupplies = student?.assignedSupplies || [];
  const gradeLevel = normalizeGrade(student?.gradeLevel || "11");

  scanPanelEl.innerHTML = `
    <h2>Fingerprint Session</h2>
    <div class="scan-banner"><div class="label">Detected Fingerprint ID</div><div class="value">${escapeHtml(fingerprintId)}</div></div>
    <form id="profileForm" class="profile-form">
      <div class="grid-2">
        <div><label class="label" for="lrn">Student LRN</label><input id="lrn" name="lrn" value="${escapeHtml(student?.lrn || "")}" required /></div>
        <div><label class="label" for="fullName">Full Name</label><input id="fullName" name="fullName" value="${escapeHtml(student?.fullName || "")}" required /></div>
      </div>
      <div class="grid-2">
        <div><label class="label">Gender</label><div class="gender-group">
          <label class="radio-chip"><input type="radio" name="gender" value="MALE" ${gender === "MALE" ? "checked" : ""} /> Male</label>
          <label class="radio-chip"><input type="radio" name="gender" value="FEMALE" ${gender === "FEMALE" ? "checked" : ""} /> Female</label>
        </div></div>
        <div><label class="label" for="gradeLevel">Grade Level</label><select id="gradeLevel" name="gradeLevel" required>${gradeOptions(gradeLevel)}</select></div>
      </div>
      <div class="grid-2">
        <div id="strandContainer"><label class="label" for="strand">Strand (Grade 11/12)</label><select id="strand" name="strand">${strandOptions(student?.strand || "")}</select></div>
        <div><label class="label" for="section">Section</label><input id="section" name="section" value="${escapeHtml(student?.section || "")}" required /></div>
      </div>
      <div class="supply-box"><div class="label">Assigned School Supplies</div><div id="suppliesContainer" class="supply-grid">${supplyChecklist(gender, selectedSupplies)}</div></div>
      <div class="actions">
        <button class="primary" type="submit">Confirm and Save</button>
        <button class="warn" type="button" id="markPendingBtn">Mark Pending</button>
        <button class="secondary" type="button" id="clearSessionBtn">Clear Session</button>
      </div>
    </form>
    ${renderMessage()}
  `;

  const form = document.getElementById("profileForm");
  bindDynamicSupplies(form, "gender", "suppliesContainer", "assignedSupplies");
  bindGradeStrand(form, "gradeLevel", "strandContainer", "strand");

  document.getElementById("clearSessionBtn").addEventListener("click", () => {
    activeFingerprintId = null;
    clearMessage();
    renderIdle();
  });

  document.getElementById("markPendingBtn").addEventListener("click", async () => {
    if (!student?._id) {
      showMessage("error", "Pending status can only be set for existing student.");
      renderProfileForm({ fingerprintId, student });
      return;
    }
    try {
      const updated = await jsonFetch(`${API_BASE}/${student._id}/distribution`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "PENDING" })
      });
      upsertStudent(updated);
      showMessage("ok", "Distribution set to PENDING.");
      renderProfileForm({ fingerprintId, student: updated });
      renderTable();
      if (adminMode) renderAdminForm(updated);
    } catch (error) {
      showMessage("error", error.message);
      renderProfileForm({ fingerprintId, student });
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const payload = {
      fingerprintId,
      lrn: String(formData.get("lrn") || "").trim(),
      fullName: String(formData.get("fullName") || "").trim(),
      gender: String(formData.get("gender") || ""),
      gradeLevel: String(formData.get("gradeLevel") || "").trim(),
      strand: String(formData.get("strand") || "").trim(),
      section: String(formData.get("section") || "").trim(),
      assignedSupplies: formData.getAll("assignedSupplies")
    };
    try {
      const saved = await jsonFetch(`${API_BASE}/profile-confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      upsertStudent(saved);
      showMessage("ok", "Profile saved and distribution confirmed.");
      renderProfileForm({ fingerprintId, student: saved });
      renderTable();
      if (adminMode) renderAdminForm(saved);
    } catch (error) {
      showMessage("error", error.message);
      renderProfileForm({ fingerprintId, student });
    }
  });
}

function renderAdminForm(student = null) {
  adminEditingId = student?._id || null;
  const gender = student?.gender || "MALE";
  const selectedSupplies = student?.assignedSupplies || [];
  const gradeLevel = normalizeGrade(student?.gradeLevel || "11");

  adminFormContainerEl.innerHTML = `
    <form id="adminForm" class="profile-form">
      <div class="grid-2">
        <div><label class="label" for="adminFingerprintId">Fingerprint ID</label><input id="adminFingerprintId" name="fingerprintId" type="number" min="1" required value="${escapeHtml(student?.fingerprintId || "")}" /></div>
        <div><label class="label" for="adminLrn">Student LRN</label><input id="adminLrn" name="lrn" required value="${escapeHtml(student?.lrn || "")}" /></div>
      </div>
      <div class="grid-2">
        <div><label class="label" for="adminFullName">Full Name</label><input id="adminFullName" name="fullName" required value="${escapeHtml(student?.fullName || "")}" /></div>
        <div><label class="label" for="adminSection">Section</label><input id="adminSection" name="section" required value="${escapeHtml(student?.section || "")}" /></div>
      </div>
      <div class="grid-2">
        <div><label class="label">Gender</label><div class="gender-group">
          <label class="radio-chip"><input type="radio" name="gender" value="MALE" ${gender === "MALE" ? "checked" : ""} /> Male</label>
          <label class="radio-chip"><input type="radio" name="gender" value="FEMALE" ${gender === "FEMALE" ? "checked" : ""} /> Female</label>
        </div></div>
        <div><label class="label" for="adminGradeLevel">Grade Level</label><select id="adminGradeLevel" name="gradeLevel" required>${gradeOptions(gradeLevel)}</select></div>
      </div>
      <div class="grid-2">
        <div id="adminStrandContainer"><label class="label" for="adminStrand">Strand (Grade 11/12)</label><select id="adminStrand" name="strand">${strandOptions(student?.strand || "")}</select></div>
        <div></div>
      </div>
      <div class="supply-box"><div class="label">Assigned School Supplies</div><div id="adminSuppliesContainer" class="supply-grid">${supplyChecklist(gender, selectedSupplies)}</div></div>
      <div class="actions">
        <button class="primary" type="submit">${student ? "Update Student" : "Create Student"}</button>
        <button class="secondary" type="button" id="adminClearBtn">Clear Form</button>
      </div>
    </form>`;

  const form = document.getElementById("adminForm");
  bindDynamicSupplies(form, "gender", "adminSuppliesContainer", "assignedSupplies");
  bindGradeStrand(form, "adminGradeLevel", "adminStrandContainer", "adminStrand");

  document.getElementById("adminClearBtn").addEventListener("click", () => {
    adminEditingId = null;
    renderAdminForm(null);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const payload = {
      fingerprintId: Number(formData.get("fingerprintId")),
      lrn: String(formData.get("lrn") || "").trim(),
      fullName: String(formData.get("fullName") || "").trim(),
      gender: String(formData.get("gender") || ""),
      gradeLevel: String(formData.get("gradeLevel") || "").trim(),
      strand: String(formData.get("strand") || "").trim(),
      section: String(formData.get("section") || "").trim(),
      assignedSupplies: formData.getAll("assignedSupplies")
    };

    const method = adminEditingId ? "PUT" : "POST";
    const url = adminEditingId ? `${API_BASE}/${adminEditingId}` : API_BASE;

    try {
      const saved = await jsonFetch(url, {
        method,
        headers: getAdminHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(payload)
      });
      upsertStudent(saved);
      renderTable();
      adminEditingId = saved._id;
      renderAdminForm(saved);
    } catch (error) {
      alert(error.message);
    }
  });
}

function setAdminMode(nextState) {
  adminMode = nextState;
  adminToggleBtn.textContent = adminMode ? "Disable Admin Mode" : "Enable Admin Mode";
  adminPanelEl.classList.toggle("hidden", !adminMode);
  renderTable();
  if (adminMode) renderAdminForm(adminEditingId ? students.find((s) => s._id === adminEditingId) : null);
}

adminToggleBtn.addEventListener("click", async () => {
  if (adminMode) {
    setAdminMode(false);
    return;
  }
  const value = prompt("Enter admin password:");
  if (!value) return;
  try {
    await verifyAdminPassword(value);
    adminPassword = value;
    sessionStorage.setItem("admin_password", value);
    setAdminMode(true);
  } catch (error) {
    adminPassword = "";
    sessionStorage.removeItem("admin_password");
    alert(error.message);
  }
});

async function fetchStudents() {
  students = await jsonFetch(API_BASE);
  renderTable();
}

function applyEvent(event) {
  const payload = event.payload || {};
  if (event.type === "scan:matched") {
    clearMessage();
    if (payload._id) upsertStudent(payload);
    renderProfileForm({ fingerprintId: payload.fingerprintId, student: payload });
    renderTable();
    return;
  }
  if (event.type === "scan:unknown") {
    showMessage("error", `No student profile mapped yet for fingerprint ID ${payload.fingerprintId}.`);
    renderProfileForm({ fingerprintId: payload.fingerprintId, student: null });
    return;
  }
  if (event.type === "student:created" || event.type === "student:updated") {
    if (payload._id) upsertStudent(payload);
    renderTable();
    if (activeFingerprintId && Number(activeFingerprintId) === Number(payload.fingerprintId)) {
      renderProfileForm({ fingerprintId: payload.fingerprintId, student: payload });
    }
    if (adminMode && adminEditingId === payload._id) renderAdminForm(payload);
    return;
  }
  if (event.type === "student:deleted") {
    if (payload._id) removeStudent(payload._id);
    renderTable();
    if (adminMode && adminEditingId === payload._id) renderAdminForm(null);
  }
}

async function pollEvents() {
  try {
    const qs = lastEventCursor ? `?since=${encodeURIComponent(lastEventCursor)}` : "";
    const events = await jsonFetch(`${API_BASE}/events${qs}`);
    setConnectionStatus("Live Connection");
    if (Array.isArray(events) && events.length) {
      events.forEach((event) => applyEvent(event));
      const last = events[events.length - 1];
      lastEventCursor = last.createdAt || new Date().toISOString();
    }
  } catch (_error) {
    setConnectionStatus("Disconnected");
  }
}

async function bootstrap() {
  renderIdle();
  setAdminMode(false);

  try {
    await resolveApiBase();
    await fetchStudents();
    setConnectionStatus("Live Connection");
  } catch (error) {
    setConnectionStatus("Disconnected");
    tableWrapperEl.innerHTML = `<p class="muted">${escapeHtml(error.message)}</p>`;
  }

  setInterval(pollEvents, POLL_MS);
  pollEvents();
}

bootstrap();
