/**
 * After redeploying CityGifts to a new proxy address, this script reregisters
 * the `cityManager` for every existing TweetCity token on the new contract.
 *
 * Run:
 *   npx hardhat run scripts/reregisterManagers.js --network mantleTestnet
 *
 * Env (backend/.env):
 *   CONTRACT_ADDRESS        — TweetCity proxy
 *   GIFTS_CONTRACT_ADDRESS  — NEW CityGifts proxy
 *   ORACLE_PRIVATE_KEY      — oracle (used as deployer here)
 *
 * Source of truth for each city's manager wallet, in order of preference:
 *   1) backend/data/managers.json (written by mintCity in backend)
 *   2) TweetCity.ownerOf(tokenId)   — the NFT current owner
 */
const hre = require("hardhat");
const fs   = require("fs");
const path = require("path");
require("dotenv").config({ path: "./backend/.env" });

async function main() {
  const tweetCityAddr = process.env.CONTRACT_ADDRESS;
  const giftsAddr     = process.env.GIFTS_CONTRACT_ADDRESS;
  if (!tweetCityAddr) throw new Error("CONTRACT_ADDRESS not set");
  if (!giftsAddr)     throw new Error("GIFTS_CONTRACT_ADDRESS not set (expected NEW proxy)");

  const [signer] = await hre.ethers.getSigners();
  console.log("Reregistering managers with:", signer.address);
  console.log("  TweetCity:", tweetCityAddr);
  console.log("  CityGifts:", giftsAddr);

  const tweetCity = await hre.ethers.getContractAt("TweetCity",  tweetCityAddr, signer);
  const gifts     = await hre.ethers.getContractAt("CityGifts", giftsAddr,     signer);

  // Local managers.json (mintCity writes here)
  const managersFile = path.join(__dirname, "..", "backend", "data", "managers.json");
  let local = {};
  try { local = JSON.parse(fs.readFileSync(managersFile, "utf8")); } catch {}

  const total = Number(await tweetCity.totalSupply());
  console.log(`Total minted cities: ${total}\n`);

  let registered = 0;
  let skipped    = 0;
  let failed     = 0;

  for (let id = 1; id <= total; id++) {
    let manager = local[String(id)];
    if (!manager) {
      try { manager = await tweetCity.ownerOf(id); } catch { manager = null; }
    }
    if (!manager) {
      console.log(`#${id} → no manager found, skipping`);
      skipped++;
      continue;
    }

    // Skip if already registered on the new contract
    try {
      const current = await gifts.cityManager(id);
      if (current && current.toLowerCase() === manager.toLowerCase()) {
        console.log(`#${id} → already registered (${manager})`);
        skipped++;
        continue;
      }
    } catch {}

    try {
      const tx = await gifts.registerManager(id, manager);
      await tx.wait();
      console.log(`#${id} → registered ${manager}`);
      registered++;
    } catch (e) {
      console.error(`#${id} → FAILED: ${e.message}`);
      failed++;
    }
  }

  console.log(`\nDone. Registered: ${registered}, Skipped: ${skipped}, Failed: ${failed}.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
