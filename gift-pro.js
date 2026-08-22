const { getSessionFromEvent } = require("./_lib/session");
const { getUser, saveUser } = require("./_lib/store");

const OWNER_IDS = (process.env.OWNER_DISCORD_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);
const VALID_TIERS = ["free", "pro", "unlimited"];

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };

  const session = getSessionFromEvent(event);
  if (!session || !OWNER_IDS.includes(session.discordId)) {
    return { statusCode: 403, body: JSON.stringify({ error: "Hanya owner yang bisa memberi akses Pro." }) };
  }

  const { targetId, tier } = JSON.parse(event.body || "{}");
  if (!targetId || !VALID_TIERS.includes(tier)) {
    return { statusCode: 400, body: JSON.stringify({ error: "targetId atau tier tidak valid." }) };
  }

  const user = await getUser(targetId);
  user.tier = tier;
  await saveUser(targetId, user);

  return { statusCode: 200, body: JSON.stringify({ ok: true, targetId, tier }) };
};
