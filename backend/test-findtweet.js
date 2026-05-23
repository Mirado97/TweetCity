require("dotenv").config();

const TOKEN = process.env.APIFY_API_TOKEN_1;
const COOKIE = process.env.TWITTER_COOKIE;
const ACTOR = "automation-lab~twitter-scraper";

async function main() {
  console.log("Cookie set:", !!COOKIE);

  const res = await fetch(
    `https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?token=${TOKEN}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "search",
        searchTerms: ["from:miradonas TweetCity"],
        maxResults: 5,
        searchMode: "Latest",
        twitterCookie: COOKIE,
      }),
    }
  );

  console.log("Status:", res.status);
  const items = await res.json();
  console.log("Count:", items?.length);
  items?.forEach((t, i) => console.log(`[${i}]`, t.text?.slice(0, 100)));
}

main().catch(console.error);
