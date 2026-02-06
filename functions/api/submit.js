// functions/api/submit.js

export async function onRequestPost({ request, env }) {
  try {
    const token = env.TELEGRAM_BOT_TOKEN;
    const chatId = env.TELEGRAM_CHAT_ID;

    if (!token) return json({ error: "Missing TELEGRAM_BOT_TOKEN" }, 500);
    if (!chatId) return json({ error: "Missing TELEGRAM_CHAT_ID" }, 500);

    const form = await request.formData();
    const file = form.get("file");   // File (PNG)
    const meta = form.get("meta");   // JSON string (optional)

    if (!file) return json({ error: "No file in request" }, 400);

    const caption = buildCaption(meta);

    const result = await sendToTelegram({
      token,
      chatId,
      file,
      filename: file.name || `timesheet_${Date.now()}.png`,
      caption,
    });

    return json({ ok: true, telegram: result }, 200);
  } catch (e) {
    return json({ error: e?.message || String(e) }, 500);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function buildCaption(meta) {
  // meta comes from the browser as a string. Keep it safe.
  try {
    if (!meta) return "New timesheet submitted ✅";
    const d = JSON.parse(String(meta));

    const name = d?.name ? String(d.name) : "Employee";
    const date = d?.date ? String(d.date) : "";
    const start = d?.startTime ? String(d.startTime) : "";
    const end = d?.endTime ? String(d.endTime) : "";
    const hours = d?.totalHours ? String(d.totalHours) : "";

    return `New timesheet ✅\nName: ${name}\nDate: ${date}\nShift: ${start} - ${end}\nHours: ${hours}`;
  } catch {
    return "New timesheet submitted ✅";
  }
}

async function sendToTelegram({ token, chatId, file, filename, caption }) {
  const url = `https://api.telegram.org/bot${token}/sendDocument`;

  const fd = new FormData();
  fd.append("chat_id", String(chatId));
  fd.append("caption", caption);
  fd.append("document", file, filename);

  const res = await fetch(url, { method: "POST", body: fd });

  // Telegram usually returns JSON, but be defensive
  const text = await res.text();
  let data = {};
  try { data = JSON.parse(text); } catch {}

  if (!res.ok || data.ok !== true) {
    const msg =
      data?.description ||
      (text ? `Telegram error: ${text}` : `Telegram upload failed (HTTP ${res.status})`);
    throw new Error(msg);
  }

  return { message_id: data.result.message_id };
}
