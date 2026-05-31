const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const DATA_DIR = process.env.OAUTH_DATA_DIR || path.join(__dirname, "..", "..", "data");
const FILE_PATH = path.join(DATA_DIR, "market-listings.json");
const TMP_PATH = FILE_PATH + ".tmp";

let cache = null;

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function load() {
  if (cache) return cache;
  ensureDir();
  try {
    cache = JSON.parse(fs.readFileSync(FILE_PATH, "utf8"));
    if (!Array.isArray(cache)) cache = [];
  } catch {
    cache = [];
  }
  return cache;
}

function persist() {
  ensureDir();
  const fd = fs.openSync(TMP_PATH, "w");
  try {
    fs.writeFileSync(fd, JSON.stringify(cache, null, 2));
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(TMP_PATH, FILE_PATH);
}

function cleanUrl(url) {
  const s = String(url || "").trim();
  if (!s) return "";
  try {
    const u = new URL(s);
    if (!/^https?:$/.test(u.protocol)) return "";
    return u.toString();
  } catch {
    return "";
  }
}

function list() {
  return load()
    .filter((x) => x && x.active !== false)
    .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
}

function upsert({ kind, tokenId, ownerAddress, twitterHandle, followers, postUrl }) {
  load();
  const normalizedKind = kind === "resident" ? "resident" : "administrator";
  const token = String(tokenId);
  const post = normalizedKind === "resident" ? cleanUrl(postUrl) : "";
  if (normalizedKind === "resident" && !post) throw new Error("Valid postUrl required");

  const existing = cache.find((x) =>
    x.active !== false &&
    x.kind === normalizedKind &&
    String(x.tokenId) === token &&
    (normalizedKind === "administrator" || x.postUrl === post)
  );

  const now = new Date().toISOString();
  const patch = {
    kind: normalizedKind,
    tokenId: token,
    ownerAddress: String(ownerAddress || "").toLowerCase(),
    twitterHandle: String(twitterHandle || "").replace(/^@/, ""),
    followers: Number(followers || 0),
    postUrl: post,
    active: true,
    updatedAt: now,
  };

  if (existing) {
    Object.assign(existing, patch);
    persist();
    return existing;
  }

  const rec = { id: crypto.randomUUID(), ...patch, createdAt: now };
  cache.push(rec);
  persist();
  return rec;
}

function deactivate(id, ownerAddress) {
  load();
  const rec = cache.find((x) => x.id === id && x.active !== false);
  if (!rec) return false;
  if (ownerAddress && rec.ownerAddress !== String(ownerAddress).toLowerCase()) {
    const err = new Error("Not listing owner");
    err.status = 403;
    throw err;
  }
  rec.active = false;
  rec.updatedAt = new Date().toISOString();
  persist();
  return true;
}

module.exports = { list, upsert, deactivate, _path: FILE_PATH };
