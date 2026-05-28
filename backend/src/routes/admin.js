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
} = require("../services/contract");
const { runSweep } = require("../services/giftOracle");

const HIDDEN_FILE = path.join(__dirname, "../../data/admin-hidden.json");

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
    twitterProvider:        process.env.TWITTER_PROVIDER || "apify",
    skipTweetVerify:        process.env.SKIP_TWEET_VERIFY === "true",
    disableGiftOracle:      process.env.DISABLE_GIFT_ORACLE === "true",
    giftOracleIntervalMs:   Number(process.env.GIFT_ORACLE_INTERVAL_MS || 600000),
    frontendUrl:            process.env.FRONTEND_URL || "",
    port:                   process.env.PORT || 3001,
    // Apify accepts either a single token or rotated _1/_2 pair.
    keys: {
      ORACLE_PRIVATE_KEY:           !!process.env.ORACLE_PRIVATE_KEY,
      ANTHROPIC_API_KEY:            !!process.env.ANTHROPIC_API_KEY,
      APIFY_API_TOKEN:              !!(process.env.APIFY_API_TOKEN || process.env.APIFY_API_TOKEN_1 || process.env.APIFY_API_TOKEN_2),
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
