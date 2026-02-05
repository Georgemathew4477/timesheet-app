export async function onRequestPost({ request, env }) {
  try {
    const form = await request.formData();
    const file = form.get("file"); // File
    if (!file) return json({ error: "No file in request" }, 400);

    const accessToken = await getGoogleAccessToken(env);
    const fileId = await uploadToDrive({
      accessToken,
      folderId: env.DRIVE_FOLDER_ID,
      filename: file.name || `timesheet_${Date.now()}.png`,
      mimeType: file.type || "image/png",
      bytes: new Uint8Array(await file.arrayBuffer()),
    });

    return json({ ok: true, fileId }, 200);
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

// --- Google OAuth (Service Account JWT) ---
async function getGoogleAccessToken(env) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: env.GOOGLE_CLIENT_EMAIL,
    scope: "https://www.googleapis.com/auth/drive.file",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const jwt = await signJwtRS256(header, payload, env.GOOGLE_PRIVATE_KEY);

  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: jwt,
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data?.error_description || "Failed to get access token");
  return data.access_token;
}

function base64UrlEncode(bytes) {
  let str = btoa(String.fromCharCode(...bytes));
  return str.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function signJwtRS256(header, payload, privateKeyPem) {
  const enc = new TextEncoder();

  const headerB64 = base64UrlEncode(enc.encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(enc.encode(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = await importPkcs8(privateKeyPem);
  const sig = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    key,
    enc.encode(signingInput)
  );

  const sigB64 = base64UrlEncode(new Uint8Array(sig));
  return `${signingInput}.${sigB64}`;
}

async function importPkcs8(pem) {
  // pem comes as a multi-line string; remove header/footer
  const clean = pem
    .replace(/\\n/g, "\n")
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s+/g, "");

  const raw = Uint8Array.from(atob(clean), (c) => c.charCodeAt(0));

  return crypto.subtle.importKey(
    "pkcs8",
    raw.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

// --- Drive upload (multipart) ---
async function uploadToDrive({ accessToken, folderId, filename, mimeType, bytes }) {
  const boundary = "----cfBoundary" + Math.random().toString(16).slice(2);

  const metadata = {
    name: filename,
    parents: [folderId],
  };

  const part1 =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n`;

  const part2Header =
    `--${boundary}\r\n` +
    `Content-Type: ${mimeType}\r\n\r\n`;

  const end = `\r\n--${boundary}--\r\n`;

  const body = concatUint8([
    new TextEncoder().encode(part1),
    new TextEncoder().encode(part2Header),
    bytes,
    new TextEncoder().encode(end),
  ]);

  const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "Drive upload failed");
  return data.id;
}

function concatUint8(chunks) {
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}
