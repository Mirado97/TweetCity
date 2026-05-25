const hre = require("hardhat");
require("dotenv").config({ path: "./backend/.env" });

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying CityGifts with:", deployer.address);

  const CITY_NFT  = process.env.CONTRACT_ADDRESS;
  const ORACLE    = process.env.ORACLE_ADDRESS || deployer.address;

  if (!CITY_NFT) throw new Error("CONTRACT_ADDRESS not set in backend/.env");

  const CityGifts = await hre.ethers.getContractFactory("CityGifts");
  const gifts = await CityGifts.deploy(CITY_NFT, ORACLE);
  await gifts.waitForDeployment();

  const addr = await gifts.getAddress();
  console.log("CityGifts deployed to:", addr);
  console.log("  cityNFT :", CITY_NFT);
  console.log("  oracle  :", ORACLE);
  console.log("\nAdd to backend/.env:");
  console.log(`GIFTS_CONTRACT_ADDRESS=${addr}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
