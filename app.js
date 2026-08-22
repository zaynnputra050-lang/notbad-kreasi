// =====================================================================
// NOTBAD KREASI — frontend logic
// Netlify Functions handle: Discord login, session, Pro/limit tracking,
// Roblox Open Cloud upload.
// Your own VPS backend handles: YouTube/SoundCloud search+import and the
// actual audio conversion. Set its base URL below.
// =====================================================================
const CONFIG = {
  // TODO: ganti dengan alamat VPS backend kamu sendiri (search/import/convert)
  VPS_API_BASE: "/.netlify/functions/vps-proxy?path=/api",
};

const $ = (id) => document.getElementById(id);

let state = {
  user: null,          // {id, username, avatar, tier, isOwner}
  status: null,        // {converted, remaining, limit}
  importedTrack: null, // {sourceUrl, title} from VPS import
  file: null,          // File object from drop zone
  robloxConnected: false,
};

// ---------------------------------------------------------------- AUTH
async function loadSession() {
  try {
    const res = await fetch("/.netlify/functions/me", { credentials: "include" });
    if (!res.ok) return renderLoggedOut();
    const data = await res.json();
    state.user = data.user;
    state.status = data.status;
    renderLoggedIn();
  } catch (e) {
    renderLoggedOut();
  }
}

function renderLoggedOut() {
  $("userPanel").classList.add("hidden");
  $("ownerPanel").classList.add("hidden");
  $("authArea").innerHTML = `
    <button id="discordLoginBtn" class="btn btn-discord">Login Discord</button>`;
  $("discordLoginBtn").onclick = () => {
    window.location.href = "/.netlify/functions/discord-login";
  };
  applyTierLocks("free");
}

function renderLoggedIn() {
  const u = state.user, s = state.status;
  $("authArea").innerHTML = `<button id="logoutBtn" class="btn btn-mini">Keluar</button>`;
  $("logoutBtn").onclick = async () => {
    await fetch("/.netlify/functions/logout", { method: "POST", credentials: "include" });
    location.reload();
  };

  $("userPanel").classList.remove("hidden");
  $("userAvatar").src = u.avatar || "https://cdn.discordapp.com/embed/avatars/0.png";
  $("userName").textContent = u.username;
  const tagEl = $("userTag");
  tagEl.textContent = u.tier === "unlimited" ? "Unlimited" : u.tier === "pro" ? "Pro" : "Free";
  tagEl.className = "tag " + (u.tier !== "free" ? u.tier : "");

  $("statConverted").textContent = s.converted;
  $("statRemaining").textContent = u.tier === "unlimited" ? "∞" : s.remaining;
  $("statLimit").textContent = u.tier === "unlimited" ? "∞" : s.limit;

  if (u.isOwner) $("ownerPanel").classList.remove("hidden");

  applyTierLocks(u.tier);
  updateConvertButtonState();
}

function applyTierLocks(tier) {
  const isPro = tier === "pro" || tier === "unlimited";
  $("presetsLock").classList.toggle("hidden", isPro);
}

// -------------------------------------------------------- OWNER: GIFT
$("giftBtn")?.addEventListener("click", async () => {
  const targetId = $("giftUserId").value.trim();
  const tier = $("giftTier").value;
  if (!targetId) return;
  $("giftResult").textContent = "Memproses...";
  try {
    const res = await fetch("/.netlify/functions/gift-pro", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetId, tier }),
    });
    const data = await res.json();
    $("giftResult").textContent = res.ok
      ? `✅ ${targetId} sekarang ${tier}.`
      : `❌ ${data.error || "Gagal."}`;
  } catch {
    $("giftResult").textContent = "❌ Gagal terhubung ke server.";
  }
});

// ----------------------------------------------------- IMPORT (tabs)
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    $("tabLink").classList.toggle("hidden", btn.dataset.tab !== "link");
    $("tabSearch").classList.toggle("hidden", btn.dataset.tab !== "search");
  });
});

$("linkImportBtn").addEventListener("click", async () => {
  const url = $("linkInput").value.trim();
  if (!url) return;
  await importFromUrl(url);
});

$("searchBtn").addEventListener("click", doSearch);
$("searchInput").addEventListener("keydown", (e) => { if (e.key === "Enter") doSearch(); });

async function doSearch() {
  const q = $("searchInput").value.trim();
  if (!q) return;
  const box = $("searchResults");
  box.innerHTML = `<p class="hint">Mencari...</p>`;
  try {
    // Calls your own VPS backend — expects JSON: [{id,title,channel,thumbnail,url}]
    const res = await fetch(`${CONFIG.VPS_API_BASE}/search?q=${encodeURIComponent(q)}`);
    const results = await res.json();
    if (!Array.isArray(results) || !results.length) {
      box.innerHTML = `<p class="hint">Tidak ada hasil.</p>`;
      return;
    }
    box.innerHTML = "";
    results.forEach((r) => {
      const row = document.createElement("div");
      row.className = "result-row";
      row.innerHTML = `
        <img class="result-thumb" src="${r.thumbnail || ""}" alt="">
        <div class="result-meta">
          <p class="result-title">${escapeHtml(r.title)}</p>
          <p class="result-sub">${escapeHtml(r.channel || "")}</p>
        </div>
        <div class="result-actions">
          <a class="btn btn-watch" href="${r.url}" target="_blank" rel="noopener">▶ Tonton</a>
          <button class="btn btn-import">⬇ Import</button>
        </div>`;
      row.querySelector(".btn-import").addEventListener("click", () => importFromUrl(r.url, r.title));
      box.appendChild(row);
    });
  } catch (e) {
    box.innerHTML = `<p class="hint">❌ Gagal menghubungi server pencarian.</p>`;
  }
}

async function importFromUrl(url, title) {
  try {
    // Calls your own VPS backend — expects JSON: {sourceUrl, title}
    const res = await fetch(`${CONFIG.VPS_API_BASE}/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    state.importedTrack = { sourceUrl: data.sourceUrl || url, title: data.title || title || url };
    state.file = null;
    $("fileName").textContent = `🎵 Diimpor: ${state.importedTrack.title}`;
    updateConvertButtonState();
  } catch (e) {
    alert("Gagal mengimpor. Periksa link atau coba lagi.");
  }
}

// -------------------------------------------------------- LOAD FILE
const dropZone = $("dropZone");
["dragover", "dragleave", "drop"].forEach((evt) => {
  dropZone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropZone.classList.toggle("dragover", evt === "dragover");
  });
});
dropZone.addEventListener("drop", (e) => {
  const f = e.dataTransfer.files[0];
  if (f) handleFile(f);
});
$("fileInput").addEventListener("change", (e) => {
  if (e.target.files[0]) handleFile(e.target.files[0]);
});
function handleFile(f) {
  if (f.size > 10 * 1024 * 1024) {
    alert("File melebihi batas 10MB.");
    return;
  }
  state.file = f;
  state.importedTrack = null;
  $("fileName").textContent = `📄 ${f.name}`;
  updateConvertButtonState();
}

// -------------------------------------------------------- SETTINGS
const speedRange = $("speedRange");
speedRange.addEventListener("input", updateSpeedUI);
function updateSpeedUI() {
  const v = parseFloat(speedRange.value);
  $("speedVal").textContent = v.toFixed(2) + "×";
  // In Roblox, sound PlaybackSpeed is inverse of "how fast the track was rendered"
  // relative to original — i.e. to hear the sped-up file at normal game pace,
  // divide 1 by the render speed.
  const gameSpeed = 1 / v;
  $("ingameSpeed").textContent = gameSpeed.toFixed(2) + "×";
  $("ingameDesc").innerHTML =
    `Speed ${v.toFixed(2)}× → set Roblox ke ${gameSpeed.toFixed(2)}×<br>= ${Math.round(gameSpeed * 100)}% dari original`;
}
updateSpeedUI();

const ampRange = $("ampRange");
ampRange.addEventListener("input", () => {
  $("ampVal").textContent = parseFloat(ampRange.value).toFixed(1) + "×";
});

$("chStereo").addEventListener("click", () => {
  $("chStereo").classList.add("active");
  $("chMono").classList.remove("active");
});
$("chMono").addEventListener("click", () => {
  $("chMono").classList.add("active");
  $("chStereo").classList.remove("active");
});

// -------------------------------------------------------- ROBLOX CONNECT
$("robloxConnectBtn").addEventListener("click", async () => {
  const userId = $("robloxUserId").value.trim();
  const groupId = $("robloxGroupId").value.trim();
  const apiKey = $("robloxApiKey").value.trim();
  if (!userId || !apiKey) {
    $("robloxConnectResult").textContent = "❌ Roblox User ID dan API Key wajib diisi.";
    return;
  }
  $("robloxConnectResult").textContent = "Menyimpan...";
  try {
    const res = await fetch("/.netlify/functions/roblox-connect", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, groupId, apiKey }),
    });
    const data = await res.json();
    if (res.ok) {
      state.robloxConnected = true;
      $("robloxConnectResult").textContent = "✅ Roblox terhubung dan tersimpan.";
    } else {
      $("robloxConnectResult").textContent = `❌ ${data.error || "Gagal menyimpan."}`;
    }
  } catch {
    $("robloxConnectResult").textContent = "❌ Gagal terhubung ke server.";
  }
  updateConvertButtonState();
});

// -------------------------------------------------------- CONVERT
function updateConvertButtonState() {
  const hasSource = !!(state.file || state.importedTrack);
  $("convertBtn").disabled = !hasSource;
}

// ---- progress bar helpers ----
const progressBox = $("progressBox");
const progressFill = $("progressFill");
const progressStage = $("progressStage");
const progressPct = $("progressPct");

function showProgress() {
  progressBox.classList.remove("hidden");
  setProgress(0, "Menyiapkan...");
}
function hideProgress() {
  progressBox.classList.add("hidden");
  progressFill.classList.remove("indeterminate", "error");
}
function setProgress(pct, label) {
  progressFill.classList.remove("indeterminate");
  progressFill.style.width = Math.max(0, Math.min(100, pct)) + "%";
  progressPct.textContent = Math.round(pct) + "%";
  if (label) progressStage.textContent = label;
}
function setProgressIndeterminate(label) {
  progressFill.classList.add("indeterminate");
  progressPct.textContent = "…";
  if (label) progressStage.textContent = label;
}
function setProgressError(label) {
  progressFill.classList.remove("indeterminate");
  progressFill.classList.add("error");
  progressStage.textContent = label || "Gagal.";
}

// Uploads with real upload-progress via XHR (fetch can't report upload %).
// Optionally polls a job status endpoint on the VPS if it returns a jobId,
// for genuine real-time conversion progress. Falls back to an indeterminate
// bar if the VPS only returns the final result directly.
function xhrConvert(form, onUploadProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${CONFIG.VPS_API_BASE}/convert`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onUploadProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText)); }
        catch { reject(new Error("Respons konversi tidak valid.")); }
      } else {
        reject(new Error("Konversi gagal di server (status " + xhr.status + ")."));
      }
    };
    xhr.onerror = () => reject(new Error("Gagal terhubung ke server konversi (VPS)."));
    xhr.send(form);
  });
}

// Optional: if your VPS returns { jobId } instead of finishing immediately,
// it should expose GET {VPS}/convert/status/:jobId → { status, progress, downloadUrl }
// where progress is 0-100 and status is "processing" | "done" | "error".
async function pollConvertJob(jobId, onProgress) {
  for (let i = 0; i < 120; i++) {
    const res = await fetch(`${CONFIG.VPS_API_BASE}/convert/status/${jobId}`);
    const data = await res.json();
    if (data.status === "done") return data;
    if (data.status === "error") throw new Error(data.error || "Konversi gagal di server.");
    onProgress(typeof data.progress === "number" ? data.progress : null);
    await new Promise((r) => setTimeout(r, 1200));
  }
  throw new Error("Konversi memakan waktu terlalu lama.");
}

$("convertBtn").addEventListener("click", async () => {
  if (!state.user) {
    alert("Login Discord dulu sebelum konversi.");
    return;
  }
  const btn = $("convertBtn");
  btn.disabled = true;
  $("convertResult").classList.add("hidden");
  showProgress();

  try {
    // 1) Reserve a conversion slot (enforces free-tier 0/3 per 12h server-side)
    setProgress(3, "Memeriksa limit...");
    const reserve = await fetch("/.netlify/functions/track-convert", {
      method: "POST",
      credentials: "include",
    });
    if (!reserve.ok) {
      const err = await reserve.json();
      setProgressError(err.error || "Limit konversi tercapai.");
      alert(err.error || "Limit konversi tercapai. Coba lagi nanti atau upgrade ke Pro.");
      return;
    }

    const settings = {
      format: $("formatSelect").value,
      bitrate: $("bitrateSelect").value,
      speed: parseFloat(speedRange.value),
      amplify: parseFloat(ampRange.value),
      channels: $("chMono").classList.contains("active") ? "mono" : "stereo",
      normalize: $("normalizeCheck").checked,
    };

    // 2) Send to your own VPS backend — real upload progress mapped to 5-40%
    const form = new FormData();
    if (state.file) form.append("file", state.file);
    if (state.importedTrack) form.append("sourceUrl", state.importedTrack.sourceUrl);
    form.append("settings", JSON.stringify(settings));

    setProgress(5, "Mengunggah sumber audio...");
    const convertData = await xhrConvert(form, (frac) => {
      setProgress(5 + frac * 35, "Mengunggah sumber audio...");
    });

    let downloadUrl = convertData.downloadUrl;

    if (convertData.jobId && !downloadUrl) {
      // VPS is processing asynchronously — poll for real progress (40-75%)
      const finalData = await pollConvertJob(convertData.jobId, (pct) => {
        if (pct !== null) setProgress(40 + (pct / 100) * 35, "Memproses audio di server...");
        else setProgressIndeterminate("Memproses audio di server...");
      });
      downloadUrl = finalData.downloadUrl;
    } else {
      // VPS returned everything synchronously — no granular progress available
      setProgress(70, "Audio selesai diproses...");
    }

    if (!downloadUrl) throw new Error("Server konversi tidak mengembalikan file hasil.");

    // 3) Upload the converted audio to Roblox via our Netlify function
    setProgress(78, "Mengunggah ke Roblox...");
    const uploadPromise = fetch("/.netlify/functions/roblox-upload", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        audioUrl: downloadUrl,
        groupId: $("robloxGroupId").value.trim() || null,
        title: (state.importedTrack && state.importedTrack.title) || (state.file && state.file.name) || "NOTBAD KREASI Audio",
      }),
    });

    // Roblox asset processing happens after upload — nudge the bar forward
    // while we wait, since that step polls Roblox internally (~1.5s x up to 15).
    let simPct = 78;
    const simInterval = setInterval(() => {
      simPct = Math.min(simPct + 1.2, 97);
      setProgress(simPct, "Menunggu Roblox memproses aset...");
    }, 500);

    const uploadRes = await uploadPromise;
    clearInterval(simInterval);
    const uploadData = await uploadRes.json();
    if (!uploadRes.ok) throw new Error(uploadData.error || "Upload ke Roblox gagal.");

    setProgress(100, "Selesai!");
    $("assetIdOut").textContent = uploadData.assetId;
    $("convertResult").classList.remove("hidden");
    await loadSession(); // refresh remaining count
    setTimeout(hideProgress, 1500);
  } catch (e) {
    setProgressError(e.message || "Terjadi kesalahan.");
    alert(e.message || "Terjadi kesalahan.");
  } finally {
    updateConvertButtonState();
  }
});

$("copyAssetId").addEventListener("click", () => {
  navigator.clipboard.writeText($("assetIdOut").textContent);
  $("copyAssetId").textContent = "Tersalin!";
  setTimeout(() => ($("copyAssetId").textContent = "Salin"), 1500);
});

function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

loadSession();
