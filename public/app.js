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
 * IMPORTANT:
 * These coordinates assume the preview canvas is the SAME pixel size as the template image.
 * We enforce that in renderTimesheet() by setting preview.width/height from template.
 */
const COORDS = {
  // Header lines
  jobRoleTop: { x: 500, y: 235 },
  name: { x: 80 , y: 235 },
  careHome: { x: 895, y: 235 },
  

  // Row 1 baseline y
  rowY: 402,

  colX: {
    
    date: 103,
    start: 245,
    end: 350,
    break: 475,
    total: 583,
    jobRole: 698,
    remarks: 1033,

    // Signature box
    signBoxX: 847,
    signBoxY: 370,
    signBoxW: 200,
    signBoxH: 80,
  },
};

async function loadTemplate() {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = TEMPLATE_URL;

  await new Promise((res, rej) => {
    img.onload = res;
    img.onerror = () => rej(new Error("Failed to load template.png"));
  });

  return img;
}

function formatDateForSheet(yyyy_mm_dd) {
  if (!yyyy_mm_dd) return "";
  const [y, m, d] = String(yyyy_mm_dd).split("-");
  if (!y || !m || !d) return String(yyyy_mm_dd);
  return `${d}/${m}/${y}`;
}

function drawText(value, x, y, font = "30px Arial") {
  pctx.font = font;
  pctx.fillStyle = "#111";
  pctx.textBaseline = "middle";
  pctx.fillText(String(value ?? ""), x, y);
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
function signatureToTransparentImage(canvas) {
  const tmp = document.createElement("canvas");
  tmp.width = canvas.width;
  tmp.height = canvas.height;

  const tctx = tmp.getContext("2d");
  tctx.drawImage(canvas, 0, 0);

  const imgData = tctx.getImageData(0, 0, tmp.width, tmp.height);
  const d = imgData.data;

  // Make near-white pixels transparent
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i],
      g = d[i + 1],
      b = d[i + 2];
    if (r > 245 && g > 245 && b > 245) d[i + 3] = 0;
  }

  tctx.putImageData(imgData, 0, 0);
  return canvasToImage(tmp);
}


function calculateTotalHours() {
  const start = document.querySelector('[name="startTime"]').value;
  const end = document.querySelector('[name="endTime"]').value;
  const breakMins = Number(document.querySelector('[name="breakMins"]').value || 0);

  if (!start || !end) return;

  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);

  let startMin = sh * 60 + sm;
  let endMin = eh * 60 + em;

  // Handle overnight shifts
  if (endMin < startMin) endMin += 24 * 60;

  let worked = endMin - startMin - breakMins;
  if (worked < 0) worked = 0;

  const hours = Math.round((worked / 60) * 4) / 4; // round to .25
  document.querySelector('[name="totalHours"]').value = hours;
}

// Recalculate when inputs change
["startTime", "endTime", "breakMins"].forEach(name => {
  document.querySelector(`[name="${name}"]`)
    .addEventListener("change", calculateTotalHours);
});

/** ---------------- Render final image ---------------- */
async function renderTimesheet(data) {
  const template = await loadTemplate();

  // Match preview to template pixels
  preview.width = template.naturalWidth;
  preview.height = template.naturalHeight;

  pctx.clearRect(0, 0, preview.width, preview.height);
  pctx.drawImage(template, 0, 0);

  // Header fields
  const headerFont = "24px Arial";
  drawText(data.name, COORDS.name.x, COORDS.name.y, headerFont);
  drawText(data.jobRoleTop, COORDS.jobRoleTop.x, COORDS.jobRoleTop.y, headerFont);
  drawText(data.careHome, COORDS.careHome.x, COORDS.careHome.y, headerFont);

  // Row fields (smaller so it fits)
  const rowFont = "24px Arial";
  const y = COORDS.rowY;

  drawText("1", COORDS.colX.slno, y, rowFont);
  drawText(formatDateForSheet(data.date), COORDS.colX.date, y, rowFont);
  drawText(data.startTime, COORDS.colX.start, y, rowFont);
  drawText(data.endTime, COORDS.colX.end, y, rowFont);
  drawText(String(data.breakMins ?? ""), COORDS.colX.break, y, rowFont);
  drawText(String(data.totalHours ?? ""), COORDS.colX.total, y, rowFont);
  drawText(data.jobRoleTop, COORDS.colX.jobRole, y, rowFont);

  // Remarks optional
  if (data.remarks && String(data.remarks).trim()) {
    drawText(data.remarks, COORDS.colX.remarks, y, rowFont);
  }

  // Signature (transparent background)
  const sigImg = await signatureToTransparentImage(sigPad);
  pctx.drawImage(
    sigImg,
    COORDS.colX.signBoxX,
    COORDS.colX.signBoxY,
    COORDS.colX.signBoxW,
    COORDS.colX.signBoxH
  );
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

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  statusEl.textContent = "Generating…";

  const fd = new FormData(form);
  const data = Object.fromEntries(fd.entries());

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
    // Optional: clear signature after submit
    // clearSigBtn.click();
  } catch (err) {
    console.error(err);
    statusEl.textContent = `Error: ${err.message}`;
  }
});
