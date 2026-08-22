const VPS = "http://195.88.211.66";

exports.handler = async (event) => {
  const params = event.queryStringParameters || {};
  const path = params.path || "/";

  // Ambil query lain, misalnya q=DJ, lalu teruskan ke VPS
  const query = new URLSearchParams(params);
  query.delete("path");

  const url =
    `${VPS}${path}` +
    (query.toString() ? `?${query.toString()}` : "");

  try {
    const response = await fetch(url, {
      method: event.httpMethod,
      headers: {
        "Content-Type":
          event.headers["content-type"] || "application/json",
      },
      body: ["GET", "HEAD"].includes(event.httpMethod)
        ? undefined
        : event.body,
    });

    const body = await response.text();

    return {
      statusCode: response.status,
      headers: {
        "Content-Type":
          response.headers.get("content-type") || "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body,
    };
  } catch (error) {
    return {
      statusCode: 502,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        error: "VPS tidak dapat dihubungi",
        detail: error.message,
      }),
    };
  }
};