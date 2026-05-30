/**
 * TwitterOAuthProvider — X API client backed by per-user OAuth 2.0 tokens
 * stored in oauthStore.
 *
 * Each method takes a cityHandle (e.g. "miradonas"); the provider looks up the
 * corresponding access token, auto-refreshes if expired, and calls X API
 * under that user's identity ("user context").
 *
 * If a handle isn't linked (no record in oauthStore), methods throw NotLinkedError —
 * callers can catch and fall back to Apify or skip.
 */

const oauthStore = require("../../storage/oauthStore");

// Optional proxy for RU dev — same trick as in routes/auth.js.
if (process.env.HTTPS_PROXY || process.env.HTTP_PROXY) {
  try {
    const { ProxyAgent, setGlobalDispatcher } = require("undici");
    setGlobalDispatcher(new ProxyAgent(process.env.HTTPS_PROXY || process.env.HTTP_PROXY));
  } catch {}
}

const CLIENT_ID     = process.env.TWITTER_CLIENT_ID;
const CLIENT_SECRET = process.env.TWITTER_CLIENT_SECRET;
const API_BASE      = "https://api.x.com";

class NotLinkedError extends Error {
  constructor(handle) {
    super(`@${handle} not linked via OAuth`);
    this.code = "NOT_LINKED";
  }
}

function basicAuthHeader() {
  return CLIENT_SECRET
    ? "Basic " + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64")
    : undefined;
}

async function refreshAccessToken(refreshToken) {
  const res = await fetch(`${API_BASE}/2/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      ...(basicAuthHeader() ? { Authorization: basicAuthHeader() } : {}),
    },
    body: new URLSearchParams({
      grant_type:    "refresh_token",
      refresh_token: refreshToken,
      client_id:     CLIENT_ID,
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`refresh ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

class TwitterOAuthProvider {
  /**
   * Returns a valid (non-expired) access token for the handle.
   * Auto-refreshes 60 s before the stored expiry. Updates oauthStore.
   */
  async _getValidToken(handle) {
    const rec = oauthStore.get(handle);
    if (!rec) throw new NotLinkedError(handle);

    const skewMs = 60 * 1000;
    if (rec.expiresAt && rec.expiresAt - skewMs > Date.now()) {
      return rec.accessToken;
    }
    if (!rec.refreshToken) {
      throw new Error(`@${handle}: access token expired, no refresh_token`);
    }

    const tok = await refreshAccessToken(rec.refreshToken);
    const next = {
      twitterUserId: rec.twitterUserId,
      accessToken:   tok.access_token,
      refreshToken:  tok.refresh_token || rec.refreshToken,
      expiresAt:     Date.now() + (Number(tok.expires_in) || 7200) * 1000,
      scope:         tok.scope || rec.scope,
    };
    oauthStore.upsert(handle, next);
    return next.accessToken;
  }

  async _get(handle, path) {
    const token = await this._getValidToken(handle);
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    if (!res.ok) throw new Error(`X API ${path} → ${res.status}: ${JSON.stringify(json)}`);
    return json;
  }

  /**
   * Profile with pinned tweet ID and text (text fetched separately if pinned exists).
   * Matches the shape used by giftOracle's isPinned().
   */
  async getProfileWithPinned(handle) {
    const me = await this._get(handle,
      "/2/users/me?user.fields=pinned_tweet_id,public_metrics,username");

    const data = me.data || {};
    const pinnedTweetId = data.pinned_tweet_id ? String(data.pinned_tweet_id) : null;
    let pinnedText = "";
    if (pinnedTweetId) {
      try {
        const t = await this._get(handle,
          `/2/tweets/${pinnedTweetId}?tweet.fields=text,referenced_tweets,entities`);
        pinnedText = t.data?.text || "";
      } catch (e) {
        console.warn(`[TwitterOAuthProvider] pinned tweet ${pinnedTweetId} fetch failed: ${e.message}`);
      }
    }
    const m = data.public_metrics || {};
    return {
      username:   data.username || handle,
      followers:  Number(m.followers_count ?? 0),
      tweetCount: Number(m.tweet_count     ?? 0),
      following:  Number(m.following_count ?? 0),
      pinnedTweetId,
      pinnedText,
    };
  }

  /**
   * Returns a Set of tweet IDs that @handle has liked recently.
   * Used for Graffiti / StreetArt verification (instead of "who liked THIS tweet").
   */
  async getLikedTweetIds(handle, max = 100) {
    const rec = oauthStore.get(handle);
    if (!rec?.twitterUserId) throw new NotLinkedError(handle);

    const json = await this._get(handle,
      `/2/users/${rec.twitterUserId}/liked_tweets?max_results=${Math.min(100, max)}`
      + `&tweet.fields=created_at,author_id`);

    const ids = new Set();
    for (const t of json.data || []) ids.add(String(t.id));
    return ids;
  }

  /**
   * User tweets with metadata needed for Flag (reply) / Billboard (quote) /
   * StreetArt (retweet) / Monument (mention) verifications.
   *
   * Returns the same shape as ApifyProvider.getUserTweetsWithMeta so giftOracle
   * helpers (findEngagement, didMentionPost, anyEngagement) work unchanged.
   */
  async getUserTweetsWithMeta(handle, count = 50) {
    const rec = oauthStore.get(handle);
    if (!rec?.twitterUserId) throw new NotLinkedError(handle);

    const json = await this._get(handle,
      `/2/users/${rec.twitterUserId}/tweets?max_results=${Math.min(100, Math.max(5, count))}`
      + `&tweet.fields=created_at,author_id,referenced_tweets,entities,in_reply_to_user_id`
      + `&expansions=referenced_tweets.id.author_id`);

    // Map expansions.users by id for username lookup of referenced tweets.
    const usersById = {};
    for (const u of json.includes?.users || []) usersById[u.id] = u;

    return (json.data || []).map((t) => {
      const refs = t.referenced_tweets || [];
      const replyRef   = refs.find((r) => r.type === "replied_to");
      const quoteRef   = refs.find((r) => r.type === "quoted");
      const retweetRef = refs.find((r) => r.type === "retweeted");

      // For each ref we know the target tweet id; author handle is resolved via expansions
      // (X API gives us the author_id of the referenced tweet's author).
      const includedTw = json.includes?.tweets || [];
      const findIncludedAuthor = (refId) => {
        const inc = includedTw.find((x) => String(x.id) === String(refId));
        if (!inc) return null;
        const u = usersById[inc.author_id];
        return u?.username?.toLowerCase() || null;
      };

      const replyUserId = t.in_reply_to_user_id ? String(t.in_reply_to_user_id) : null;
      const replyUsername = replyUserId
        ? (usersById[replyUserId]?.username?.toLowerCase() || null)
        : null;

      return {
        id:                String(t.id),
        text:              t.text || "",
        likes:             0, // not requested — public_metrics adds cost
        retweets:          0,
        createdAt:         t.created_at || "",
        isRetweet:         !!retweetRef,
        isReply:           !!replyRef,
        isQuote:           !!quoteRef,
        replyToTweetId:    replyRef   ? String(replyRef.id)   : null,
        replyToUsername:   replyUsername,
        quotedTweetId:     quoteRef   ? String(quoteRef.id)   : null,
        quotedUsername:    quoteRef   ? findIncludedAuthor(quoteRef.id) : null,
        retweetedTweetId:  retweetRef ? String(retweetRef.id) : null,
        retweetedUsername: retweetRef ? findIncludedAuthor(retweetRef.id) : null,
      };
    });
  }
}

module.exports = TwitterOAuthProvider;
module.exports.NotLinkedError = NotLinkedError;
