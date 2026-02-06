export async function onRequestPost({ request, env }) {
  try {
    if (!env.TELEGRAM_BOT_TOKEN) throw new Error("Missing TELEGRAM_BOT_TOKEN");
    if (!env.TELEGRAM_CHAT_ID) throw new Error("Missing TELEGRAM_CHAT_ID");

    const form = await request.formData();
    const file = form.get("file");
    const meta = form.get("meta");

    if (!file) return json({ error: "No file in request" }, 400);

    const caption = buildCaption(meta);

    const tgRes = await sendToTelegram({
      token: env.TELEGRAM_BOT_TOKEN,
      chatId: env.TELEGRAM_CHAT_ID,
      file,
      filename: file.name || `timesheet_${Date.now()}.png`,
      caption,
    });

    return json({ ok: true, telegram: tgRes }, 200);
  } catch (e) {
    return json({ error: e?.message || String(e) }, 500);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function buildCaption(meta) {
  try {
    if (!meta) return "New timesheet submitted ✅";
    const d = JSON.parse(String(meta));
    const name = d.name || "Employee";
    const date = d.date || "";
    const start = d.startTime || "";
    const end = d.endTime || "";
    const hours = d.totalHours || "";
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
  const data = await res.json();

  if (!res.ok || !data.ok) {
    throw new Error(data?.description || "Telegram upload failed");
  }
  return { message_id: data.result.message_id };
}
