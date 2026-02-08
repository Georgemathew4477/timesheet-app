// app.js

const form = document.getElementById("tsForm");
const statusEl = document.getElementById("status");

const preview = document.getElementById("preview");
const pctx = preview.getContext("2d");

const sigPad = document.getElementById("sigPad");
const sctx = sigPad.getContext("2d");
const clearSigBtn = document.getElementById("clearSig");

// ✅ fixed filename
const TEMPLATE_URL = "/templat.png";

/**
 * Coordinates assume preview canvas is SAME pixel size as template image.
 * We enforce that in renderTimesheet() by setting preview.width/height from template.
 */
const COORDS = {
  // Header lines
  jobRoleTop: { x: 500, y: 235 },
  name: { x: 100, y: 235 },
  careHome: { x: 895, y: 235 },

  // Row 1 baseline y
  rowY: 402,

  colX: {
    date: 103,
    start: 245,
    end: 350,
    break: 475,
    total: 583,

    // JOB ROLE column start
    jobRole: 698,

    // Signature box
    signBoxX: 847,
    signBoxY: 370,
    signBoxW: 200,
    signBoxH: 80,

    // Remarks column start
    remarks: 1033,
  },
};

/** ---------------- Utilities ---------------- */
async function loadTemplate() {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = TEMPLATE_URL;

  await new Promise((res, rej) => {
    img.onload = res;
    img.onerror = () => rej(new Error("Failed to load templat.png"));
  });

  return img;
}

function formatDateForSheet(yyyy_mm_dd) {
  if (!yyyy_mm_dd) return "";
  const [y, m, d] = String(yyyy_mm_dd).split("-");
  if (!y || !m || !d) return String(yyyy_mm_dd);
  return `${d}/${m}/${y}`;
}

function canvasToBlob(canvas, type = "image/png") {
  return new Promise((resolve) => canvas.toBlob(resolve, type));
}

function canvasToImage(canvas) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.src = canvas.toDataURL("image/png");
  });
}

function normalizeBreakMins(v) {
  const n = Number(v);
  return [0, 30, 60].includes(n) ? n : 0;
}

function limitChars(str, max) {
  return String(str ?? "").trim().slice(0, max);
}
function limitCharsWithEllipsis(str, max) {
  const s = String(str ?? "").trim();
  if (s.length <= max) return s;
  if (max <= 1) return s.slice(0, max);
  return s.slice(0, max - 1) + "…";
}

/** Basic draw text (no clipping) */
function drawText(value, x, y, font = "30px Arial") {
  pctx.font = font;
  pctx.fillStyle = "#111";
  pctx.textBaseline = "middle";
  pctx.fillText(String(value ?? ""), x, y);
}

/**
 * ✅ Draw text INSIDE a cell region (clips to borders) and fits/truncates.
 * Perfect for JOB ROLE & REMARKS columns.
 */
function drawCellText(text, xLeft, yMid, xRight, fontSize = 24, fontFamily = "Arial") {
  const str = String(text ?? "").trim();

  const padX = 6;       // padding inside cell
  const clipHalfH = 18; // half height of row area (tweak 16-20 if needed)

  const clipX = xLeft;
  const clipY = yMid - clipHalfH;
  const clipW = Math.max(0, xRight - xLeft);
  const clipH = clipHalfH * 2;

  pctx.save();
  pctx.beginPath();
  pctx.rect(clipX, clipY, clipW, clipH);
  pctx.clip();

  pctx.fillStyle = "#111";
  pctx.textBaseline = "middle";

  const maxW = clipW - padX * 2;

  // Shrink-to-fit
  let size = fontSize;
  while (size > 12) {
    pctx.font = `${size}px ${fontFamily}`;
    if (pctx.measureText(str).width <= maxW) break;
    size--;
  }

  // Ellipsis if still too wide
  pctx.font = `${size}px ${fontFamily}`;
  let out = str;
  if (pctx.measureText(out).width > maxW) {
    while (out.length > 0 && pctx.measureText(out + "…").width > maxW) {
      out = out.slice(0, -1);
    }
    out = out.length ? out + "…" : "";
  }

  pctx.fillText(out, xLeft + padX, yMid);
  pctx.restore();
}

/**
 * ✅ Shrink-to-fit text (no clipping) for header fields.
 */
function drawFitText(text, x, y, maxWidth, fontSize = 24, fontFamily = "Arial") {
  const str = String(text ?? "").trim();
  let size = fontSize;

  pctx.fillStyle = "#111";
  pctx.textBaseline = "middle";

  while (size > 12) {
    pctx.font = `${size}px ${fontFamily}`;
    if (pctx.measureText(str).width <= maxWidth) break;
    size--;
  }

  pctx.fillText(str, x, y);
}

/** ---------------- "Other" handling + validation rules ---------------- */
const empNameEl = document.querySelector('[name="name"]');

const carehomeSelect = document.getElementById("carehomeSelect");
const carehomeOtherWrap = document.getElementById("carehomeOtherWrap");
const carehomeOther = document.getElementById("carehomeOther");

const jobRoleSelect = document.getElementById("jobRoleSelect");
const jobRoleOtherWrap = document.getElementById("jobRoleOtherWrap");
const jobRoleOther = document.getElementById("jobRoleOther");

function enforceMaxLen(inputEl, max) {
  if (!inputEl) return;
  inputEl.addEventListener("input", () => {
    if (inputEl.value.length > max) inputEl.value = inputEl.value.slice(0, max);
  });
}

enforceMaxLen(empNameEl, 20);
enforceMaxLen(carehomeOther, 25);
enforceMaxLen(jobRoleOther, 25);

function toggleOther(selectEl, wrapEl, inputEl) {
  if (!selectEl || !wrapEl || !inputEl) return;

  if (selectEl.value === "Other") {
    wrapEl.style.display = "block";
    inputEl.required = true;
  } else {
    wrapEl.style.display = "none";
    inputEl.required = false;
    inputEl.value = "";
  }
}

carehomeSelect?.addEventListener("change", () =>
  toggleOther(carehomeSelect, carehomeOtherWrap, carehomeOther)
);

jobRoleSelect?.addEventListener("change", () =>
  toggleOther(jobRoleSelect, jobRoleOtherWrap, jobRoleOther)
);

function getFinalCareHome() {
  if (!carehomeSelect) return "";
  if (carehomeSelect.value === "Other") {
    return limitChars(carehomeOther?.value || "", 25);
  }
  return String(carehomeSelect.value || "").trim();
}

function getFinalJobRole() {
  if (!jobRoleSelect) return "";
  if (jobRoleSelect.value === "Other") {
    return limitChars(jobRoleOther?.value || "", 25);
  }
  return String(jobRoleSelect.value || "").trim();
}

/** ---------------- Signature Pad ---------------- */
function initSignaturePad() {
  sctx.lineWidth = 3;
  sctx.lineCap = "round";
  sctx.strokeStyle = "#111";

  // white background
  sctx.fillStyle = "#fff";
  sctx.fillRect(0, 0, sigPad.width, sigPad.height);

  let drawing = false;
  let last = null;

  function getPos(e) {
    const rect = sigPad.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    const x = ((clientX - rect.left) / rect.width) * sigPad.width;
    const y = ((clientY - rect.top) / rect.height) * sigPad.height;
    return { x, y };
  }

  function start(e) {
    e.preventDefault();
    drawing = true;
    last = getPos(e);
  }

  function move(e) {
    if (!drawing) return;
    e.preventDefault();
    const pos = getPos(e);

    sctx.beginPath();
    sctx.moveTo(last.x, last.y);
    sctx.lineTo(pos.x, pos.y);
    sctx.stroke();

    last = pos;
  }

  function end(e) {
    if (!drawing) return;
    e.preventDefault();
    drawing = false;
    last = null;
  }

  sigPad.addEventListener("mousedown", start);
  sigPad.addEventListener("mousemove", move);
  window.addEventListener("mouseup", end);

  sigPad.addEventListener("touchstart", start, { passive: false });
  sigPad.addEventListener("touchmove", move, { passive: false });
  sigPad.addEventListener("touchend", end, { passive: false });

  clearSigBtn.addEventListener("click", () => {
    sctx.fillStyle = "#fff";
    sctx.fillRect(0, 0, sigPad.width, sigPad.height);
  });
}
initSignaturePad();

/** ---------------- Click-to-get-coordinates helper ---------------- */
preview.addEventListener("click", (e) => {
  const rect = preview.getBoundingClientRect();
  const x = Math.round(((e.clientX - rect.left) / rect.width) * preview.width);
  const y = Math.round(((e.clientY - rect.top) / rect.height) * preview.height);
  console.log("COORD:", { x, y });
});

/** Make signature background transparent (remove white box) */
async function signatureToTransparentImage(canvas) {
  const tmp = document.createElement("canvas");
  tmp.width = canvas.width;
  tmp.height = canvas.height;

  const tctx = tmp.getContext("2d");
  tctx.drawImage(canvas, 0, 0);

  const imgData = tctx.getImageData(0, 0, tmp.width, tmp.height);
  const d = imgData.data;

  for (let i = 0; i < d.length; i += 4) {
    const r = d[i],
      g = d[i + 1],
      b = d[i + 2];
    if (r > 245 && g > 245 && b > 245) d[i + 3] = 0;
  }

  tctx.putImageData(imgData, 0, 0);
  return canvasToImage(tmp);
}

/** ---------------- Total hours calc ---------------- */
function calculateTotalHours() {
  const start = document.querySelector('[name="startTime"]')?.value;
  const end = document.querySelector('[name="endTime"]')?.value;
  const breakMins = normalizeBreakMins(
    document.querySelector('[name="breakMins"]')?.value
  );

  if (!start || !end) return;

  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);

  let startMin = sh * 60 + sm;
  let endMin = eh * 60 + em;

  if (endMin < startMin) endMin += 24 * 60;

  let worked = endMin - startMin - breakMins;
  if (worked < 0) worked = 0;

  const hours = Math.round((worked / 60) * 4) / 4;
  const totalEl = document.querySelector('[name="totalHours"]');
  if (totalEl) totalEl.value = hours;
}

["startTime", "endTime", "breakMins"].forEach((name) => {
  const el = document.querySelector(`[name="${name}"]`);
  el?.addEventListener("change", calculateTotalHours);
});

/** ---------------- Render final image ---------------- */
async function renderTimesheet(data) {
  const template = await loadTemplate();

  preview.width = template.naturalWidth;
  preview.height = template.naturalHeight;

  pctx.clearRect(0, 0, preview.width, preview.height);
  pctx.drawImage(template, 0, 0);

  // ---------- Header ----------
  const headerFontSize = 24;

  drawText(data.name, COORDS.name.x, COORDS.name.y, `${headerFontSize}px Arial`);

  // Header job role should NOT overlap Care Home: limit by CareHome.x
  const headerJobRoleMaxWidth = (COORDS.careHome.x - 25) - COORDS.jobRoleTop.x;
  drawFitText(
    data.jobRoleTop,
    COORDS.jobRoleTop.x,
    COORDS.jobRoleTop.y,
    headerJobRoleMaxWidth,
    headerFontSize,
    "Arial"
  );

  // Care home header: fit within some width
  drawFitText(
    data.careHome,
    COORDS.careHome.x,
    COORDS.careHome.y,
    320,
    headerFontSize,
    "Arial"
  );

  // ---------- Row ----------
  const rowFontSize = 24;
  const y = COORDS.rowY + 8; // slightly lower to center in row

  drawText(formatDateForSheet(data.date), COORDS.colX.date, y, `${rowFontSize}px Arial`);
  drawText(data.startTime, COORDS.colX.start, y, `${rowFontSize}px Arial`);
  drawText(data.endTime, COORDS.colX.end, y, `${rowFontSize}px Arial`);
  drawText(String(data.breakMins ?? ""), COORDS.colX.break, y, `${rowFontSize}px Arial`);
  drawText(String(data.totalHours ?? ""), COORDS.colX.total, y, `${rowFontSize}px Arial`);

  // ✅ Table job role: show shortened (16) so it never looks crowded
  // If you prefer full but clipped, change to data.jobRoleTop
  const jobRoleRightEdge = COORDS.colX.signBoxX - 10;
  drawCellText(
    data.jobRoleRow,
    COORDS.colX.jobRole,
    y,
    jobRoleRightEdge,
    rowFontSize,
    "Arial"
  );

  // ✅ Remarks cell: clip so it NEVER goes out of column
  // If your table ends before canvas width, set a smaller right edge.
  const remarksRightEdge = preview.width - 12;
  drawCellText(
    data.remarks || "",
    COORDS.colX.remarks,
    y,
    remarksRightEdge,
    rowFontSize,
    "Arial"
  );

  // ---------- Signature ----------
  const sigImg = await signatureToTransparentImage(sigPad);

  const boxX = COORDS.colX.signBoxX;
  const boxY = COORDS.colX.signBoxY;
  const boxW = COORDS.colX.signBoxW;
  const boxH = COORDS.colX.signBoxH;

  // smaller signature inside box
  const scale = 0.50;
  const drawW = boxW * scale;
  const drawH = boxH * scale;

  // center it
  const dx = boxX + (boxW - drawW) / 2;
  const dy = boxY + (boxH - drawH) / 2;

  pctx.save();
  pctx.beginPath();
  pctx.rect(boxX, boxY, boxW, boxH);
  pctx.clip();

  pctx.drawImage(sigImg, dx, dy, drawW, drawH);

  pctx.restore();
}

/** ---------------- Submit ---------------- */
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  statusEl.textContent = "Generating…";

  const fd = new FormData(form);
  const data = Object.fromEntries(fd.entries());

  // Hard limits
  data.name = limitChars(data.name, 20);
  data.remarks = limitChars(data.remarks, 11);

  data.careHome = getFinalCareHome(); // already limited
  data.jobRoleTop = limitChars(getFinalJobRole(), 25);

  // ✅ Row job role is shortened to keep the table clean
  data.jobRoleRow = limitCharsWithEllipsis(data.jobRoleTop, 16);

  data.breakMins = String(normalizeBreakMins(data.breakMins));

  calculateTotalHours();
  data.totalHours =
    document.querySelector('[name="totalHours"]')?.value ||
    data.totalHours ||
    "";

  try {
    await renderTimesheet(data);

    statusEl.textContent = "Uploading…";
    const blob = await canvasToBlob(preview, "image/png");
    if (!blob) throw new Error("Failed to generate PNG");

    const rawName = String(data?.name ?? "").trim();
    const safeName = (rawName.length ? rawName : "employee").replace(/\s+/g, "_");

    const upload = new FormData();
    upload.append("file", blob, `timesheet_${safeName}_${Date.now()}.png`);
    upload.append("meta", JSON.stringify(data));

    const res = await fetch("/api/submit", { method: "POST", body: upload });

    const text = await res.text();
    let out = {};
    try { out = JSON.parse(text); } catch {}

    if (!res.ok) throw new Error(out?.error || text || "Upload failed");

    statusEl.textContent = "Submitted ✅";
    form.reset();

    // hide "Other" inputs after reset
    if (carehomeOtherWrap && carehomeOther) {
      carehomeOtherWrap.style.display = "none";
      carehomeOther.required = false;
      carehomeOther.value = "";
    }
    if (jobRoleOtherWrap && jobRoleOther) {
      jobRoleOtherWrap.style.display = "none";
      jobRoleOther.required = false;
      jobRoleOther.value = "";
    }

    // Optional:
    // clearSigBtn.click();
  } catch (err) {
    console.error(err);
    statusEl.textContent = `Error: ${err.message}`;
  }
});
