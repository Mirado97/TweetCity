const express = require("express");
const router = express.Router();
const { ethers } = require("ethers");

const TwitterOAuthProvider = require("../services/twitter/TwitterOAuthProvider");
const oauthStore = require("../storage/oauthStore");
const marketStore = require("../storage/marketStore");
let _oauth = null;
function getOAuth() {
  if (!_oauth) _oauth = new TwitterOAuthProvider();
  return _oauth;
}
const { analyzeCityPersonality, generateLevelUpNarrative } = require("../services/claude");
const { uploadMetadata, getCachedMetadata } = require("../services/ipfs");
const { mintCity, updateCity, getCityData, getLeaderboard, getTokenIdByHandleInsensitive, getHandleByTokenId, registerERC8004Agent, recordValidation, getTokenAgentId, registerCityManager, getCityManagerWallet, getGiftsForCity, getGift, listAllCities, getResidentCampaign, getResidentCampaignClaimState, verifyResidentCampaignEngagement } = require("../services/contract");
const { verifyGiftAction } = require("../services/giftOracle");
const { checkSyncCooldown, mintLimiter, syncLimiter, heavyReadLimiter, giftCheckLimiter } = require("../middleware/rateLimit");
const { isHidden, loadHidden } = require("./admin");
const { verifyWalletAuth } = require("../utils/walletAuth");

// POST /api/verify-tweet
// Returns the text the user must tweet to prove account ownership
// POST /api/mint — OAuth-only. Owner must Connect X first; backend reads
// twitterHandle / userId / tokens from oauthStore by wallet address.
router.post("/mint", mintLimiter, async (req, res) => {
  const { walletAddress, walletTimestamp, walletSignature } = req.body;

  if (!walletAddress)              return res.status(400).json({ error: "walletAddress required" });
  if (!ethers.isAddress(walletAddress)) return res.status(400).json({ error: "Invalid wallet address" });
  const auth = verifyWalletAuth({
    address: walletAddress,
    action: "mint-city",
    timestamp: walletTimestamp,
    signature: walletSignature,
  });
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  const link = oauthStore.findVerifiedByAddress(auth.address);
  if (!link) {
    return res.status(403).json({ error: "Connect your X account first (OAuth). No linked handle for this wallet.", needsOAuth: true });
  }
  const twitterHandle = String(link.cityHandle || "").trim().replace(/^@/, "").toLowerCase();

  try {
    // Step 0: Check if already minted — skip all expensive steps
    const existingTokenId = await getTokenIdByHandleInsensitive(twitterHandle);
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
      walletAddress: auth.address,
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
      to: auth.address,
      twitterHandle,
      followers: metrics.followers,
      tweetCount: metrics.tweetCount,
      following: metrics.following,
      engagement: avgEngagement,
      ipfsCID,
    });

    // Step 6: Register city as ERC-8004 agent (IdentityRegistry + ReputationRegistry)
    const agentId = await registerERC8004Agent(twitterHandle, auth.address, tokenId);

    // Step 7: Register minter wallet as city manager in CityGifts
    registerCityManager(tokenId, auth.address).catch(() => {});

    res.json({ tokenId, txHash, ipfsCID, agentId, cityData: metadata });
  } catch (err) {
    console.error("[mint]", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sync — OAuth-only. Caller supplies walletAddress + tokenId;
// twitterHandle is read from oauthStore (so owners can't sync foreign cities).
router.post("/sync", syncLimiter, checkSyncCooldown, async (req, res) => {
  const { tokenId, walletAddress, walletTimestamp, walletSignature } = req.body;
  if (!tokenId || !walletAddress) {
    return res.status(400).json({ error: "tokenId and walletAddress required" });
  }
  if (!ethers.isAddress(walletAddress)) {
    return res.status(400).json({ error: "Invalid wallet address" });
  }
  const auth = verifyWalletAuth({
    address: walletAddress,
    action: `sync-city:${tokenId}`,
    timestamp: walletTimestamp,
    signature: walletSignature,
  });
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  const link = oauthStore.findVerifiedByAddress(auth.address);
  if (!link) {
    return res.status(403).json({ error: "Connect X first — no linked handle for this wallet.", needsOAuth: true });
  }
  const twitterHandle = link.cityHandle;

  try {
    const tokenHandle = await getHandleByTokenId(tokenId);
    if (tokenHandle.toLowerCase() !== twitterHandle.toLowerCase()) {
      return res.status(403).json({ error: "Linked X account does not match this city" });
    }

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
    const canonicalTokenId = twitterHandle
      ? await getTokenIdByHandleInsensitive(twitterHandle).catch(() => Number(req.params.tokenId))
      : Number(req.params.tokenId);

    const managerWallet = await getCityManagerWallet(req.params.tokenId);
    const canonicalManagerWallet = canonicalTokenId && String(canonicalTokenId) !== String(req.params.tokenId)
      ? await getCityManagerWallet(canonicalTokenId).catch(() => managerWallet)
      : managerWallet;
    res.json({ ...data, city: { ...data.city, twitterHandle }, ipfsData, managerWallet, canonicalTokenId, canonicalManagerWallet });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

// POST /api/city/:tokenId/claim-manager
// First-come-first-served: registers walletAddress as city manager if unclaimed.
// Used when original minter wallet is unknown (e.g. legacy mints).
router.post("/city/:tokenId/claim-manager", async (req, res) => {
  res.status(410).json({ error: "Public manager claiming is disabled" });
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
router.get("/cities", heavyReadLimiter, async (req, res) => {
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

// ─── Market listings ─────────────────────────────────────────────────────

router.get("/market/listings", heavyReadLimiter, async (req, res) => {
  try {
    const hidden = loadHidden();
    const kind = String(req.query.kind || "").toLowerCase();
    const includeInactive = String(req.query.includeInactive || "") === "true";
    const tokenId = String(req.query.tokenId || "").trim();
    let listings = (includeInactive ? marketStore.all() : marketStore.list()).filter((x) => !hidden[String(x.tokenId)]);
    if (kind === "administrator" || kind === "resident") {
      listings = listings.filter((x) => x.kind === kind);
    }
    if (tokenId) {
      listings = listings.filter((x) => String(x.tokenId) === tokenId);
    }

    const now = Math.floor(Date.now() / 1000);
    listings = await Promise.all(listings.map(async (x) => {
      if (x.kind !== "resident" || !x.campaignId) return x;
      const campaign = await getResidentCampaign(x.campaignId).catch(() => null);
      return { ...x, campaign };
    }));
    if (!includeInactive) {
      listings = listings.filter((x) => {
        if (x.active === false) return false;
        if (x.kind !== "resident") return true;
        return !!(x.campaign && x.campaign.active && x.campaign.deadline > now && Number(x.campaign.escrowRemaining || 0) > 0);
      });
    }
    res.json(listings);
  } catch (err) {
    console.error("[market/listings]", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post("/market/listings", async (req, res) => {
  try {
    const { kind, tokenId, postUrl, campaignId, giftCounts, durationDays, walletAddress, walletTimestamp, walletSignature } = req.body || {};
    if (!tokenId || !walletAddress) return res.status(400).json({ error: "tokenId and walletAddress required" });
    if (!ethers.isAddress(walletAddress)) return res.status(400).json({ error: "Invalid wallet address" });

    const auth = verifyWalletAuth({
      address: walletAddress,
      action: `market-listing:${tokenId}:${kind === "resident" ? "resident" : "administrator"}`,
      timestamp: walletTimestamp,
      signature: walletSignature,
    });
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

    const managerWallet = await getCityManagerWallet(tokenId);
    if (!managerWallet || managerWallet.toLowerCase() !== auth.address) {
      return res.status(403).json({ error: "Only this city's manager can post a market listing" });
    }

    let campaign = null;
    if (kind === "resident") {
      if (!campaignId && campaignId !== 0) return res.status(400).json({ error: "campaignId required" });
      campaign = await getResidentCampaign(campaignId);
      if (String(campaign.cityTokenId) !== String(tokenId)) {
        return res.status(400).json({ error: "Campaign tokenId mismatch" });
      }
      if (campaign.creator.toLowerCase() !== auth.address) {
        return res.status(403).json({ error: "Only the campaign creator can publish this listing" });
      }
      if (!campaign.active) return res.status(400).json({ error: "Campaign is not active" });
    }

    const [cityData, twitterHandle] = await Promise.all([
      getCityData(tokenId),
      getHandleByTokenId(tokenId),
    ]);

    const listing = marketStore.upsert({
      kind,
      tokenId,
      ownerAddress: auth.address,
      twitterHandle,
      followers: cityData.city?.followers || 0,
      postUrl,
      campaignId,
      giftCounts,
      durationDays,
    });
    res.json({ ok: true, listing: campaign ? { ...listing, campaign } : listing });
  } catch (err) {
    console.error("[market/listings:post]", err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post("/market/campaigns/:campaignId/claim", giftCheckLimiter, async (req, res) => {
  try {
    const campaignId = String(req.params.campaignId);
    const giftType = Number(req.body?.giftType);
    const { walletAddress, walletTimestamp, walletSignature } = req.body || {};
    if (!walletAddress) return res.status(400).json({ error: "walletAddress required" });
    if (!Number.isInteger(giftType) || giftType < 0 || giftType > 5) return res.status(400).json({ error: "Invalid giftType" });

    const auth = verifyWalletAuth({
      address: walletAddress,
      action: `resident-claim:${campaignId}:${giftType}`,
      timestamp: walletTimestamp,
      signature: walletSignature,
    });
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

    const link = oauthStore.findVerifiedByAddress(auth.address);
    if (!link?.cityHandle) {
      return res.status(403).json({ error: "Connect X and mint a city before claiming resident rewards" });
    }

    const workerHandle = String(link.cityHandle || "").toLowerCase();
    const workerTokenId = await getTokenIdByHandleInsensitive(workerHandle);
    if (!workerTokenId) return res.status(403).json({ error: "Worker X account has no city" });

    const campaign = await getResidentCampaign(campaignId);
    if (!campaign?.creator || campaign.creator === ethers.ZeroAddress) return res.status(404).json({ error: "Campaign not found" });
    if (campaign.creator.toLowerCase() === auth.address) return res.status(400).json({ error: "You cannot claim your own campaign" });
    const now = Math.floor(Date.now() / 1000);
    if (!campaign.active || campaign.deadline <= now) return res.status(400).json({ error: "Campaign is not active" });
    if ((campaign.remaining?.[giftType] || 0) <= 0) return res.status(400).json({ error: "No remaining slots for this gift" });

    const claimState = await getResidentCampaignClaimState(campaignId, giftType, auth.address, workerHandle);
    if (claimState.walletClaimed || claimState.handleClaimed) {
      return res.status(409).json({ error: "Reward already claimed for this campaign and gift type" });
    }

    const result = await verifyGiftAction({
      giftType,
      tweetUrl: campaign.postUrl,
      createdAt: campaign.createdAt,
    }, workerHandle);
    if (!result.ok) return res.status(422).json({ error: result.reason, verified: false });

    const tx = await verifyResidentCampaignEngagement(campaignId, giftType, auth.address, workerHandle);
    res.json({ ok: true, verified: true, workerHandle, workerTokenId, ...tx });
  } catch (err) {
    console.error("[market/campaigns:claim]", err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.delete("/market/listings/:id", async (req, res) => {
  try {
    const { walletAddress, walletTimestamp, walletSignature } = req.body || {};
    if (!walletAddress) return res.status(400).json({ error: "walletAddress required" });
    const auth = verifyWalletAuth({
      address: walletAddress,
      action: `market-listing-delete:${req.params.id}`,
      timestamp: walletTimestamp,
      signature: walletSignature,
    });
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
    const ok = marketStore.deactivate(req.params.id, auth.address);
    res.json({ ok });
  } catch (err) {
    console.error("[market/listings:delete]", err.message);
    res.status(err.status || 500).json({ error: err.message });
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
router.get("/city/:tokenId/gifts", heavyReadLimiter, async (req, res) => {
  try {
    const gifts = await getGiftsForCity(req.params.tokenId);
    res.json(gifts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Public oracle controls are disabled. Use owner-signed /api/admin/sweep instead.
router.post("/oracle/sweep", async (req, res) => {
  res.status(410).json({ error: "Public oracle sweep is disabled. Use admin panel." });
});

// Public manual verification is disabled. Use owner-signed /api/admin/gifts/:giftId/force-verify instead.
router.post("/gifts/:giftId/verify-manual", async (req, res) => {
  res.status(410).json({ error: "Public manual verification is disabled. Use admin panel." });
});

// POST /api/gifts/:giftId/check — dry-run a single gift's verification (no on-chain tx).
router.post("/gifts/:giftId/check", giftCheckLimiter, async (req, res) => {
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
