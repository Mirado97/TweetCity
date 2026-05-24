const fs = require("fs");
const path = require("path");

const CACHE_FILE = path.join(__dirname, "../../ipfs-cache.json");

// Load from file on startup
let metadataCache = {};
try {
  if (fs.existsSync(CACHE_FILE)) {
    metadataCache = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
  }
} catch {}

function saveCache() {
  try { fs.writeFileSync(CACHE_FILE, JSON.stringify(metadataCache), "utf8"); } catch {}
}

async function uploadMetadata(metadata) {
  const res = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      pinata_api_key: process.env.PINATA_API_KEY,
      pinata_secret_api_key: process.env.PINATA_SECRET_KEY,
    },
    body: JSON.stringify({
      pinataContent: metadata,
      pinataMetadata: { name: `TweetCity-${metadata.twitterHandle || "city"}-${Date.now()}` },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Pinata error ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  const cid = data.IpfsHash;
  metadataCache[cid] = metadata;
  saveCache();
  return cid;
}

function getCachedMetadata(cid) {
  return metadataCache[cid] || null;
}

module.exports = { uploadMetadata, getCachedMetadata };
