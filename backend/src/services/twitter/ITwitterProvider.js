class ITwitterProvider {
  // Returns { followers, tweetCount, following, name, username }
  async getUserMetrics(handle) { throw new Error("Not implemented"); }

  // Returns [{ text, likes, retweets, createdAt }]
  async getUserTweets(handle, count = 50) { throw new Error("Not implemented"); }

  // Returns tweet object or null
  async findTweet(handle, searchText) { throw new Error("Not implemented"); }
}

module.exports = ITwitterProvider;
