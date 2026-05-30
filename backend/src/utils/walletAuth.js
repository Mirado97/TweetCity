const { ethers } = require("ethers");

const MAX_SKEW_MS = 5 * 60 * 1000;

function normalizeAddress(address) {
  if (!ethers.isAddress(address)) return null;
  return address.toLowerCase();
}

function buildWalletAuthMessage(address, action, timestamp) {
  return `TweetCity Wallet Authorization\nAction: ${action}\nAddress: ${address.toLowerCase()}\nTimestamp: ${timestamp}`;
}

function verifyWalletAuth({ address, action, timestamp, signature }) {
  const normalized = normalizeAddress(address);
  if (!normalized) {
    return { ok: false, status: 400, error: "Invalid wallet address" };
  }

  const tsNum = Number(timestamp);
  if (!Number.isFinite(tsNum) || Math.abs(Date.now() - tsNum) > MAX_SKEW_MS) {
    return { ok: false, status: 401, error: "Wallet signature timestamp expired" };
  }

  if (!signature || typeof signature !== "string") {
    return { ok: false, status: 401, error: "Missing wallet signature" };
  }

  try {
    const recovered = ethers.verifyMessage(
      buildWalletAuthMessage(normalized, action, String(timestamp)),
      signature
    ).toLowerCase();
    if (recovered !== normalized) {
      return { ok: false, status: 401, error: "Wallet signature address mismatch" };
    }
    return { ok: true, address: normalized };
  } catch {
    return { ok: false, status: 401, error: "Bad wallet signature" };
  }
}

module.exports = { buildWalletAuthMessage, verifyWalletAuth };
