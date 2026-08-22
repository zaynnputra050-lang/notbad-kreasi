
const { getStore } = require("@netlify/blobs");

const FREE_LIMIT = 3;
const WINDOW_MS = 12 * 60 * 60 * 1000; // 12 jam

function usersStore() {
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_AUTH_TOKEN;

  if (!siteID || !token) {
    throw new Error("NETLIFY_SITE_ID atau NETLIFY_AUTH_TOKEN belum diatur");
  }

  return getStore("notbad-users", {
    siteID,
    token,
  });
}

async function getUser(discordId) {
  const store = usersStore();
  const raw = await store.get(discordId, { type: "json" });

  if (raw) return raw;

  const fresh = {
    id: discordId,
    tier: "free",
    converted: 0,
    windowStart: Date.now(),
    windowCount: 0,
    roblox: null,
  };

  await store.setJSON(discordId, fresh);
  return fresh;
}

async function saveUser(discordId, data) {
  await usersStore().setJSON(discordId, data);
  return data;
}

function computeStatus(user) {
  const now = Date.now();
  let windowStart = user.windowStart || now;
  let windowCount = user.windowCount || 0;

  if (now - windowStart > WINDOW_MS) {
    windowStart = now;
    windowCount = 0;
  }

  const limit = FREE_LIMIT_FOR(user.tier);
  const remaining =
    user.tier === "unlimited"
      ? Infinity
      : Math.max(0, limit - windowCount);

  return {
    converted: user.converted || 0,
    remaining: user.tier === "unlimited" ? "∞" : remaining,
    limit: user.tier === "unlimited" ? "∞" : limit,
    windowStart,
    windowCount,
  };
}

function FREE_LIMIT_FOR(tier) {
  if (tier === "pro") return 999;
  return FREE_LIMIT;
}

module.exports = {
  usersStore,
  getUser,
  saveUser,
  computeStatus,
  FREE_LIMIT,
  WINDOW_MS,
};

