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

  async _run(actorId, input) {
    const token = this._nextKey();
    const runRes = await fetch(
      `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${token}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }
    );
    if (!runRes.ok) throw new Error(`Apify error: ${runRes.status}`);
    return runRes.json();
  }

  async getUserMetrics(handle) {
    const items = await this._run("automation-lab~twitter-scraper", {
      usernames: [handle],
      maxItems: 1,
      scrapeType: "user",
    });
    const user = items[0];
    if (!user) throw new Error(`User @${handle} not found via Apify`);
    return {
      followers: user.followersCount ?? user.followers_count ?? user.followers ?? 0,
      tweetCount: user.statusesCount ?? user.statuses_count ?? user.tweetCount ?? 0,
      following: user.followingCount ?? user.friends_count ?? user.following ?? 0,
      name: user.name,
      username: user.username ?? user.screen_name ?? handle,
    };
  }

  async getUserTweets(handle, count = 50) {
    const items = await this._run("automation-lab~twitter-scraper", {
      usernames: [handle],
      maxItems: count,
      scrapeType: "tweets",
    });
    return items.map((t) => ({
      text: t.text ?? t.full_text ?? "",
      likes: t.likeCount ?? t.favorite_count ?? 0,
      retweets: t.retweetCount ?? t.retweet_count ?? 0,
      createdAt: t.createdAt ?? t.created_at ?? "",
    }));
  }

  async findTweet(handle, searchText) {
    const tweets = await this.getUserTweets(handle, 20);
    return tweets.find((t) => t.text.includes(searchText)) || null;
  }
}

module.exports = ApifyProvider;
