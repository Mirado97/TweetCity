/**
 * oauthStore — JSON-based persistent storage for Twitter OAuth tokens.
 *
 * Schema (keyed by lowercased cityHandle):
 *   {
 *     "miradonas": {
 *       twitterUserId: "1496466525452128259",
 *       accessToken:   "...",
 *       refreshToken:  "...",
 *       expiresAt:     1748600000000,   // ms epoch
 *       scope:         "tweet.read users.read like.read offline.access",
 *       updatedAt:     "2026-05-30T12:34:56.789Z"
 *     }
 *   }
 *
 * Storage path: $OAUTH_DATA_DIR/oauth.json (default backend/data/oauth.json).
 * On Railway mount a Volume to /data and set OAUTH_DATA_DIR=/data.
 *
 * Writes are atomic: write to .tmp, fsync, rename — crash-safe.
 */

const fs = require("node:fs");
const path = require("node:path");

const DATA_DIR  = process.env.OAUTH_DATA_DIR || path.join(__dirname, "..", "..", "data");
const FILE_PATH = path.join(DATA_DIR, "oauth.json");
const TMP_PATH  = FILE_PATH + ".tmp";

let cache = null; // { [cityHandle]: record }

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function load() {
  if (cache) return cache;
  ensureDir();
  if (!fs.existsSync(FILE_PATH)) {
    cache = {};
    return cache;
  }
  try {
    const raw = fs.readFileSync(FILE_PATH, "utf8");
    cache = JSON.parse(raw || "{}");
  } catch (e) {
    console.error(`[oauthStore] failed to parse ${FILE_PATH}: ${e.message} — starting empty`);
    cache = {};
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

function key(handle) {
  return String(handle || "").toLowerCase().replace(/^@/, "");
}

function get(handle) {
  return load()[key(handle)] || null;
}

function all() {
  return Object.entries(load()).map(([cityHandle, rec]) => ({ cityHandle, ...rec }));
}

function upsert(handle, patch) {
  const h = key(handle);
  if (!h) throw new Error("upsert: empty cityHandle");
  load();
  cache[h] = { ...(cache[h] || {}), ...patch, updatedAt: new Date().toISOString() };
  persist();
  return cache[h];
}

function remove(handle) {
  const h = key(handle);
  load();
  if (cache[h]) {
    delete cache[h];
    persist();
    return true;
  }
  return false;
}

module.exports = { get, all, upsert, remove, _path: FILE_PATH };
