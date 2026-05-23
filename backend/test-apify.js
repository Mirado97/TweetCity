require("dotenv").config();
const ApifyProvider = require("./src/services/twitter/ApifyProvider");

async function main() {
  const twitter = new ApifyProvider();
  const handle = "miradonas";

  console.log("Testing getUserMetrics...");
  const metrics = await twitter.getUserMetrics(handle);
  console.log(metrics);

  console.log("\nTesting getUserTweets (5)...");
  const tweets = await twitter.getUserTweets(handle, 5);
  console.log(tweets);
}

main().catch(console.error);
