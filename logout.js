const { clearCookieHeader } = require("./_lib/session");

exports.handler = async () => ({
  statusCode: 200,
  headers: { "Set-Cookie": clearCookieHeader() },
  body: JSON.stringify({ ok: true }),
});
