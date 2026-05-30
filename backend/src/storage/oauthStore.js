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
const crypto = require("node:crypto");

const DATA_DIR  = process.env.OAUTH_DATA_DIR || path.join(__dirname, "..", "..", "data");
const FILE_PATH = path.join(DATA_DIR, "oauth.json");
const TMP_PATH  = FILE_PATH + ".tmp";

let cache = null; // { [cityHandle]: record }

const ENC_PREFIX = "enc:v1:";
const TOKEN_FIELDS = ["accessToken", "refreshToken"];

function getTokenKey() {
  const raw = process.env.OAUTH_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("OAUTH_TOKEN_ENCRYPTION_KEY must be set to store OAuth tokens");
  }

  const trimmed = raw.trim();
  if (/^[a-f0-9]{64}$/i.test(trimmed)) return Buffer.from(trimmed, "hex");

  try {
    const b64 = Buffer.from(trimmed, "base64");
    if (b64.length === 32) return b64;
  } catch {}

  if (trimmed.length < 32) {
    throw new Error("OAUTH_TOKEN_ENCRYPTION_KEY must be at least 32 characters, 32 bytes base64, or 64 hex chars");
  }
  return crypto.createHash("sha256").update(trimmed).digest();
}

function encryptSecret(value) {
  if (!value || typeof value !== "string" || value.startsWith(ENC_PREFIX)) return value;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getTokenKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [
    ENC_PREFIX.slice(0, -1),
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
}

function decryptSecret(value) {
  if (!value || typeof value !== "string" || !value.startsWith(ENC_PREFIX)) return value;
  const parts = value.split(":");
  if (parts.length !== 5) throw new Error("Malformed encrypted OAuth token");
  const [, , ivRaw, tagRaw, dataRaw] = parts;
  const decipher = crypto.createDecipheriv("aes-256-gcm", getTokenKey(), Buffer.from(ivRaw, "base64url"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataRaw, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function decryptRecord(rec) {
  const out = { ...rec };
  for (const field of TOKEN_FIELDS) out[field] = decryptSecret(out[field]);
  return out;
}

function encryptRecord(rec) {
  const out = { ...rec };
  for (const field of TOKEN_FIELDS) out[field] = encryptSecret(out[field]);
  return out;
}

function encryptAll(data) {
  return Object.fromEntries(
    Object.entries(data || {}).map(([cityHandle, rec]) => [cityHandle, encryptRecord(rec)])
  );
}

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
    const parsed = JSON.parse(raw || "{}");
    cache = Object.fromEntries(
      Object.entries(parsed).map(([cityHandle, rec]) => [cityHandle, decryptRecord(rec)])
    );
  } catch (e) {
    console.error(`[oauthStore] failed to load ${FILE_PATH}: ${e.message}`);
    throw e;
  }
  return cache;
}

function persist() {
  ensureDir();
  const fd = fs.openSync(TMP_PATH, "w");
  try {
    fs.writeFileSync(fd, JSON.stringify(encryptAll(cache), null, 2));
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

/**
 * Linear scan over all records — fine for our scale (handful of cities).
 * If we grow beyond a few thousand owners, switch to a secondary index.
 */
function findByAddress(address) {
  if (!address) return null;
  const a = String(address).toLowerCase();
  for (const [cityHandle, rec] of Object.entries(load())) {
    if (rec.ownerAddress && rec.ownerAddress.toLowerCase() === a) {
      return { cityHandle, ...rec };
    }
  }
  return null;
}

function findVerifiedByAddress(address) {
  const rec = findByAddress(address);
  return rec?.walletVerifiedAt ? rec : null;
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

module.exports = { get, all, upsert, remove, findByAddress, findVerifiedByAddress, _path: FILE_PATH };
