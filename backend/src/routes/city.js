const express = require("express");
const router = express.Router();
const { ethers } = require("ethers");

const TwitterOAuthProvider = require("../services/twitter/TwitterOAuthProvider");
const oauthStore = require("../storage/oauthStore");
let _oauth = null;
function getOAuth() {
  if (!_oauth) _oauth = new TwitterOAuthProvider();
  return _oauth;
}
const { analyzeCityPersonality, generateLevelUpNarrative } = require("../services/claude");
const { uploadMetadata, getCachedMetadata } = require("../services/ipfs");
const { mintCity, updateCity, getCityData, getLeaderboard, getTokenIdByHandle, getHandleByTokenId, registerERC8004Agent, recordValidation, getTokenAgentId, registerCityManager, getCityManagerWallet, getGiftsForCity, getGift, verifyGiftEngagement, listAllCities } = require("../services/contract");
const { runSweep, verifyGiftAction } = require("../services/giftOracle");
const { checkSyncCooldown, mintLimiter } = require("../middleware/rateLimit");
const { isHidden, loadHidden } = require("./admin");

// POST /api/verify-tweet
// Returns the text the user must tweet to prove account ownership
// POST /api/mint — OAuth-only. Owner must Connect X first; backend reads
// twitterHandle / userId / tokens from oauthStore by wallet address.
router.post("/mint", mintLimiter, async (req, res) => {
  const { walletAddress } = req.body;

  if (!walletAddress)              return res.status(400).json({ error: "walletAddress required" });
  if (!ethers.isAddress(walletAddress)) return res.status(400).json({ error: "Invalid wallet address" });

  const link = oauthStore.findByAddress(walletAddress);
  if (!link) {
    return res.status(403).json({ error: "Connect your X account first (OAuth). No linked handle for this wallet.", needsOAuth: true });
  }
  const twitterHandle = link.cityHandle;

  try {
    // Step 0: Check if already minted — skip all expensive steps
    const existingTokenId = await getTokenIdByHandle(twitterHandle);
    if (existingTokenId !== 0) {
      const existing = await getCityData(existingTokenId);
      return res.json({ tokenId: String(existingTokenId), txHash: null, ipfsCID: existing.city.ipfsCID, cityData: null, alreadyMinted: true });
    }

    // Step 1: Fetch metrics + tweets via owner's own OAuth token.
    const twitter = getOAuth();
    const [metrics, tweets] = await Promise.all([
      twitter.getUserMetrics(twitterHandle),
      twitter.getUserTweets(twitterHandle, 50),
    ]);

    const avgEngagement = tweets.length
      ? Math.round(tweets.reduce((s, t) => s + t.likes + t.retweets, 0) / tweets.length)
      : 0;

    // Step 3: Claude AI analysis
    const aiData = await analyzeCityPersonality(tweets, { ...metrics, avgEngagement, username: twitterHandle });

    // Step 4: Build and upload metadata to IPFS
    const metadata = {
      name: aiData.cityName,
      description: aiData.lore,
      twitterHandle,
      walletAddress: walletAddress.toLowerCase(),
      metrics: { followers: metrics.followers, tweetCount: metrics.tweetCount, following: metrics.following, avgEngagement },
      city: {
        style: aiData.style,
        motto: aiData.motto,
        colorPalette: aiData.colorPalette,
        dominantThemes: aiData.dominantThemes,
        level: calcLevel(metrics.followers),
      },
      mintedAt: new Date().toISOString(),
    };
    const ipfsCID = await uploadMetadata(metadata);

    // Step 5: Mint NFT on Mantle
    const { tokenId, txHash } = await mintCity({
      to: walletAddress,
      twitterHandle,
      followers: metrics.followers,
      tweetCount: metrics.tweetCount,
      following: metrics.following,
      engagement: avgEngagement,
      ipfsCID,
    });

    // Step 6: Register city as ERC-8004 agent (IdentityRegistry + ReputationRegistry)
    const agentId = await registerERC8004Agent(twitterHandle, walletAddress, tokenId);

    // Step 7: Register minter wallet as city manager in CityGifts
    registerCityManager(tokenId, walletAddress).catch(() => {});

    res.json({ tokenId, txHash, ipfsCID, agentId, cityData: metadata });
  } catch (err) {
    console.error("[mint]", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sync — OAuth-only. Caller supplies walletAddress + tokenId;
// twitterHandle is read from oauthStore (so owners can't sync foreign cities).
router.post("/sync", checkSyncCooldown, async (req, res) => {
  const { tokenId, walletAddress } = req.body;
  if (!tokenId || !walletAddress) {
    return res.status(400).json({ error: "tokenId and walletAddress required" });
  }
  if (!ethers.isAddress(walletAddress)) {
    return res.status(400).json({ error: "Invalid wallet address" });
  }

  const link = oauthStore.findByAddress(walletAddress);
  if (!link) {
    return res.status(403).json({ error: "Connect X first — no linked handle for this wallet.", needsOAuth: true });
  }
  const twitterHandle = link.cityHandle;

  try {
    const twitter = getOAuth();
    const [metrics, tweets] = await Promise.all([
      twitter.getUserMetrics(twitterHandle),
      twitter.getUserTweets(twitterHandle, 50),
    ]);

    const avgEngagement = tweets.length
      ? Math.round(tweets.reduce((s, t) => s + t.likes + t.retweets, 0) / tweets.length)
      : 0;

    const oldData = await getCityData(tokenId);
    const oldLevel = Number(oldData.city.level);
    const newLevel = calcLevel(metrics.followers);
    const isLevelUp = newLevel > oldLevel;
    const noIpfs = !oldData.city.ipfsCID || oldData.city.ipfsCID.length === 0;
    const noMetrics = oldData.city.followers === 0 && oldData.city.tweetCount === 0;

    let ipfsCID = "";
    let narrative = null;

    if (isLevelUp || noIpfs || noMetrics) {
      const aiData = await analyzeCityPersonality(tweets, { ...metrics, avgEngagement, username: twitterHandle });
      if (isLevelUp) {
        narrative = await generateLevelUpNarrative(aiData.cityName, oldLevel, newLevel, metrics);
      }

      const metadata = {
        name: aiData.cityName,
        description: aiData.lore,
        twitterHandle,
        metrics: { followers: metrics.followers, tweetCount: metrics.tweetCount, following: metrics.following, avgEngagement },
        city: {
          style: aiData.style,
          motto: aiData.motto,
          colorPalette: aiData.colorPalette,
          dominantThemes: aiData.dominantThemes,
          level: newLevel,
        },
        updatedAt: new Date().toISOString(),
      };
      ipfsCID = await uploadMetadata(metadata);
    }

    const result = await updateCity({
      tokenId,
      followers: metrics.followers,
      tweetCount: metrics.tweetCount,
      following: metrics.following,
      engagement: avgEngagement,
      ipfsCID,
    });

    // ERC-8004: oracle validates city metrics on-chain (ValidationRegistry)
    const cityAgentId = await getTokenAgentId(tokenId).catch(() => 0);
    if (cityAgentId) {
      await recordValidation(tokenId, cityAgentId, metrics.followers, metrics.tweetCount, metrics.following);
    }

    req.setSyncCooldown?.();
    res.json({
      updated: true,
      levelUp: result.levelUp,
      oldLevel: result.oldLevel ? Number(result.oldLevel) : oldLevel,
      newLevel: result.newLevel ? Number(result.newLevel) : newLevel,
      newMetrics: { followers: metrics.followers, tweetCount: metrics.tweetCount, following: metrics.following },
      narrative,
      txHash: result.txHash,
    });
  } catch (err) {
    console.error("[sync]", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/city/:tokenId
router.get("/city/:tokenId", async (req, res) => {
  try {
    if (isHidden(req.params.tokenId)) {
      return res.status(404).json({ error: "City unavailable" });
    }
    const data = await getCityData(req.params.tokenId);

    // Fetch IPFS metadata — in-memory cache first, then gateways
    let ipfsData = null;
    const cid = data.city?.ipfsCID;
    if (cid && cid.length > 0) {
      ipfsData = getCachedMetadata(cid);
      if (!ipfsData) {
        const gateways = [
          `https://w3s.link/ipfs/${cid}`,
          `https://ipfs.io/ipfs/${cid}`,
          `https://gateway.pinata.cloud/ipfs/${cid}`,
        ];
        for (const url of gateways) {
          try {
            const ipfsRes = await fetch(url, { signal: AbortSignal.timeout(5000) });
            if (ipfsRes.ok) { ipfsData = await ipfsRes.json(); break; }
          } catch {}
        }
      }
    }

    // Resolve twitterHandle: IPFS first (fast), then on-chain event (chunked)
    const twitterHandle = ipfsData?.twitterHandle || await getHandleByTokenId(req.params.tokenId);

    const managerWallet = await getCityManagerWallet(req.params.tokenId);
    res.json({ ...data, city: { ...data.city, twitterHandle }, ipfsData, managerWallet });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

// POST /api/city/:tokenId/claim-manager
// First-come-first-served: registers walletAddress as city manager if unclaimed.
// Used when original minter wallet is unknown (e.g. legacy mints).
router.post("/city/:tokenId/claim-manager", async (req, res) => {
  const { walletAddress } = req.body;
  if (!walletAddress || !ethers.isAddress(walletAddress)) {
    return res.status(400).json({ error: "walletAddress required" });
  }
  const tokenId = req.params.tokenId;
  const existing = await getCityManagerWallet(tokenId);
  if (existing) {
    return res.status(409).json({ error: "Manager already registered", manager: existing });
  }
  try {
    await registerCityManager(tokenId, walletAddress);
    res.json({ ok: true, tokenId, manager: walletAddress.toLowerCase() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/leaderboard
router.get("/leaderboard", async (req, res) => {
  try {
    const board = await getLeaderboard(50); // fetch more, filter, then slice
    const hidden = loadHidden();
    const filtered = board.filter((c) => !hidden[String(c.tokenId)]).slice(0, 10);
    res.json(filtered);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Public market — all cities (minus hidden) with optional handle filter.
// Cached for 60s to avoid hammering RPC; the Market UI page hits this on every keystroke.
const MARKET_TTL_MS = 60_000;
let _marketCache = { data: null, fetchedAt: 0 };
router.get("/cities", async (req, res) => {
  try {
    const now = Date.now();
    if (!_marketCache.data || now - _marketCache.fetchedAt > MARKET_TTL_MS) {
      _marketCache.data = await listAllCities();
      _marketCache.fetchedAt = now;
    }
    const hidden = loadHidden();
    let cities = _marketCache.data.filter((c) => !hidden[String(c.tokenId)]);

    const q = String(req.query.q || "").toLowerCase().trim().replace(/^@/, "");
    if (q) cities = cities.filter((c) => (c.twitterHandle || "").toLowerCase().includes(q));

    res.json(cities);
  } catch (err) {
    console.error("[/cities]", err.message);
    res.status(500).json({ error: err.message });
  }
});

function calcLevel(followers) {
  if (followers >= 100000) return 5;
  if (followers >= 10000) return 4;
  if (followers >= 1000) return 3;
  if (followers >= 100) return 2;
  return 1;
}

// GET /api/config — public contract addresses for frontend
router.get("/config", (req, res) => {
  res.json({
    giftsContract: process.env.GIFTS_CONTRACT_ADDRESS || "",
  });
});

// ─── Gifts ───────────────────────────────────────────────────────────────

// GET /api/city/:tokenId/gifts — all gifts for the city (used by claimExpired UI)
router.get("/city/:tokenId/gifts", async (req, res) => {
  try {
    const gifts = await getGiftsForCity(req.params.tokenId);
    res.json(gifts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/oracle/sweep — runs oracle sweep across all cities.
// Protected by ORACLE_SWEEP_TOKEN env (set X-Sweep-Token header).
router.post("/oracle/sweep", async (req, res) => {
  const expected = process.env.ORACLE_SWEEP_TOKEN;
  if (!expected) return res.status(503).json({ error: "ORACLE_SWEEP_TOKEN not set" });
  if (req.get("x-sweep-token") !== expected) return res.status(401).json({ error: "unauthorized" });

  try {
    const result = await runSweep({ dryRun: req.query.dryRun === "1" });
    res.json(result);
  } catch (err) {
    console.error("[oracle/sweep]", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/gifts/:giftId/verify-manual — admin override: skip Twitter check, verify on-chain.
// Useful for hackathon demos. Protected by ORACLE_SWEEP_TOKEN.
router.post("/gifts/:giftId/verify-manual", async (req, res) => {
  const expected = process.env.ORACLE_SWEEP_TOKEN;
  if (!expected) return res.status(503).json({ error: "ORACLE_SWEEP_TOKEN not set" });
  if (req.get("x-sweep-token") !== expected) return res.status(401).json({ error: "unauthorized" });

  try {
    const result = await verifyGiftEngagement(req.params.giftId);
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error("[verify-manual]", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/gifts/:giftId/check — dry-run a single gift's verification (no on-chain tx).
router.post("/gifts/:giftId/check", async (req, res) => {
  try {
    const gift = await getGift(req.params.giftId);
    const handle = await getHandleByTokenId(gift.cityTokenId);
    const result = await verifyGiftAction(gift, handle);
    res.json({ gift, cityHandle: handle, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
