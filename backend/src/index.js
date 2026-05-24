require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const cityRoutes = require("./routes/city");
const { getCityData } = require("./services/contract");
const { getCachedMetadata } = require("./services/ipfs");

const app = express();
const PORT = process.env.PORT || 3001;

const LEVEL_NAMES = ["", "Village", "Town", "City", "Metropolis", "Megacity"];

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Share endpoint — returns HTML with OG/Twitter Card meta for the city.
// Twitter bot crawls this page for the rich preview; users get redirected to the SPA.
app.get("/share/city/:tokenId", async (req, res) => {
  const tokenId = String(req.params.tokenId).replace(/[^0-9]/g, "");
  const frontendUrl = (process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/$/, "");
  const selfUrl = `${req.protocol}://${req.get("host")}/share/city/${tokenId}`;
  const redirectUrl = `${frontendUrl}/?city=${tokenId}`;

  let cityName = `City #${tokenId}`;
  let desc = "A Twitter-powered city NFT on Mantle Network. Mint yours — your tweets become a living city on-chain!";

  try {
    const data = await getCityData(tokenId);
    const cid = data.city?.ipfsCID;
    let ipfsData = cid ? getCachedMetadata(cid) : null;
    if (!ipfsData && cid) {
      for (const gw of [`https://w3s.link/ipfs/${cid}`, `https://ipfs.io/ipfs/${cid}`]) {
        try {
          const r = await fetch(gw, { signal: AbortSignal.timeout(4000) });
          if (r.ok) { ipfsData = await r.json(); break; }
        } catch {}
      }
    }
    const level = Number(data.city?.level || 1);
    const followers = Number(data.city?.followers || 0);
    const levelName = LEVEL_NAMES[level] || "City";
    const style = ipfsData?.city?.style ? `${ipfsData.city.style} ` : "";
    cityName = ipfsData?.name || cityName;
    desc = `${style}${levelName} on Mantle Network · ${followers.toLocaleString()} population. ${ipfsData?.description || "Your Twitter activity builds a living city NFT on-chain. Mint yours!"}`;
  } catch {}

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${esc(cityName)} — TweetCity</title>
  <meta name="description" content="${esc(desc)}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="TweetCity on Mantle">
  <meta property="og:url" content="${esc(selfUrl)}">
  <meta property="og:title" content="${esc(cityName)} — TweetCity">
  <meta property="og:description" content="${esc(desc)}">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${esc(cityName)} — TweetCity">
  <meta name="twitter:description" content="${esc(desc)}">
  <meta http-equiv="refresh" content="0;url=${esc(redirectUrl)}">
</head>
<body>Redirecting to <a href="${esc(redirectUrl)}">${esc(cityName)} on TweetCity</a>...</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});

app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:3000" }));
app.use(express.json());

app.use("/api", cityRoutes);

app.get("/health", (_, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`TweetCity backend running on port ${PORT}`);
});
