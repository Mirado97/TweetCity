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
 *
 * All checks read X API under the city owner's own OAuth 2.0 token (via
 * TwitterOAuthProvider). Cities whose owner hasn't linked their X account
 * skip with reason "owner has not linked X" — admin can Force Verify manually.
 */

const TwitterOAuthProvider = require("./twitter/TwitterOAuthProvider");
const oauthStore = require("../storage/oauthStore");
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

let _oauth = null;
function getOAuth() {
  if (_oauth) return _oauth;
  _oauth = new TwitterOAuthProvider();
  return _oauth;
}

function mentionsHandle(text, handle) {
  if (!text || !handle) return false;
  return new RegExp(`@${handle}\\b`, "i").test(text);
}

async function findEngagement(cityHandle, tweetId, kind) {
  const lookback = Number(process.env.GIFT_ORACLE_LOOKBACK || 100);
  const tweets = await getOAuth().getUserTweetsWithMeta(cityHandle, lookback);
  return tweets.find((t) => {
    if (kind === "retweet") return t.isRetweet && t.retweetedTweetId === String(tweetId);
    if (kind === "quote")   return t.isQuote   && t.quotedTweetId    === String(tweetId);
    if (kind === "reply")   return t.isReply   && t.replyToTweetId   === String(tweetId);
    return false;
  });
}

async function didMentionPost(cityHandle, gift) {
  // Buyer handle lives in the tweet URL: x.com/<handle>/status/<id>
  const m = String(gift.tweetUrl || "").match(/(?:twitter\.com|x\.com)\/([^/]+)\/status\//i);
  const buyerHandle = m ? m[1].toLowerCase() : null;
  if (!buyerHandle) return null;

  const lookback = Number(process.env.GIFT_ORACLE_LOOKBACK || 100);
  const tweets = await getOAuth().getUserTweetsWithMeta(cityHandle, lookback);
  const sinceTs = gift.createdAt; // seconds
  return tweets.find((t) => {
    if (t.isRetweet || t.isReply) return false;
    const ts = t.createdAt ? Math.floor(Date.parse(t.createdAt) / 1000) : 0;
    if (sinceTs && ts && ts < sinceTs) return false;
    return mentionsHandle(t.text, buyerHandle);
  });
}

/**
 * Twitter doesn't let you pin someone else's tweet directly.
 * Owners typically quote-tweet (or retweet/reply with link) the buyer's tweet
 * and pin THAT. Accept any of these.
 */
async function isPinned(cityHandle, tweetId) {
  const oauth = getOAuth();
  const profile = await oauth.getProfileWithPinned(cityHandle);
  if (!profile.pinnedTweetId) return false;
  if (profile.pinnedTweetId === String(tweetId)) return true;

  const lookback = Number(process.env.GIFT_ORACLE_LOOKBACK || 100);
  const tweets = await oauth.getUserTweetsWithMeta(cityHandle, lookback);
  const pinned = tweets.find((t) => String(t.id) === profile.pinnedTweetId);
  if (!pinned) {
    return (profile.pinnedText || "").includes(`/status/${tweetId}`);
  }
  if (pinned.isQuote   && pinned.quotedTweetId    === String(tweetId)) return true;
  if (pinned.isRetweet && pinned.retweetedTweetId === String(tweetId)) return true;
  if (pinned.isReply   && pinned.replyToTweetId   === String(tweetId)) return true;
  if ((pinned.text || "").includes(`/status/${tweetId}`)) return true;
  return false;
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

  if (!oauthStore.get(cityHandle)) {
    return { ok: false, reason: `owner @${cityHandle} has not linked X via OAuth — Force Verify or wait for owner to connect` };
  }

  try {
    switch (gift.giftType) {
      case GIFT_TYPE.Graffiti: {
        const likedIds = await getOAuth().getLikedTweetIds(cityHandle);
        return likedIds.has(String(tweetId))
          ? { ok: true,  reason: "owner liked the tweet" }
          : { ok: false, reason: "tweet not in owner's recent likes" };
      }
      case GIFT_TYPE.StreetArt: {
        const [likedIds, retweet] = await Promise.all([
          getOAuth().getLikedTweetIds(cityHandle),
          findEngagement(cityHandle, tweetId, "retweet"),
        ]);
        if (!retweet)                            return { ok: false, reason: "retweet missing" };
        if (!likedIds.has(String(tweetId)))      return { ok: false, reason: "like missing" };
        return { ok: true, reason: "like + retweet detected" };
      }
      case GIFT_TYPE.Flag: {
        const reply = await findEngagement(cityHandle, tweetId, "reply");
        return reply
          ? { ok: true,  reason: "reply detected", evidence: reply.id }
          : { ok: false, reason: "reply not found" };
      }
      case GIFT_TYPE.Billboard: {
        const quote = await findEngagement(cityHandle, tweetId, "quote");
        return quote
          ? { ok: true,  reason: "quote detected", evidence: quote.id }
          : { ok: false, reason: "quote not found" };
      }
      case GIFT_TYPE.Monument: {
        const post = await didMentionPost(cityHandle, gift);
        return post
          ? { ok: true,  reason: "mention post detected", evidence: post.id }
          : { ok: false, reason: "mention post not found" };
      }
      case GIFT_TYPE.District: {
        const pinned = await isPinned(cityHandle, tweetId);
        return pinned
          ? { ok: true,  reason: "tweet is pinned" }
          : { ok: false, reason: "tweet not pinned on owner's profile" };
      }
      default:
        return { ok: false, reason: `unknown giftType ${gift.giftType}` };
    }
  } catch (e) {
    return { ok: false, reason: `X API error: ${e.message}` };
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
  _internal: { mentionsHandle },
};
