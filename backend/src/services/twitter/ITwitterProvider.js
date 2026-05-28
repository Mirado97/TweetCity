class ITwitterProvider {
  // Returns { followers, tweetCount, following, name, username }
  async getUserMetrics(handle) { throw new Error("Not implemented"); }

  // Returns [{ text, likes, retweets, createdAt }]
  async getUserTweets(handle, count = 50) { throw new Error("Not implemented"); }

  // Returns tweet object or null
  async findTweet(handle, searchText) { throw new Error("Not implemented"); }

  // ─── Optional methods used by gift oracle ──────────────────────────────
  // Returns [{ id, text, likes, retweets, createdAt,
  //   isRetweet, isReply, isQuote,
  //   replyToTweetId, replyToUsername,
  //   quotedTweetId, quotedUsername,
  //   retweetedTweetId, retweetedUsername }]
  async getUserTweetsWithMeta(handle, count = 50) { throw new Error("Not implemented"); }

  // Returns Set<string> of lowercased usernames who liked the tweet (best-effort)
  async getTweetLikers(tweetId) { throw new Error("Not implemented"); }

  // Returns { username, followers, tweetCount, following, pinnedTweetId, pinnedText }
  async getProfileWithPinned(handle) { throw new Error("Not implemented"); }
}

module.exports = ITwitterProvider;
