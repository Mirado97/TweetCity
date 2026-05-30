const express = require("express");
const fs = require("fs");
const path = require("path");
const router = express.Router();

const { adminAuth, fetchOwner } = require("../middleware/adminAuth");
const {
  getTweetCitySettings,
  getGiftsSettings,
  getGiftsStats,
  listAllCities,
  getGiftsForCity,
  getHandleByTokenId,
  verifyGiftEngagement,
  GIFT_STATUS,
} = require("../services/contract");
const { runSweep, verifyGiftAction } = require("../services/giftOracle");
const oauthStore = require("../storage/oauthStore");

// Persisted data dir — shared with oauthStore. On Railway set OAUTH_DATA_DIR=/data
// (the mounted Volume), so both admin-hidden.json and oauth.json survive deploys.
const DATA_DIR = process.env.OAUTH_DATA_DIR || path.join(__dirname, "../../data");
const HIDDEN_FILE = path.join(DATA_DIR, "admin-hidden.json");

function loadHidden() {
  try { return JSON.parse(fs.readFileSync(HIDDEN_FILE, "utf8")); } catch { return {}; }
}
function saveHidden(data) {
  fs.mkdirSync(path.dirname(HIDDEN_FILE), { recursive: true });
  fs.writeFileSync(HIDDEN_FILE, JSON.stringify(data, null, 2));
}
function isHidden(tokenId) {
  const h = loadHidden();
  return !!h[String(tokenId)];
}

// Public: who is the admin (used by frontend to show/hide /admin link).
router.get("/admin/owner", async (req, res) => {
  try {
    const owner = await fetchOwner();
    res.json({ owner });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.use("/admin", adminAuth);

router.get("/admin/stats", async (req, res) => {
  // Each fetch is independent — failure of one shouldn't blank the whole panel.
  const settle = async (fn) => { try { return { ok: await fn() }; } catch (e) { return { err: e.shortMessage || e.message }; } };
  const [tc, g, gs] = await Promise.all([
    settle(getTweetCitySettings),
    settle(getGiftsSettings),
    settle(getGiftsStats),
  ]);
  const hidden = loadHidden();
  res.json({
    tweetCity:  tc.ok || null,
    tweetCityError: tc.err || null,
    gifts:      g.ok  || null,
    giftsError: g.err || null,
    giftsStats: gs.ok || { totalGifts: 0, pending: 0, accepted: 0, verified: 0, rejected: 0, expired: 0, volumeWei: "0" },
    giftsStatsError: gs.err || null,
    hiddenCount: Object.keys(hidden).length,
    diag: {
      tweetCityAddr: process.env.CONTRACT_ADDRESS || null,
      giftsAddr:     process.env.GIFTS_CONTRACT_ADDRESS || null,
      rpc:           process.env.MANTLE_TESTNET_RPC ? "set" : "missing",
    },
  });
});

// Surface backend env state (without leaking secrets — only presence flags).
router.get("/admin/config", (req, res) => {
  res.json({
    twitterProvider:        "x-oauth",
    skipGiftVerify:         process.env.SKIP_GIFT_VERIFY === "true",
    disableGiftOracle:      process.env.DISABLE_GIFT_ORACLE === "true",
    giftOracleIntervalMs:   Number(process.env.GIFT_ORACLE_INTERVAL_MS || 600000),
    frontendUrl:            process.env.FRONTEND_URL || "",
    port:                   process.env.PORT || 3001,
    keys: {
      ORACLE_PRIVATE_KEY:           !!process.env.ORACLE_PRIVATE_KEY,
      TWITTER_CLIENT_ID:            !!process.env.TWITTER_CLIENT_ID,
      TWITTER_CLIENT_SECRET:        !!process.env.TWITTER_CLIENT_SECRET,
      TWITTER_OAUTH_CALLBACK_URL:   !!process.env.TWITTER_OAUTH_CALLBACK_URL,
      OAUTH_TOKEN_ENCRYPTION_KEY:   !!process.env.OAUTH_TOKEN_ENCRYPTION_KEY,
      ANTHROPIC_API_KEY:            !!process.env.ANTHROPIC_API_KEY,
      PINATA_API_KEY:               !!process.env.PINATA_API_KEY,
      PINATA_SECRET_KEY:            !!process.env.PINATA_SECRET_KEY,
      MANTLE_TESTNET_RPC:           !!process.env.MANTLE_TESTNET_RPC,
      CONTRACT_ADDRESS:             !!process.env.CONTRACT_ADDRESS,
      GIFTS_CONTRACT_ADDRESS:       !!process.env.GIFTS_CONTRACT_ADDRESS,
      ERC8004_IDENTITY_REGISTRY:    !!process.env.ERC8004_IDENTITY_REGISTRY,
      ERC8004_REPUTATION_REGISTRY:  !!process.env.ERC8004_REPUTATION_REGISTRY,
      ERC8004_VALIDATION_REGISTRY:  !!process.env.ERC8004_VALIDATION_REGISTRY,
    },
  });
});

router.get("/admin/cities", async (req, res) => {
  try {
    const cities = await listAllCities();
    const hidden = loadHidden();
    res.json(cities.map((c) => ({ ...c, hidden: !!hidden[String(c.tokenId)] })));
  } catch (e) {
    console.error("[admin/cities]", e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post("/admin/cities/:tokenId/hide", (req, res) => {
  const tokenId = String(req.params.tokenId);
  if (!/^\d+$/.test(tokenId)) return res.status(400).json({ error: "Bad tokenId" });
  const hidden = loadHidden();
  hidden[tokenId] = { hiddenAt: Date.now(), by: req.adminAddress, reason: req.body?.reason || "" };
  saveHidden(hidden);
  res.json({ ok: true, tokenId, hidden: true });
});

router.post("/admin/cities/:tokenId/unhide", (req, res) => {
  const tokenId = String(req.params.tokenId);
  const hidden = loadHidden();
  delete hidden[tokenId];
  saveHidden(hidden);
  res.json({ ok: true, tokenId, hidden: false });
});

// All gifts across all cities — for the admin Gifts tab.
// Returns each gift with the resolved city handle so the panel can show context.
router.get("/admin/gifts", async (req, res) => {
  try {
    const tcs = await getTweetCitySettings();
    const total = tcs.totalSupply;
    const out = [];
    for (let tokenId = 1; tokenId <= total; tokenId++) {
      let gifts = [];
      try { gifts = await getGiftsForCity(tokenId); } catch { continue; }
      if (gifts.length === 0) continue;
      const handle = await getHandleByTokenId(tokenId).catch(() => "");
      let xLinked = false;
      try { xLinked = !!oauthStore.get(handle); } catch (e) {
        console.warn("[admin/gifts] oauthStore.get failed:", e.message);
      }
      for (const g of gifts) out.push({ ...g, cityHandle: handle, xLinked });
    }
    // Newest first
    out.sort((a, b) => b.createdAt - a.createdAt);
    res.json(out);
  } catch (e) {
    console.error("[admin/gifts]", e.message);
    res.status(500).json({ error: e.message });
  }
});

// Dry-run Twitter verification for a single gift — same logic as the cron uses,
// but doesn't touch the chain. Surfaces the exact reason why Apify says no.
router.post("/admin/gifts/:giftId/check", async (req, res) => {
  try {
    const giftId = req.params.giftId;
    // Find the gift to get its cityTokenId
    const tcs = await getTweetCitySettings();
    let gift = null;
    for (let tokenId = 1; tokenId <= tcs.totalSupply && !gift; tokenId++) {
      const gs = await getGiftsForCity(tokenId).catch(() => []);
      gift = gs.find((g) => String(g.id) === String(giftId));
    }
    if (!gift) return res.status(404).json({ error: "Gift not found" });
    const cityHandle = await getHandleByTokenId(gift.cityTokenId).catch(() => "");
    const result = await verifyGiftAction(gift, cityHandle);
    res.json({ gift, cityHandle, ...result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Force-verify — calls verifyEngagement directly without Apify check.
// Funds (ownerAmount) transfer to the city manager wallet on-chain.
// Use when Apify fails to detect a real engagement.
router.post("/admin/gifts/:giftId/force-verify", async (req, res) => {
  try {
    const giftId = req.params.giftId;
    const result = await verifyGiftEngagement(giftId);
    res.json({ ok: true, giftId, ...result });
  } catch (e) {
    res.status(500).json({ error: e.shortMessage || e.message });
  }
});

router.post("/admin/sweep", async (req, res) => {
  try {
    const result = await runSweep({ dryRun: req.query.dryRun === "1" });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
module.exports.isHidden = isHidden;
module.exports.loadHidden = loadHidden;
