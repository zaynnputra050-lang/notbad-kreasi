const { getSessionFromEvent } = require("./_lib/session");
const { getUser, saveUser } = require("./_lib/store");

// NOTE: Roblox Open Cloud API keys are sensitive credentials. This stores
// them as-is in the user's Netlify Blobs record for simplicity. For
// production, encrypt this value (e.g. AES-GCM with a server-side key from
// an env var) before writing it, and decrypt only inside roblox-upload.js.
exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };

  const session = getSessionFromEvent(event);
  if (!session) return { statusCode: 401, body: JSON.stringify({ error: "Belum login" }) };

  const { userId, groupId, apiKey } = JSON.parse(event.body || "{}");
  if (!userId || !apiKey) {
    return { statusCode: 400, body: JSON.stringify({ error: "Roblox User ID dan API Key wajib diisi." }) };
  }

  const user = await getUser(session.discordId);
  user.roblox = { userId, groupId: groupId || null, apiKey };
  await saveUser(session.discordId, user);

  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};
