import { API_BASE } from "./contract";

// Кэшируем подпись на 5 минут — иначе MetaMask будет дергать пользователя на каждый запрос.
const CACHE_KEY = "tweetcity_admin_sig";
const TTL_MS = 4.5 * 60 * 1000; // чуть меньше серверного окна 5 мин

function loadCache(address) {
  try {
    const raw = JSON.parse(sessionStorage.getItem(CACHE_KEY) || "null");
    if (!raw) return null;
    if (raw.address?.toLowerCase() !== address.toLowerCase()) return null;
    if (Date.now() - raw.timestamp > TTL_MS) return null;
    return raw;
  } catch { return null; }
}
function saveCache(entry) { sessionStorage.setItem(CACHE_KEY, JSON.stringify(entry)); }

export function clearAdminSig() { sessionStorage.removeItem(CACHE_KEY); }

function buildMessage(address, timestamp) {
  return `TweetCity Admin Access\nAddress: ${address.toLowerCase()}\nTimestamp: ${timestamp}`;
}

async function getSig(signer) {
  const address = (await signer.getAddress()).toLowerCase();
  const cached = loadCache(address);
  if (cached) return cached;

  const timestamp = Date.now();
  const message = buildMessage(address, timestamp);
  const signature = await signer.signMessage(message);
  const entry = { address, timestamp, signature };
  saveCache(entry);
  return entry;
}

async function authHeaders(signer) {
  const { address, timestamp, signature } = await getSig(signer);
  return {
    "x-admin-address":   address,
    "x-admin-timestamp": String(timestamp),
    "x-admin-signature": signature,
  };
}

async function handle(res) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function fetchOwner() {
  const r = await fetch(`${API_BASE}/api/admin/owner`);
  return handle(r);
}

export async function fetchStats(signer) {
  const r = await fetch(`${API_BASE}/api/admin/stats`, { headers: await authHeaders(signer) });
  return handle(r);
}

export async function fetchConfig(signer) {
  const r = await fetch(`${API_BASE}/api/admin/config`, { headers: await authHeaders(signer) });
  return handle(r);
}

export async function fetchCities(signer) {
  const r = await fetch(`${API_BASE}/api/admin/cities`, { headers: await authHeaders(signer) });
  return handle(r);
}

export async function hideCity(signer, tokenId, reason = "") {
  const r = await fetch(`${API_BASE}/api/admin/cities/${tokenId}/hide`, {
    method: "POST",
    headers: { ...(await authHeaders(signer)), "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });
  return handle(r);
}

export async function unhideCity(signer, tokenId) {
  const r = await fetch(`${API_BASE}/api/admin/cities/${tokenId}/unhide`, {
    method: "POST",
    headers: await authHeaders(signer),
  });
  return handle(r);
}

export async function triggerSweep(signer, dryRun = false) {
  const url = `${API_BASE}/api/admin/sweep${dryRun ? "?dryRun=1" : ""}`;
  const r = await fetch(url, { method: "POST", headers: await authHeaders(signer) });
  return handle(r);
}

export async function fetchGifts(signer) {
  const r = await fetch(`${API_BASE}/api/admin/gifts`, { headers: await authHeaders(signer) });
  return handle(r);
}

export async function checkGift(signer, giftId) {
  const r = await fetch(`${API_BASE}/api/admin/gifts/${giftId}/check`, {
    method: "POST", headers: await authHeaders(signer),
  });
  return handle(r);
}

export async function forceVerifyGift(signer, giftId) {
  const r = await fetch(`${API_BASE}/api/admin/gifts/${giftId}/force-verify`, {
    method: "POST", headers: await authHeaders(signer),
  });
  return handle(r);
}
