const { getSessionFromEvent } = require("./_lib/session");
const { getUser } = require("./_lib/store");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };

  const session = getSessionFromEvent(event);
  if (!session) return { statusCode: 401, body: JSON.stringify({ error: "Belum login" }) };

  const user = await getUser(session.discordId);
  if (!user.roblox) {
    return { statusCode: 400, body: JSON.stringify({ error: "Hubungkan akun Roblox terlebih dahulu." }) };
  }

  const { audioUrl, groupId, title } = JSON.parse(event.body || "{}");
  if (!audioUrl) return { statusCode: 400, body: JSON.stringify({ error: "audioUrl kosong dari hasil konversi." }) };

  try {
    // 1) Fetch the converted file from your VPS backend
    const fileRes = await fetch(audioUrl);
    if (!fileRes.ok) throw new Error("Gagal mengambil file hasil konversi dari VPS.");
    const fileBuffer = Buffer.from(await fileRes.arrayBuffer());

    // 2) Build Open Cloud request
    const effectiveGroupId = groupId || user.roblox.groupId;
    const creationContext = effectiveGroupId
      ? { creator: { groupId: String(effectiveGroupId) } }
      : { creator: { userId: String(user.roblox.userId) } };

    const requestJson = {
      assetType: "Audio",
      displayName: (title || "NOTBAD KREASI Audio").slice(0, 50),
      description: "Diunggah lewat NOTBAD KREASI",
      creationContext,
    };

    const form = new FormData();
    form.append("request", JSON.stringify(requestJson));
    form.append("fileContent", new Blob([fileBuffer]), "audio.mp3");

    const uploadRes = await fetch("https://apis.roblox.com/assets/v1/assets", {
      method: "POST",
      headers: { "x-api-key": user.roblox.apiKey },
      body: form,
    });
    const uploadData = await uploadRes.json();
    if (!uploadRes.ok) {
      throw new Error(uploadData.message || "Roblox menolak upload (periksa API Key & izin).");
    }

    // 3) Poll the operation until Roblox finishes processing the asset
    const opId = uploadData.path ? uploadData.path.split("/").pop() : uploadData.operationId;
    let assetId = null;
    for (let i = 0; i < 15 && !assetId; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      const opRes = await fetch(`https://apis.roblox.com/assets/v1/operations/${opId}`, {
        headers: { "x-api-key": user.roblox.apiKey },
      });
      const opData = await opRes.json();
      if (opData.done && opData.response && opData.response.assetId) {
        assetId = opData.response.assetId;
      }
    }

    if (!assetId) throw new Error("Upload masih diproses Roblox, coba cek lagi sebentar lagi.");

    return { statusCode: 200, body: JSON.stringify({ assetId, soundId: `rbxassetid://${assetId}` }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
