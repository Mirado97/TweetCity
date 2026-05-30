const ITwitterProvider = require("./ITwitterProvider");

class ApifyProvider extends ITwitterProvider {
  constructor() {
    super();
    // Collect all keys: APIFY_API_TOKEN_1..12 or single APIFY_API_TOKEN.
    // Loop instead of listing each — easier to extend.
    this.keys = [];
    for (let i = 1; i <= 12; i++) {
      const k = process.env[`APIFY_API_TOKEN_${i}`];
      if (k) this.keys.push(k);
    }
    if (process.env.APIFY_API_TOKEN) this.keys.push(process.env.APIFY_API_TOKEN);

    if (this.keys.length === 0) throw new Error("No Apify API keys set");
    this._keyIndex = 0;

    // Actor for tweets/profiles. Override via APIFY_TWEET_ACTOR on Railway
    // to switch to a cheaper one (e.g. "kaitoeasyapi~twitter-x-data-tweet-scraper-pay-per-result-cheapest", ~$0.25/1K).
    this.tweetActor = process.env.APIFY_TWEET_ACTOR || "automation-lab~twitter-scraper";
    this.isKaito = this.tweetActor.startsWith("kaitoeasyapi");
  }

  /**
   * Build the input payload in the right format for the current actor.
   * - kaitoeasyapi: { from, maxItems, queryType, twitterCookie? }
   * - automation-lab: { mode: "search"|"user-tweets", searchTerms|usernames, ... }
   */
  _buildTweetsInput(handle, count) {
    const cookie = process.env.TWITTER_COOKIE;
    if (this.isKaito) {
      const input = {
        from: handle,
        maxItems: Math.max(20, count),
        queryType: "Latest",
      };
      if (cookie) input.twitterCookie = cookie;
      return input;
    }
    if (cookie) {
      return {
        mode: "search",
        searchTerms: [`from:${handle}`],
        maxResults: count,
        searchMode: "Latest",
        twitterCookie: cookie,
      };
    }
    return { mode: "user-tweets", usernames: [handle], maxResults: count };
  }

  /**
   * kaitoeasyapi runs are short and cheap → always sync.
   * automation-lab without cookie needs the async polling path.
   */
  async _runTweets(input) {
    if (this.isKaito || process.env.TWITTER_COOKIE) {
      return this._runSync(this.tweetActor, input);
    }
    return this._runAsync(this.tweetActor, input);
  }

  _nextKey() {
    const key = this.keys[this._keyIndex % this.keys.length];
    this._keyIndex++;
    return key;
  }

  async _runSync(actorId, input) {
    const token = this._nextKey();
    const res = await fetch(
      `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${token}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }
    );
    if (!res.ok) throw new Error(`Apify error: ${res.status}`);
    return res.json();
  }

  async _runAsync(actorId, input) {
    const token = this._nextKey();
    const startRes = await fetch(
      `https://api.apify.com/v2/acts/${actorId}/runs?token=${token}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }
    );
    if (!startRes.ok) throw new Error(`Apify start error: ${startRes.status}`);
    const { data: run } = await startRes.json();
    const runId = run.id;
    const datasetId = run.defaultDatasetId;

    // Poll until done (max 90s)
    for (let i = 0; i < 18; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const statusRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${token}`);
      const { data: status } = await statusRes.json();
      if (status.status === "SUCCEEDED") break;
      if (status.status === "FAILED" || status.status === "ABORTED")
        throw new Error(`Apify run ${status.status}`);
    }

    const itemsRes = await fetch(
      `https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}&limit=200`
    );
    if (!itemsRes.ok) throw new Error(`Apify dataset error: ${itemsRes.status}`);
    return itemsRes.json();
  }

  async getUserMetrics(handle) {
    // kaitoeasyapi has no profile-only mode → profile lives inside each tweet's author.
    if (this.isKaito) {
      const items = await this._runTweets(this._buildTweetsInput(handle, 20));
      const t = items[0];
      if (!t?.author) throw new Error(`User @${handle} not found via Apify`);
      const u = t.author;
      if (process.env.APIFY_DEBUG) console.log("[ApifyProvider] author keys:", Object.keys(u));
      return {
        followers:  Number(u.followers  ?? u.followersCount ?? 0),
        tweetCount: Number(u.statusesCount ?? u.tweetsCount ?? u.tweetCount ?? 0),
        following:  Number(u.following   ?? u.followingCount ?? u.friendsCount ?? 0),
        username:   u.userName ?? u.username ?? handle,
      };
    }

    // automation-lab: dedicated profiles mode.
    const cookie = process.env.TWITTER_COOKIE;
    const input = { usernames: [handle], maxItems: 1, mode: "profiles" };
    if (cookie) input.twitterCookie = cookie;

    try {
      const items = await this._runSync(this.tweetActor, input);
      const user = items[0];
      if (process.env.APIFY_DEBUG && user) console.log("[ApifyProvider] profile keys:", Object.keys(user));
      if (user) {
        return {
          followers:  Number(user.followers  ?? user.followersCount ?? 0),
          tweetCount: Number(user.tweetsCount ?? user.statusesCount ?? user.tweetCount ?? 0),
          following:  Number(user.following   ?? user.friendsCount  ?? user.followingCount ?? 0),
          username:   user.username ?? handle,
        };
      }
    } catch (e) {
      console.warn("[ApifyProvider] profiles mode failed, falling back to search:", e.message);
    }

    // Fallback: extract author data from first tweet in search mode.
    if (cookie) {
      const items = await this._runSync(this.tweetActor, {
        mode: "search",
        searchTerms: [`from:${handle}`],
        maxResults: 5,
        searchMode: "Latest",
        twitterCookie: cookie,
      });
      const t = items[0];
      if (process.env.APIFY_DEBUG && t) console.log("[ApifyProvider] search tweet keys:", Object.keys(t));
      if (t) {
        return {
          followers:  Number(t.authorFollowers ?? 0),
          tweetCount: 0,
          following:  0,
          username:   handle,
        };
      }
    }

    throw new Error(`User @${handle} not found via Apify`);
  }

  async getUserTweets(handle, count = 50) {
    const items = await this._runTweets(this._buildTweetsInput(handle, count));
    if (process.env.APIFY_DEBUG && items[0]) console.log("[ApifyProvider] raw tweet keys:", Object.keys(items[0]));
    return items
      .filter((t) => !t.isRetweet && !t.isReply)
      .map((t) => ({
        text: t.text ?? "",
        likes: t.likeCount ?? 0,
        retweets: t.retweetCount ?? 0,
        createdAt: t.createdAt ?? "",
      }));
  }

  // ─── Gift oracle helpers ──────────────────────────────────────────────

  /**
   * Like getUserTweets but WITHOUT filtering retweets/replies,
   * and preserves engagement metadata used by the gift oracle.
   */
  async getUserTweetsWithMeta(handle, count = 50) {
    const items = await this._runTweets(this._buildTweetsInput(handle, count));

    if (process.env.APIFY_DEBUG && items[0]) {
      console.log("[ApifyProvider] meta tweet keys:", Object.keys(items[0]));
    }

    return items.map((t) => {
      // Apify actors return inconsistent field names — normalize them all.
      const id = String(t.id ?? t.tweetId ?? t.id_str ?? "");
      const replyToTweetId  = String(t.inReplyToId ?? t.replyToId ?? t.in_reply_to_status_id_str ?? "") || null;
      const replyToUsername = (t.inReplyToUsername ?? t.replyToUsername ?? t.in_reply_to_screen_name ?? "").toLowerCase() || null;
      const quoted          = t.quotedTweet ?? t.quoted_status ?? null;
      const quotedTweetId   = String(quoted?.id ?? quoted?.id_str ?? "") || null;
      const quotedUsername  = (quoted?.author?.userName ?? quoted?.author?.username ?? quoted?.user?.screen_name ?? "").toLowerCase() || null;
      const retweeted       = t.retweetedTweet ?? t.retweeted_status ?? null;
      const retweetedTweetId   = String(retweeted?.id ?? retweeted?.id_str ?? "") || null;
      const retweetedUsername  = (retweeted?.author?.userName ?? retweeted?.author?.username ?? retweeted?.user?.screen_name ?? "").toLowerCase() || null;
      return {
        id,
        text:            t.text ?? "",
        likes:           Number(t.likeCount    ?? t.favorite_count ?? 0),
        retweets:        Number(t.retweetCount ?? t.retweet_count  ?? 0),
        createdAt:       t.createdAt ?? "",
        isRetweet:       !!(t.isRetweet ?? retweetedTweetId),
        isReply:         !!(t.isReply   ?? replyToTweetId),
        isQuote:         !!(t.isQuote   ?? quotedTweetId),
        replyToTweetId,
        replyToUsername,
        quotedTweetId,
        quotedUsername,
        retweetedTweetId,
        retweetedUsername,
      };
    });
  }

  /**
   * Returns lowercased usernames who liked a given tweet.
   * Actor configurable via APIFY_LIKERS_ACTOR env (default: kaitoeasyapi tweet-likers).
   */
  async getTweetLikers(tweetId) {
    const actor = process.env.APIFY_LIKERS_ACTOR || "kaitoeasyapi~twitter-x-tweet-likes-scraper";
    const cookie = process.env.TWITTER_COOKIE;

    const input = {
      tweet_ids: [String(tweetId)],
      tweetIds:  [String(tweetId)],          // some actors use camelCase
      tweetUrls: [`https://x.com/i/status/${tweetId}`],
      maxItems:  Number(process.env.APIFY_LIKERS_MAX || 200),
    };
    if (cookie) input.twitterCookie = cookie;

    let items;
    try {
      items = await this._runSync(actor, input);
    } catch (e) {
      console.warn(`[ApifyProvider] getTweetLikers actor "${actor}" failed:`, e.message);
      // Distinguish actor failure (return null) from "actor ran but no likers" (empty Set).
      // Callers can fall back to other engagement signals when the actor is dead.
      return null;
    }

    const users = new Set();
    for (const it of items || []) {
      const u = it.username ?? it.user?.username ?? it.user?.screen_name ?? it.screen_name;
      if (u) users.add(String(u).toLowerCase());
    }
    if (process.env.APIFY_DEBUG) console.log(`[ApifyProvider] tweet ${tweetId} likers: ${users.size}`);
    return users;
  }

  /**
   * Profile including the pinned tweet (id + text).
   */
  async getProfileWithPinned(handle) {
    // kaitoeasyapi: profile is embedded in t.author; pinnedTweetIds is an array.
    // The pinned tweet itself should appear in the returned tweets list.
    if (this.isKaito) {
      const items = await this._runTweets(this._buildTweetsInput(handle, 100));
      const first = items[0];
      if (!first?.author) throw new Error(`User @${handle} not found via Apify`);
      const u = first.author;
      if (process.env.APIFY_DEBUG) console.log("[ApifyProvider] author keys:", Object.keys(u));

      const pinnedArr = u.pinnedTweetIds ?? u.pinned_tweet_ids ?? [];
      const pinnedTweetId = pinnedArr[0] ? String(pinnedArr[0]) : null;
      const pinned = pinnedTweetId ? items.find((t) => String(t.id) === pinnedTweetId) : null;

      return {
        username:   u.userName ?? u.username ?? handle,
        followers:  Number(u.followers   ?? u.followersCount ?? 0),
        tweetCount: Number(u.statusesCount ?? u.tweetsCount  ?? 0),
        following:  Number(u.following   ?? u.followingCount ?? 0),
        pinnedTweetId,
        pinnedText: pinned?.text ?? "",
      };
    }

    // automation-lab: dedicated profiles mode.
    const cookie = process.env.TWITTER_COOKIE;
    const input = { usernames: [handle], maxItems: 1, mode: "profiles" };
    if (cookie) input.twitterCookie = cookie;

    const items = await this._runSync(this.tweetActor, input);
    const user = items[0];
    if (!user) throw new Error(`User @${handle} not found via Apify`);
    if (process.env.APIFY_DEBUG) console.log("[ApifyProvider] profile keys:", Object.keys(user));

    const pinned = user.pinnedTweet ?? user.pinned_tweet ?? null;
    const pinnedTweetId = String(user.pinnedTweetId ?? user.pinned_tweet_id ?? pinned?.id ?? pinned?.id_str ?? "") || null;
    const pinnedText    = pinned?.text ?? pinned?.full_text ?? "";

    return {
      username:   user.username  ?? handle,
      followers:  Number(user.followers   ?? user.followersCount ?? 0),
      tweetCount: Number(user.tweetsCount ?? user.statusesCount  ?? 0),
      following:  Number(user.following   ?? user.friendsCount   ?? 0),
      pinnedTweetId,
      pinnedText,
    };
  }

  async findTweet(handle, searchText) {
    // kaitoeasyapi: no text-query filter — list latest tweets and grep locally.
    if (this.isKaito) {
      const items = await this._runTweets(this._buildTweetsInput(handle, 100));
      const hit = items.find((t) => (t.text ?? "").includes(searchText));
      return hit ? { text: hit.text, likes: hit.likeCount ?? 0, retweets: hit.retweetCount ?? 0 } : null;
    }

    const cookie = process.env.TWITTER_COOKIE;
    if (!cookie) {
      const tweets = await this.getUserTweets(handle, 20);
      return tweets.find((t) => t.text.includes(searchText)) || null;
    }

    const items = await this._runSync(this.tweetActor, {
      mode: "search",
      searchTerms: [`from:${handle} ${searchText.slice(0, 60)}`],
      maxResults: 5,
      searchMode: "Latest",
      twitterCookie: cookie,
    });
    const hit = items.find((t) => t.text && t.text.includes(searchText));
    return hit ? { text: hit.text, likes: hit.likeCount ?? 0, retweets: hit.retweetCount ?? 0 } : null;
  }
}

module.exports = ApifyProvider;
