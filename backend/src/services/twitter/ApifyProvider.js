const ITwitterProvider = require("./ITwitterProvider");

class ApifyProvider extends ITwitterProvider {
  constructor() {
    super();
    // Collect all keys: APIFY_API_TOKEN_1, APIFY_API_TOKEN_2, ... or single APIFY_API_TOKEN
    this.keys = [
      process.env.APIFY_API_TOKEN_1,
      process.env.APIFY_API_TOKEN_2,
      process.env.APIFY_API_TOKEN,
    ].filter(Boolean);

    if (this.keys.length === 0) throw new Error("No Apify API keys set");
    this._keyIndex = 0;
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
    const cookie = process.env.TWITTER_COOKIE;

    // Use search mode (same as getUserTweets) — reliable with cookie.
    // Extract author profile data from the first tweet object.
    if (cookie) {
      const items = await this._runSync("automation-lab~twitter-scraper", {
        mode: "search",
        searchTerms: [`from:${handle}`],
        maxResults: 5,
        searchMode: "Latest",
        twitterCookie: cookie,
      });
      const t = items[0];
      if (process.env.APIFY_DEBUG && t) console.log("[ApifyProvider] raw tweet keys:", Object.keys(t));
      if (t) {
        // Field names confirmed from automation-lab~twitter-scraper search mode output
        const followers  = Number(t.authorFollowers  ?? 0);
        const following  = Number(t.authorFollowing  ?? 0);
        const tweetCount = Number(t.authorTweetCount ?? t.authorTweetsCount ?? 0);
        return { followers, tweetCount, following, username: handle };
      }
    }

    // Fallback: profiles mode (no cookie or no tweets found)
    const input = { usernames: [handle], maxItems: 1, mode: "profiles" };
    if (cookie) input.twitterCookie = cookie;
    const items = await this._runSync("automation-lab~twitter-scraper", input);
    const user = items[0];
    if (!user) throw new Error(`User @${handle} not found via Apify`);
    return {
      followers:  user.followers  ?? user.followersCount ?? 0,
      tweetCount: user.tweetsCount ?? user.statusesCount ?? 0,
      following:  user.following  ?? user.friendsCount   ?? 0,
      username:   user.username   ?? handle,
    };
  }

  async getUserTweets(handle, count = 50) {
    const cookie = process.env.TWITTER_COOKIE;
    const input = cookie
      ? // Search mode with cookie — works even for restricted accounts
        {
          mode: "search",
          searchTerms: [`from:${handle}`],
          maxResults: count,
          searchMode: "Latest",
          twitterCookie: cookie,
        }
      : // Fallback: async user-tweets (may fail for restricted accounts)
        { mode: "user-tweets", usernames: [handle], maxResults: count };

    const items = cookie
      ? await this._runSync("automation-lab~twitter-scraper", input)
      : await this._runAsync("automation-lab~twitter-scraper", input);

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

  async findTweet(handle, searchText) {
    const cookie = process.env.TWITTER_COOKIE;
    if (!cookie) {
      // No cookie: try timeline only
      const tweets = await this.getUserTweets(handle, 20);
      return tweets.find((t) => t.text.includes(searchText)) || null;
    }

    // With cookie: search directly for the verification text
    const items = await this._runSync("automation-lab~twitter-scraper", {
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
