// ===== Config (must match encrypt.py exactly) =====
const ITERATIONS = 210000;
const SALT_LEN = 16;
const NONCE_LEN = 12;
const MANIFEST_URL = "encrypted/manifest.json";

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

let cachedPassphrase = null; // held only in memory, never persisted

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
  // Throws if the passphrase/key is wrong (AES-GCM auth tag check)
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
    const manifestRes = await fetch(MANIFEST_URL, { cache: "no-store" });
    if (!manifestRes.ok) throw new Error("manifest fetch failed");
    const manifest = await manifestRes.json();
    if (!manifest.length) throw new Error("empty manifest");

    // Test-decrypt the first file to validate the passphrase before revealing anything
    const testRes = await fetch(`encrypted/${manifest[0].file}`, { cache: "no-store" });
    const testBuf = await testRes.arrayBuffer();
    await decryptBuffer(testBuf, passphrase); // throws on wrong passphrase

    cachedPassphrase = passphrase;
    playUnlockAnimation();
    setTimeout(() => revealGallery(manifest), 700);
  } catch (err) {
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

  for (const item of manifest) {
    try {
      const res = await fetch(`encrypted/${item.file}`, { cache: "no-store" });
      const buf = await res.arrayBuffer();
      const plainBuf = await decryptBuffer(buf, cachedPassphrase);
      const mime = mimeFor(item.title || item.file);
      const blob = new Blob([plainBuf], { type: mime });
      const url = URL.createObjectURL(blob);

      const card = document.createElement("div");
      card.className = "media-card";
      if (item.type === "video") {
        card.innerHTML = `<video src="${url}" controls playsinline></video>`;
      } else {
        card.innerHTML = `<img src="${url}" alt="wedding memory" loading="lazy">`;
      }
      galleryGrid.appendChild(card);
    } catch (e) {
      console.error("Failed to decrypt", item.file, e);
    }
  }
  galleryLoading.hidden = true;
}

lockAgainBtn.addEventListener("click", () => {
  // Clear in-memory secrets and object URLs, reload for a clean state
  cachedPassphrase = null;
  location.reload();
});
