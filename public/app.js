const form = document.getElementById("tsForm");
const statusEl = document.getElementById("status");

const preview = document.getElementById("preview");
const pctx = preview.getContext("2d");

const sigPad = document.getElementById("sigPad");
const sctx = sigPad.getContext("2d");
const clearSigBtn = document.getElementById("clearSig");

const TEMPLATE_URL = "/template.png";

/**
 * IMPORTANT:
 * These coordinates are tuned for your A4 landscape-style template.
 * If anything is off by a little, we adjust these numbers.
 */
const COORDS = {
  week: { x: 1960, y: 265 },
  name: { x: 260, y: 360 },
  jobRoleTop: { x: 980, y: 360 },
  careHome: { x: 1750, y: 360 },

  // Single row (Row 1)
  rowY: 580,

  colX: {
    slno: 120,
    date: 260,
    start: 520,
    end: 720,
    break: 920,
    total: 1150,
    jobRole: 1380,
    signBoxX: 1600,   // where signature box starts visually
    signBoxY: 520,    // top of signature cell area
    signBoxW: 360,    // width of signature cell area
    signBoxH: 120,    // height of signature cell area
    remarks: 1980,
  },
};

async function loadTemplate() {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = TEMPLATE_URL;
  await new Promise((res, rej) => {
    img.onload = res;
    img.onerror = rej;
  });
  return img;
}

function formatDateForSheet(yyyy_mm_dd) {
  // input: "2026-02-05" -> output: "05/02/2026"
  if (!yyyy_mm_dd) return "";
  const [y, m, d] = yyyy_mm_dd.split("-");
  return `${d}/${m}/${y}`;
}

function drawText(value, x, y, font = "32px Arial") {
  pctx.font = font;
  pctx.fillStyle = "#111";
  pctx.textBaseline = "alphabetic";
  pctx.fillText(String(value ?? ""), x, y);
}

/** ---------------- Signature Pad ---------------- */
function initSignaturePad() {
  // Signature style
  sctx.lineWidth = 3;
  sctx.lineCap = "round";
  sctx.strokeStyle = "#111";
  sctx.fillStyle = "#fff";
  sctx.fillRect(0, 0, sigPad.width, sigPad.height);

  let drawing = false;
  let last = null;

  function getPos(e) {
    const rect = sigPad.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    // scale to canvas coords
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

/** ---------------- Render final image ---------------- */
async function renderTimesheet(data) {
  const template = await loadTemplate();

  // Match template into preview canvas
  pctx.clearRect(0, 0, preview.width, preview.height);
  pctx.drawImage(template, 0, 0, preview.width, preview.height);

  // Header fields
  drawText(data.week, COORDS.week.x, COORDS.week.y);
  drawText(data.name, COORDS.name.x, COORDS.name.y);
  drawText(data.jobRoleTop, COORDS.jobRoleTop.x, COORDS.jobRoleTop.y);
  drawText(data.careHome, COORDS.careHome.x, COORDS.careHome.y);

  // Single row text
  const y = COORDS.rowY;
  drawText("1", COORDS.colX.slno, y);

  drawText(formatDateForSheet(data.date), COORDS.colX.date, y);
  drawText(data.startTime, COORDS.colX.start, y);
  drawText(data.endTime, COORDS.colX.end, y);
  drawText(String(data.breakMins), COORDS.colX.break, y);
  drawText(String(data.totalHours), COORDS.colX.total, y);
  drawText(data.jobRoleTop, COORDS.colX.jobRole, y); // reuse job role
  drawText(data.remarks, COORDS.colX.remarks, y);

  // Place signature image into the “INCHARGE SIGN” cell
  // We crop the signature pad and scale it into the signature box.
  const sigImg = await canvasToImage(sigPad);
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

    const upload = new FormData();
    const rawName = String(data?.name ?? "").trim();
    const safeName = (rawName.length ? rawName : "employee").replace(/\s+/g, "_");
    upload.append("file", blob, `timesheet_${safeName}_${Date.now()}.png`);
    upload.append("meta", JSON.stringify(data));

    const res = await fetch("/api/submit", { method: "POST", body: upload });
    const out = await res.json();
    if (!res.ok) throw new Error(out?.error || "Upload failed");

    statusEl.textContent = "Submitted ✅";
    form.reset();
    // keep signature unless you want to clear it automatically
  } catch (err) {
    console.error(err);
    statusEl.textContent = `Error: ${err.message}`;
  }
});
