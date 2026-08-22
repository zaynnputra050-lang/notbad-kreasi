const { getSessionFromEvent } = require("./_lib/session");
const { getUser, computeStatus } = require("./_lib/store");

const OWNER_IDS = (process.env.OWNER_DISCORD_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);

exports.handler = async (event) => {
  const session = getSessionFromEvent(event);
  if (!session) return { statusCode: 401, body: JSON.stringify({ error: "Belum login" }) };

  const record = await getUser(session.discordId);
  const status = computeStatus(record);

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user: {
        id: session.discordId,
        username: session.username,
        avatar: session.avatar,
        tier: record.tier,
        isOwner: OWNER_IDS.includes(session.discordId),
        robloxConnected: !!record.roblox,
      },
      status,
    }),
  };
};
