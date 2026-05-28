/**
 * Deploys CityGifts as a UUPS proxy.
 * Run:
 *   npx hardhat run scripts/deployCityGiftsProxy.js --network mantleTestnet
 *
 * Reads CONTRACT_ADDRESS (TweetCity) and ORACLE_ADDRESS from backend/.env.
 * Logs the proxy address — copy it into GIFTS_CONTRACT_ADDRESS.
 */
const hre = require("hardhat");
require("dotenv").config({ path: "./backend/.env" });

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying CityGifts (UUPS proxy) with:", deployer.address);

  const CITY_NFT = process.env.CONTRACT_ADDRESS;
  const ORACLE   = process.env.ORACLE_ADDRESS || deployer.address;

  if (!CITY_NFT) throw new Error("CONTRACT_ADDRESS not set in backend/.env");

  const CityGifts = await hre.ethers.getContractFactory("CityGifts");
  const proxy = await hre.upgrades.deployProxy(
    CityGifts,
    [CITY_NFT, ORACLE],
    { kind: "uups", initializer: "initialize" }
  );
  await proxy.waitForDeployment();

  const addr     = await proxy.getAddress();
  const implAddr = await hre.upgrades.erc1967.getImplementationAddress(addr);

  console.log("");
  console.log("CityGifts proxy:           ", addr);
  console.log("CityGifts implementation:  ", implAddr);
  console.log("  cityNFT:                 ", CITY_NFT);
  console.log("  oracle:                  ", ORACLE);
  console.log("  acceptWindow:            ", (await proxy.acceptWindow()).toString(), "seconds");
  console.log("  engageWindows[0..5]:     ",
    await Promise.all([0,1,2,3,4,5].map(async i => (await proxy.engageWindows(i)).toString())));
  console.log("");
  console.log("→ Update backend/.env:");
  console.log(`GIFTS_CONTRACT_ADDRESS=${addr}`);
  console.log("");
  console.log("→ Update Railway env var GIFTS_CONTRACT_ADDRESS too.");
  console.log("→ Then run:  npx hardhat run scripts/reregisterManagers.js --network mantleTestnet");
}

main().catch((e) => { console.error(e); process.exit(1); });
