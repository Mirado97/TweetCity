require("dotenv").config();
const { analyzeCityPersonality } = require("./src/services/claude");

const fakeTweets = [
  { text: "Just shipped a new DeFi protocol on Mantle! Yield farming is live.", likes: 120, retweets: 30 },
  { text: "Blockchain tech is the future of finance. Building in web3 every day.", likes: 80, retweets: 15 },
  { text: "Excited about the Mantle Testnet. Gas fees are insanely low!", likes: 200, retweets: 55 },
];

const fakeMetrics = { followers: 172, tweetCount: 1930, following: 207, avgEngagement: 80 };

async function main() {
  console.log("Testing Claude analyzeCityPersonality...");
  const result = await analyzeCityPersonality(fakeTweets, fakeMetrics);
  console.log("Result:", JSON.stringify(result, null, 2));
}

main().catch(console.error);
