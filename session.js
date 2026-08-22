const crypto = require("crypto");

const SECRET = process.env.SESSION_SECRET || "";
const COOKIE_NAME = "nb_session";

function sign(payloadObj) {
  const payload = Buffer.from(JSON.stringify(payloadObj)).toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

function verify(token) {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function parseCookies(header) {
  const out = {};
  (header || "").split(";").forEach((p) => {
    const [k, ...v] = p.trim().split("=");
    if (k) out[k] = decodeURIComponent(v.join("="));
  });
  return out;
}

function getSessionFromEvent(event) {
  const cookies = parseCookies(event.headers.cookie);
  return verify(cookies[COOKIE_NAME]);
}

function setCookieHeader(payloadObj, maxAgeSeconds = 60 * 60 * 24 * 30) {
  const token = sign(payloadObj);
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

function clearCookieHeader() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

module.exports = { getSessionFromEvent, setCookieHeader, clearCookieHeader, sign, verify };
