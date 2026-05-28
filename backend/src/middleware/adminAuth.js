const { ethers } = require("ethers");

// Простой in-memory cache owner-адреса. Меняется только при смене owner на контракте,
// что бывает очень редко — TTL 5 минут безопасен.
let _ownerCache = { addr: null, expires: 0 };

async function fetchOwner() {
  if (_ownerCache.addr && Date.now() < _ownerCache.expires) return _ownerCache.addr;

  const rpc = process.env.MANTLE_TESTNET_RPC;
  const addr = process.env.CONTRACT_ADDRESS;
  if (!rpc || !addr) throw new Error("MANTLE_TESTNET_RPC and CONTRACT_ADDRESS must be set");

  // selector keccak256("owner()")[:4] = 0x8da5cb5b
  const resp = await fetch(rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "eth_call", id: 1,
      params: [{ to: addr, data: "0x8da5cb5b" }, "latest"] }),
    signal: AbortSignal.timeout(6000),
  });
  const json = await resp.json();
  if (!json.result || json.result.length < 66) throw new Error("owner() returned no data");
  const owner = ("0x" + json.result.slice(26)).toLowerCase();

  _ownerCache = { addr: owner, expires: Date.now() + 5 * 60 * 1000 };
  return owner;
}

// Сообщение, которое клиент подписывает. Свежесть проверяем по timestamp (5 минут).
function buildMessage(address, timestamp) {
  return `TweetCity Admin Access\nAddress: ${address.toLowerCase()}\nTimestamp: ${timestamp}`;
}

async function adminAuth(req, res, next) {
  const sig = req.get("x-admin-signature");
  const addr = req.get("x-admin-address");
  const ts = req.get("x-admin-timestamp");

  if (!sig || !addr || !ts) {
    return res.status(401).json({ error: "Missing X-Admin-Signature / Address / Timestamp" });
  }
  if (!ethers.isAddress(addr)) {
    return res.status(400).json({ error: "Bad admin address" });
  }

  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum) || Math.abs(Date.now() - tsNum) > 5 * 60 * 1000) {
    return res.status(401).json({ error: "Signature timestamp expired" });
  }

  let recovered;
  try {
    recovered = ethers.verifyMessage(buildMessage(addr, ts), sig).toLowerCase();
  } catch {
    return res.status(401).json({ error: "Bad signature" });
  }
  if (recovered !== addr.toLowerCase()) {
    return res.status(401).json({ error: "Signature address mismatch" });
  }

  try {
    const owner = await fetchOwner();
    if (recovered !== owner) {
      return res.status(403).json({ error: "Not contract owner" });
    }
  } catch (e) {
    return res.status(500).json({ error: "Owner check failed: " + e.message });
  }

  req.adminAddress = recovered;
  next();
}

module.exports = { adminAuth, fetchOwner, buildMessage };
