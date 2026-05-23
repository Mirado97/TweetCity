const ITwitterProvider = require("./ITwitterProvider");

// Fallback if Twikit breaks. Requires APIFY_API_TOKEN in env.
class ApifyProvider extends ITwitterProvider {
  constructor() {
    super();
    this.token = process.env.APIFY_API_TOKEN;
    if (!this.token) throw new Error("APIFY_API_TOKEN not set");
  }

  async _run(actorId, input) {
    const runRes = await fetch(
      `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${this.token}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }
    );
    if (!runRes.ok) throw new Error(`Apify error: ${runRes.status}`);
    return runRes.json();
  }

  async getUserMetrics(handle) {
    const items = await this._run("apidojo~tweet-scraper", {
      twitterHandles: [handle], maxItems: 1, includeUserInfo: true,
    });
    const user = items[0]?.author;
    if (!user) throw new Error(`User @${handle} not found via Apify`);
    return {
      followers: user.followers,
      tweetCount: user.statusesCount,
      following: user.following,
      name: user.name,
      username: user.userName,
    };
  }

  async getUserTweets(handle, count = 50) {
    const items = await this._run("apidojo~tweet-scraper", {
      twitterHandles: [handle], maxItems: count,
    });
    return items.map((t) => ({
      text: t.text,
      likes: t.likeCount,
      retweets: t.retweetCount,
      createdAt: t.createdAt,
    }));
  }

  async findTweet(handle, searchText) {
    const tweets = await this.getUserTweets(handle, 20);
    return tweets.find((t) => t.text.includes(searchText)) || null;
  }
}

module.exports = ApifyProvider;
