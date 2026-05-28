/**
 * Gift Oracle — verifies that city owners completed promised Twitter engagements
 * for each Accepted gift, then calls verifyEngagement() on the CityGifts contract
 * to release the locked funds.
 *
 * Action requirements per GiftType (see CityGifts.sol):
 *   Graffiti (0)  — like the tweet
 *   StreetArt (1) — like + retweet
 *   Flag (2)      — comment on (reply to) the tweet
 *   Billboard (3) — quote the tweet
 *   Monument (4)  — dedicated post mentioning the buyer
 *   District (5)  — pin the tweet for 7 days
 */

const ApifyProvider = require("./twitter/ApifyProvider");
const {
  getTotalCities, getGiftsForCity, verifyGiftEngagement,
  getHandleByTokenId, GIFT_STATUS, GIFT_TYPE,
} = require("./contract");

const TWEET_ID_RE = /(?:twitter\.com|x\.com)\/[^/]+\/status\/(\d+)/i;

function parseTweetId(url) {
  if (!url) return null;
  const m = String(url).match(TWEET_ID_RE);
  return m ? m[1] : null;
}

// Lazy Apify singleton — oracle always uses Apify regardless of TWITTER_PROVIDER
let _twitter = null;
function getApify() {
  if (_twitter) return _twitter;
  _twitter = new ApifyProvider();
  return _twitter;
}

/**
 * Was the city owner mentioned in the buyer's tweet?
 * The buyer's tweet text must contain "@cityHandle".
 */
function mentionsHandle(text, handle) {
  if (!text || !handle) return false;
  return new RegExp(`@${handle}\\b`, "i").test(text);
}

/**
 * Did the city owner like the tweet?
 */
async function didLike(twitter, cityHandle, tweetId) {
  const likers = await twitter.getTweetLikers(tweetId);
  return likers.has(cityHandle.toLowerCase());
}

/**
 * Did the city owner retweet, quote, or reply to the tweet?
 * Reuses one fetch of the owner's recent tweets with meta.
 */
async function findEngagement(twitter, cityHandle, tweetId, kind) {
  const lookback = Number(process.env.GIFT_ORACLE_LOOKBACK || 100);
  const tweets = await twitter.getUserTweetsWithMeta(cityHandle, lookback);
  return tweets.find((t) => {
    if (kind === "retweet") return t.isRetweet && t.retweetedTweetId === String(tweetId);
    if (kind === "quote")   return t.isQuote   && t.quotedTweetId    === String(tweetId);
    if (kind === "reply")   return t.isReply   && t.replyToTweetId   === String(tweetId);
    return false;
  });
}

/**
 * Did the city owner publish a NEW post mentioning the buyer's handle?
 * We need the buyer's handle — extract it from the gift's tweetUrl path.
 */
async function didMentionPost(twitter, cityHandle, gift) {
  // Buyer handle lives in the tweet URL: x.com/<handle>/status/<id>
  const m = String(gift.tweetUrl || "").match(/(?:twitter\.com|x\.com)\/([^/]+)\/status\//i);
  const buyerHandle = m ? m[1].toLowerCase() : null;
  if (!buyerHandle) return null;

  const lookback = Number(process.env.GIFT_ORACLE_LOOKBACK || 100);
  const tweets = await twitter.getUserTweetsWithMeta(cityHandle, lookback);
  // Find any non-retweet, non-reply post AFTER the gift was accepted that @-mentions the buyer.
  const sinceTs = gift.createdAt; // seconds
  return tweets.find((t) => {
    if (t.isRetweet || t.isReply) return false;
    const ts = t.createdAt ? Math.floor(Date.parse(t.createdAt) / 1000) : 0;
    if (sinceTs && ts && ts < sinceTs) return false;
    return mentionsHandle(t.text, buyerHandle);
  });
}

/**
 * Has the city owner pinned the buyer's tweet?
 */
async function isPinned(twitter, cityHandle, tweetId) {
  const profile = await twitter.getProfileWithPinned(cityHandle);
  return profile.pinnedTweetId === String(tweetId);
}

/**
 * Verifies a single gift's required action.
 * Returns { ok: bool, reason: string, evidence?: any }
 */
async function verifyGiftAction(gift, cityHandle) {
  if (process.env.SKIP_GIFT_VERIFY === "true") {
    return { ok: true, reason: "SKIP_GIFT_VERIFY=true (demo mode)" };
  }

  const tweetId = parseTweetId(gift.tweetUrl);
  if (!tweetId) return { ok: false, reason: "invalid tweet URL" };

  const twitter = getApify();

  try {
    switch (gift.giftType) {
      case GIFT_TYPE.Graffiti: {
        const liked = await didLike(twitter, cityHandle, tweetId);
        return liked
          ? { ok: true, reason: "owner liked the tweet" }
          : { ok: false, reason: "like not found" };
      }
      case GIFT_TYPE.StreetArt: {
        const [liked, retweet] = await Promise.all([
          didLike(twitter, cityHandle, tweetId),
          findEngagement(twitter, cityHandle, tweetId, "retweet"),
        ]);
        if (!liked)   return { ok: false, reason: "like missing" };
        if (!retweet) return { ok: false, reason: "retweet missing" };
        return { ok: true, reason: "like + retweet detected" };
      }
      case GIFT_TYPE.Flag: {
        const reply = await findEngagement(twitter, cityHandle, tweetId, "reply");
        return reply
          ? { ok: true, reason: "reply detected", evidence: reply.id }
          : { ok: false, reason: "reply not found" };
      }
      case GIFT_TYPE.Billboard: {
        const quote = await findEngagement(twitter, cityHandle, tweetId, "quote");
        return quote
          ? { ok: true, reason: "quote detected", evidence: quote.id }
          : { ok: false, reason: "quote not found" };
      }
      case GIFT_TYPE.Monument: {
        const post = await didMentionPost(twitter, cityHandle, gift);
        return post
          ? { ok: true, reason: "mention post detected", evidence: post.id }
          : { ok: false, reason: "mention post not found" };
      }
      case GIFT_TYPE.District: {
        const pinned = await isPinned(twitter, cityHandle, tweetId);
        return pinned
          ? { ok: true, reason: "tweet is pinned" }
          : { ok: false, reason: "tweet not pinned on owner's profile" };
      }
      default:
        return { ok: false, reason: `unknown giftType ${gift.giftType}` };
    }
  } catch (e) {
    return { ok: false, reason: `provider error: ${e.message}` };
  }
}

/**
 * Iterates all cities, finds Accepted gifts within their engage window,
 * verifies each, and calls verifyEngagement on-chain for successful ones.
 */
async function runSweep({ dryRun = false } = {}) {
  if (!process.env.GIFTS_CONTRACT_ADDRESS) {
    return { skipped: true, reason: "GIFTS_CONTRACT_ADDRESS not set" };
  }

  const total = await getTotalCities().catch((e) => {
    console.warn("[giftOracle] totalSupply failed:", e.message);
    return 0;
  });

  const now = Math.floor(Date.now() / 1000);
  const stats = { scanned: 0, eligible: 0, verified: 0, failed: 0, errors: [] };

  for (let tokenId = 1; tokenId <= total; tokenId++) {
    let gifts;
    try {
      gifts = await getGiftsForCity(tokenId);
    } catch (e) {
      stats.errors.push({ tokenId, error: e.message });
      continue;
    }

    const accepted = gifts.filter(
      (g) => g.status === GIFT_STATUS.Accepted && g.engageDeadline > now
    );
    stats.scanned += gifts.length;
    stats.eligible += accepted.length;

    if (accepted.length === 0) continue;

    const cityHandle = await getHandleByTokenId(tokenId).catch(() => "");
    if (!cityHandle) {
      stats.errors.push({ tokenId, error: "no twitter handle" });
      continue;
    }

    for (const gift of accepted) {
      const result = await verifyGiftAction(gift, cityHandle);
      console.log(`[giftOracle] gift #${gift.id} (type=${gift.giftType}, city=${cityHandle}): ${result.ok ? "VERIFIED" : "skip"} — ${result.reason}`);

      if (!result.ok) { stats.failed++; continue; }
      if (dryRun)     { stats.verified++; continue; }

      try {
        await verifyGiftEngagement(gift.id);
        stats.verified++;
      } catch (e) {
        stats.errors.push({ giftId: gift.id, error: e.message });
        stats.failed++;
      }
    }
  }

  console.log(`[giftOracle] sweep done:`, stats);
  return stats;
}

module.exports = {
  parseTweetId, verifyGiftAction, runSweep,
  // exposed for tests
  _internal: { mentionsHandle },
};
