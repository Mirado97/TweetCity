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
    const items = await this._runSync("automation-lab~twitter-scraper", {
      usernames: [handle],
      maxItems: 1,
      mode: "profiles",
    });
    const user = items[0];
    if (!user) throw new Error(`User @${handle} not found via Apify`);
    if (process.env.APIFY_DEBUG) console.log("[ApifyProvider] raw user keys:", Object.keys(user));
    return {
      followers: user.followers ?? 0,
      tweetCount: user.tweetsCount ?? 0,
      following: user.following ?? 0,
      name: user.name,
      username: user.username ?? handle,
    };
  }

  async getUserTweets(handle, count = 50) {
    const items = await this._runAsync("automation-lab~twitter-scraper", {
      usernames: [handle],
      maxResults: count,
      mode: "user-tweets",
    });
    if (process.env.APIFY_DEBUG && items[0]) console.log("[ApifyProvider] raw tweet keys:", Object.keys(items[0]));
    return items.map((t) => ({
      text: t.text ?? "",
      likes: t.likeCount ?? 0,
      retweets: t.retweetCount ?? 0,
      createdAt: t.createdAt ?? "",
    }));
  }

  async findTweet(handle, searchText) {
    const tweets = await this.getUserTweets(handle, 20);
    return tweets.find((t) => t.text.includes(searchText)) || null;
  }
}

module.exports = ApifyProvider;
