/**
 * Upgrades the CityGifts UUPS proxy to a new implementation.
 * Run:
 *   npx hardhat run scripts/upgradeCityGifts.js --network mantleTestnet
 *
 * Reads GIFTS_CONTRACT_ADDRESS from backend/.env (the existing proxy address).
 * Deploys a fresh implementation from current CityGifts.sol and points the proxy at it.
 * Storage is preserved across upgrades.
 */
const hre = require("hardhat");
require("dotenv").config({ path: "./backend/.env" });

async function main() {
  const proxyAddr = process.env.GIFTS_CONTRACT_ADDRESS;
  if (!proxyAddr) throw new Error("GIFTS_CONTRACT_ADDRESS not set in backend/.env");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Upgrading CityGifts at", proxyAddr, "with", deployer.address);

  const CityGifts = await hre.ethers.getContractFactory("CityGifts");
  const upgraded = await hre.upgrades.upgradeProxy(proxyAddr, CityGifts);
  await upgraded.waitForDeployment();

  const implAddr = await hre.upgrades.erc1967.getImplementationAddress(proxyAddr);
  console.log("Upgrade complete.");
  console.log("  proxy         :", proxyAddr);
  console.log("  new impl      :", implAddr);
}

main().catch((e) => { console.error(e); process.exit(1); });
