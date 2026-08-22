const { getSessionFromEvent } = require("./_lib/session");
const { getUser, saveUser, WINDOW_MS } = require("./_lib/store");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };

  const session = getSessionFromEvent(event);
  if (!session) return { statusCode: 401, body: JSON.stringify({ error: "Belum login" }) };

  const user = await getUser(session.discordId);
  const now = Date.now();

  if (user.tier === "unlimited") {
    user.converted = (user.converted || 0) + 1;
    await saveUser(session.discordId, user);
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  }

  let windowStart = user.windowStart || now;
  let windowCount = user.windowCount || 0;
  if (now - windowStart > WINDOW_MS) {
    windowStart = now;
    windowCount = 0;
  }

  const cap = user.tier === "pro" ? 999 : 3;
  if (windowCount >= cap) {
    const minutesLeft = Math.ceil((WINDOW_MS - (now - windowStart)) / 60000);
    return {
      statusCode: 429,
      body: JSON.stringify({
        error: `Limit konversi tercapai (${cap}/12 jam). Coba lagi dalam ${minutesLeft} menit atau upgrade ke Pro.`,
      }),
    };
  }

  user.windowStart = windowStart;
  user.windowCount = windowCount + 1;
  user.converted = (user.converted || 0) + 1;
  await saveUser(session.discordId, user);

  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};
