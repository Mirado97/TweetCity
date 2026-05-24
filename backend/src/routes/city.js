const express = require("express");
const router = express.Router();
const { ethers } = require("ethers");
const { createHash } = require("crypto");

function makeVerifyCode(walletAddress, twitterHandle) {
  return createHash("sha256")
    .update(walletAddress.toLowerCase() + twitterHandle.toLowerCase())
    .digest("hex")
    .slice(0, 6);
}

const getTwitterProvider = require("../services/twitter");
const { analyzeCityPersonality, generateLevelUpNarrative } = require("../services/claude");
const { uploadMetadata, getCachedMetadata } = require("../services/ipfs");
const { mintCity, updateCity, getCityData, getLeaderboard, getTokenIdByHandle, getHandleByTokenId, registerERC8004Agent, recordValidation, getTokenAgentId } = require("../services/contract");
const { checkSyncCooldown, mintLimiter } = require("../middleware/rateLimit");

// POST /api/verify-tweet
// Returns the text the user must tweet to prove account ownership
router.post("/verify-tweet", (req, res) => {
  const { walletAddress, twitterHandle } = req.body;
  if (!walletAddress || !twitterHandle) {
    return res.status(400).json({ error: "walletAddress and twitterHandle required" });
  }
  if (!ethers.isAddress(walletAddress)) {
    return res.status(400).json({ error: "Invalid wallet address" });
  }

  const code = makeVerifyCode(walletAddress, twitterHandle);
  const verifyText = `Minting my city on TweetCity! Code: TC-${code} #TweetCity #Mantle`;
  res.json({ verifyText, code });
});

// POST /api/mint
router.post("/mint", mintLimiter, async (req, res) => {
  const { walletAddress, twitterHandle } = req.body;

  if (!walletAddress || !twitterHandle) {
    return res.status(400).json({ error: "walletAddress and twitterHandle required" });
  }
  if (!ethers.isAddress(walletAddress)) {
    return res.status(400).json({ error: "Invalid wallet address" });
  }

  try {
    // Step 0: Check if already minted — skip all expensive steps
    const existingTokenId = await getTokenIdByHandle(twitterHandle);
    if (existingTokenId !== 0) {
      const existing = await getCityData(existingTokenId);
      return res.json({ tokenId: String(existingTokenId), txHash: null, ipfsCID: existing.city.ipfsCID, cityData: null, alreadyMinted: true });
    }

    const twitter = getTwitterProvider();
    const code = makeVerifyCode(walletAddress, twitterHandle);
    const verifyText = `Minting my city on TweetCity! Code: TC-${code} #TweetCity #Mantle`;

    // Step 1: Verify Tweet Proof (skip if SKIP_TWEET_VERIFY=true in .env)
    if (process.env.SKIP_TWEET_VERIFY !== "true") {
      const proofTweet = await twitter.findTweet(twitterHandle, `TC-${code}`);
      if (!proofTweet) {
        return res.status(403).json({
          error: "Tweet Proof not found. Please post the verification tweet first.",
          verifyText,
        });
      }
    }

    // Step 2: Fetch metrics + tweets
    const [metrics, tweets] = await Promise.all([
      twitter.getUserMetrics(twitterHandle),
      twitter.getUserTweets(twitterHandle, 50),
    ]);

    const avgEngagement = tweets.length
      ? Math.round(tweets.reduce((s, t) => s + t.likes + t.retweets, 0) / tweets.length)
      : 0;

    // Step 3: Claude AI analysis
    const aiData = await analyzeCityPersonality(tweets, { ...metrics, avgEngagement });

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

    res.json({ tokenId, txHash, ipfsCID, agentId, cityData: metadata });
  } catch (err) {
    console.error("[mint]", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sync
router.post("/sync", checkSyncCooldown, async (req, res) => {
  const { tokenId, twitterHandle } = req.body;

  if (!tokenId || !twitterHandle) {
    return res.status(400).json({ error: "tokenId and twitterHandle required" });
  }

  try {
    const twitter = getTwitterProvider();
    console.log("[sync] step1: fetching metrics+tweets");
    const [metrics, tweets] = await Promise.all([
      twitter.getUserMetrics(twitterHandle),
      twitter.getUserTweets(twitterHandle, 50),
    ]);
    console.log("[sync] step1 done: followers=" + metrics.followers + " tweets=" + tweets.length);

    const avgEngagement = tweets.length
      ? Math.round(tweets.reduce((s, t) => s + t.likes + t.retweets, 0) / tweets.length)
      : 0;

    console.log("[sync] step2: getCityData");
    const oldData = await getCityData(tokenId);
    const oldLevel = Number(oldData.city.level);
    const newLevel = calcLevel(metrics.followers);
    const isLevelUp = newLevel > oldLevel;
    const noIpfs = !oldData.city.ipfsCID || oldData.city.ipfsCID.length === 0;
    const noMetrics = oldData.city.followers === 0 && oldData.city.tweetCount === 0;

    let ipfsCID = "";
    let narrative = null;

    if (isLevelUp || noIpfs || noMetrics) {
      const aiData = await analyzeCityPersonality(tweets, { ...metrics, avgEngagement });
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

    console.log("[sync] step3: updateCity ipfsCID=" + (ipfsCID || "(empty)"));
    const result = await updateCity({
      tokenId,
      followers: metrics.followers,
      tweetCount: metrics.tweetCount,
      following: metrics.following,
      engagement: avgEngagement,
      ipfsCID,
    });
    console.log("[sync] step3 done: txHash=" + result.txHash);

    // ERC-8004: oracle validates city metrics on-chain (ValidationRegistry)
    console.log("[sync] step4: getTokenAgentId");
    const cityAgentId = await getTokenAgentId(tokenId).catch(() => 0);
    console.log("[sync] step4 done: cityAgentId=" + cityAgentId);
    if (cityAgentId) {
      console.log("[sync] step5: recordValidation");
      await recordValidation(tokenId, cityAgentId, metrics.followers, metrics.tweetCount, metrics.following);
      console.log("[sync] step5 done");
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

    res.json({ ...data, city: { ...data.city, twitterHandle }, ipfsData });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

// GET /api/leaderboard
router.get("/leaderboard", async (req, res) => {
  try {
    const board = await getLeaderboard(10);
    res.json(board);
  } catch (err) {
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

module.exports = router;
