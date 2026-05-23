const { spawn } = require("child_process");
const path = require("path");
const ITwitterProvider = require("./ITwitterProvider");

const SCRAPER_PATH = path.join(__dirname, "../../../../twitter-scraper/scraper.py");

// Calls the Python Twikit microservice
async function callScraper(command, args) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ command, args });
    const proc = spawn("python", [SCRAPER_PATH, payload], { timeout: 30000 });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (d) => (stdout += d));
    proc.stderr.on("data", (d) => (stderr += d));

    proc.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error(`Twikit scraper failed (${code}): ${stderr}`));
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error(`Invalid JSON from scraper: ${stdout}`));
      }
    });
  });
}

class TwikitProvider extends ITwitterProvider {
  async getUserMetrics(handle) {
    const result = await callScraper("get_user_metrics", { handle });
    if (!result.ok) throw new Error(result.error);
    return result.data;
  }

  async getUserTweets(handle, count = 50) {
    const result = await callScraper("get_user_tweets", { handle, count });
    if (!result.ok) throw new Error(result.error);
    return result.data;
  }

  async findTweet(handle, searchText) {
    const result = await callScraper("find_tweet", { handle, search_text: searchText });
    if (!result.ok) throw new Error(result.error);
    return result.data; // null if not found
  }
}

module.exports = TwikitProvider;
