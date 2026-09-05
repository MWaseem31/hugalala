// ===== EDIT THESE 4 to match your public GitHub repo =====
const GH_OWNER = "your-github-username";
const GH_REPO = "your-repo-name";
const GH_BRANCH = "main";
const GH_PATH = "site/encrypted";
// ===========================================================

// ===== Crypto config (must match encrypt.py exactly) =====
const ITERATIONS = 210000;
const SALT_LEN = 16;
const NONCE_LEN = 12;

const LIST_URL = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${GH_PATH}?ref=${GH_BRANCH}`;
const FILE_URL = (name) =>
  `https://raw.githubusercontent.com/${GH_OWNER}/${GH_REPO}/${GH_BRANCH}/${GH_PATH}/${encodeURIComponent(name)}`;

// ===== DOM =====
const lockScreen = document.getElementById("lockScreen");
const gallery = document.getElementById("gallery");
const asadInput = document.getElementById("asadWords");
const haniyaInput = document.getElementById("haniyaWords");
const unlockBtn = document.getElementById("unlockBtn");
const btnText = unlockBtn.querySelector(".btn-text");
const btnSpinner = unlockBtn.querySelector(".btn-spinner");
const errorMsg = document.getElementById("errorMsg");
const heartLock = document.getElementById("heartLock");
const galleryGrid = document.getElementById("galleryGrid");
const galleryLoading = document.getElementById("galleryLoading");
const lockAgainBtn = document.getElementById("lockAgainBtn");
const floatingHearts = document.getElementById("floatingHearts");

const lightbox = document.getElementById("lightbox");
const lbStage = document.getElementById("lbStage");
const lbClose = document.getElementById("lbClose");
const lbPrev = document.getElementById("lbPrev");
const lbNext = document.getElementById("lbNext");

let cachedPassphrase = null; // held only in memory, never persisted
let decryptedItems = [];     // { url, type, title }
let lbIndex = 0;

const VIDEO_EXT = [".mp4", ".mov", ".webm", ".mkv"];

// ===== Crypto helpers (must mirror the Python encryption script) =====
async function deriveKey(passphrase, salt) {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
}

async function decryptBuffer(buffer, passphrase) {
  const bytes = new Uint8Array(buffer);
  const salt = bytes.slice(0, SALT_LEN);
  const nonce = bytes.slice(SALT_LEN, SALT_LEN + NONCE_LEN);
  const ciphertext = bytes.slice(SALT_LEN + NONCE_LEN);
  const key = await deriveKey(passphrase, salt);
  return crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, key, ciphertext);
}

function normalizeWords(raw) {
  return raw.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

function mimeFor(filename) {
  const ext = filename.split(".").pop().toLowerCase();
  const map = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
    gif: "image/gif", webp: "image/webp", heic: "image/heic",
    mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm"
  };
  return map[ext] || "application/octet-stream";
}

// Fetch the live file list straight from the public GitHub repo folder.
async function fetchManifest() {
  const res = await fetch(LIST_URL, { cache: "no-store" });
  if (!res.ok) throw new Error("GitHub list failed: " + res.status);
  const items = await res.json();
  return (Array.isArray(items) ? items : [])
    .filter((it) => it.type === "file" && it.name.endsWith(".enc"))
    .map((it) => {
      const original = it.name.replace(/\.enc$/, "");
      const dot = original.lastIndexOf(".");
      const ext = dot >= 0 ? original.slice(dot).toLowerCase() : "";
      return { file: it.name, type: VIDEO_EXT.includes(ext) ? "video" : "image", title: original };
    });
}

// ===== Unlock flow =====
unlockBtn.addEventListener("click", async () => {
  errorMsg.hidden = true;
  const asadWords = normalizeWords(asadInput.value);
  const haniyaWords = normalizeWords(haniyaInput.value);

  if (asadWords.length !== 12 || haniyaWords.length !== 12) {
    showError("Please enter exactly 12 words in each field.");
    return;
  }

  const passphrase = [...asadWords, ...haniyaWords].join(" ");

  setLoading(true);
  try {
    const manifest = await fetchManifest();
    if (!manifest.length) throw new Error("no encrypted files found");

    const testRes = await fetch(FILE_URL(manifest[0].file), { cache: "no-store" });
    if (!testRes.ok) throw new Error("first file fetch failed: " + testRes.status);
    const testBuf = await testRes.arrayBuffer();
    await decryptBuffer(testBuf, passphrase); // throws on wrong passphrase

    cachedPassphrase = passphrase;
    playUnlockAnimation();
    setTimeout(() => revealGallery(manifest), 700);
  } catch (err) {
    console.error(err);
    showError("Wrong seed phrase. Please check both fields and try again.");
    setLoading(false);
  }
});

function showError(msg) {
  errorMsg.textContent = msg;
  errorMsg.hidden = false;
}

function setLoading(isLoading) {
  unlockBtn.disabled = isLoading;
  btnSpinner.hidden = !isLoading;
  btnText.textContent = isLoading ? "Unlocking…" : "Unlock Our Story";
}

function playUnlockAnimation() {
  heartLock.classList.add("unlocking");
}

async function revealGallery(manifest) {
  lockScreen.style.display = "none";
  gallery.hidden = false;
  galleryGrid.innerHTML = "";
  galleryLoading.hidden = false;
  decryptedItems = [];

  let i = 0;
  for (const item of manifest) {
    try {
      const res = await fetch(FILE_URL(item.file), { cache: "no-store" });
      const buf = await res.arrayBuffer();
      const plainBuf = await decryptBuffer(buf, cachedPassphrase);
      const mime = mimeFor(item.title || item.file);
      const blob = new Blob([plainBuf], { type: mime });
      const url = URL.createObjectURL(blob);
      const index = decryptedItems.push({ url, type: item.type, title: item.title }) - 1;

      const card = document.createElement("div");
      card.className = "media-card";
      card.style.animationDelay = `${(i % 20) * 0.05}s`;
      card.dataset.index = index;

      const mediaEl = item.type === "video"
        ? `<video src="${url}" muted playsinline preload="metadata" controlsList="nodownload noremoteplayback noplaybackrate" disablePictureInPicture oncontextmenu="return false"></video>`
        : `<img src="${url}" alt="wedding memory" loading="lazy" draggable="false" oncontextmenu="return false">`;

      card.innerHTML = `
        ${mediaEl}
        <span class="zoom-icon">
          <svg viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.8"/><path d="M21 21l-4.3-4.3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        </span>`;
      card.addEventListener("click", () => openLightbox(index));
      galleryGrid.appendChild(card);
      i++;
    } catch (e) {
      console.error("Failed to decrypt", item.file, e);
    }
  }
  galleryLoading.hidden = true;
}

lockAgainBtn.addEventListener("click", () => {
  decryptedItems.forEach(it => URL.revokeObjectURL(it.url));
  cachedPassphrase = null;
  location.reload();
});

// ===== Lightbox: open/close/navigate =====
function openLightbox(index) {
  lbIndex = index;
  renderLightboxItem();
  lightbox.hidden = false;
}
function closeLightbox() {
  lightbox.hidden = true;
  lbStage.innerHTML = "";
}
function showNext() { lbIndex = (lbIndex + 1) % decryptedItems.length; renderLightboxItem(); }
function showPrev() { lbIndex = (lbIndex - 1 + decryptedItems.length) % decryptedItems.length; renderLightboxItem(); }

let lbScale = 1, lbPosX = 0, lbPosY = 0;

function renderLightboxItem() {
  lbScale = 1; lbPosX = 0; lbPosY = 0;
  const item = decryptedItems[lbIndex];
  lbStage.innerHTML = item.type === "video"
    ? `<video src="${item.url}" controls autoplay playsinline controlsList="nodownload noremoteplayback" disablePictureInPicture oncontextmenu="return false"></video>`
    : `<img src="${item.url}" alt="wedding memory" draggable="false" oncontextmenu="return false">`;
  attachZoomHandlers(lbStage.firstElementChild);
}

function applyTransform(el) {
  el.style.transform = `translate(${lbPosX}px, ${lbPosY}px) scale(${lbScale})`;
}

function attachZoomHandlers(el) {
  if (!el) return;

  let lastTap = 0;
  el.addEventListener("click", () => {
    const now = Date.now();
    if (now - lastTap < 300) {
      lbScale = lbScale > 1 ? 1 : 2.4;
      lbPosX = 0; lbPosY = 0;
      applyTransform(el);
    }
    lastTap = now;
  });

  el.addEventListener("wheel", (e) => {
    e.preventDefault();
    lbScale = Math.min(4, Math.max(1, lbScale - e.deltaY * 0.0015));
    applyTransform(el);
  }, { passive: false });

  let startDist = 0, startScale = 1, dragging = false, lastX = 0, lastY = 0;

  el.addEventListener("touchstart", (e) => {
    if (e.touches.length === 2) {
      startDist = getDist(e.touches);
      startScale = lbScale;
    } else if (e.touches.length === 1 && lbScale > 1) {
      dragging = true;
      lastX = e.touches[0].clientX;
      lastY = e.touches[0].clientY;
    }
  }, { passive: true });

  el.addEventListener("touchmove", (e) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dist = getDist(e.touches);
      lbScale = Math.min(4, Math.max(1, startScale * (dist / startDist)));
      applyTransform(el);
    } else if (dragging && e.touches.length === 1) {
      const dx = e.touches[0].clientX - lastX;
      const dy = e.touches[0].clientY - lastY;
      lbPosX += dx; lbPosY += dy;
      lastX = e.touches[0].clientX;
      lastY = e.touches[0].clientY;
      applyTransform(el);
    }
  }, { passive: false });

  el.addEventListener("touchend", () => { dragging = false; });
}

function getDist(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy);
}

lbClose.addEventListener("click", closeLightbox);
lbNext.addEventListener("click", showNext);
lbPrev.addEventListener("click", showPrev);
lightbox.addEventListener("click", (e) => { if (e.target === lightbox) closeLightbox(); });
document.addEventListener("keydown", (e) => {
  if (lightbox.hidden) return;
  if (e.key === "Escape") closeLightbox();
  if (e.key === "ArrowRight") showNext();
  if (e.key === "ArrowLeft") showPrev();
});

// ===== Floating hearts background animation =====
function spawnHeart() {
  const heart = document.createElement("span");
  heart.className = "heart";
  heart.textContent = "❤";
  heart.style.left = Math.random() * 100 + "vw";
  heart.style.fontSize = 12 + Math.random() * 16 + "px";
  const duration = 10 + Math.random() * 10;
  heart.style.animationDuration = duration + "s";
  floatingHearts.appendChild(heart);
  setTimeout(() => heart.remove(), duration * 1000);
}
setInterval(spawnHeart, 900);

// ===== Best-effort anti-download deterrents =====
// NOTE: none of this can block OS-level screenshots or screen recording —
// that requires native-app DRM (like Widevine on Netflix), not something a
// website can do. These only discourage casual right-click / drag / long-press saving.
document.addEventListener("contextmenu", (e) => {
  if (e.target.closest(".media-card, .lb-stage")) e.preventDefault();
});
document.addEventListener("dragstart", (e) => {
  if (e.target.tagName === "IMG" || e.target.tagName === "VIDEO") e.preventDefault();
});
document.addEventListener("keydown", (e) => {
  const blocked = (e.ctrlKey || e.metaKey) && ["s", "u", "p"].includes(e.key.toLowerCase());
  if (blocked) e.preventDefault();
});
document.addEventListener("visibilitychange", () => {
  if (!gallery.hidden) {
    gallery.style.filter = document.hidden ? "blur(24px)" : "";
  }
});
