const TwikitProvider = require("./TwikitProvider");
const ApifyProvider = require("./ApifyProvider");

// Switch provider via TWITTER_PROVIDER env var: "twikit" (default) | "apify"
function getTwitterProvider() {
  const provider = process.env.TWITTER_PROVIDER || "twikit";
  if (provider === "apify") return new ApifyProvider();
  return new TwikitProvider();
}

module.exports = getTwitterProvider;
