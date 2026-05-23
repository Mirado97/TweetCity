require("dotenv").config();
const { ethers, upgrades } = require("hardhat");

async function main() {
  // Read proxy address from OZ manifest (chainId 5003 = Mantle Sepolia)
  const manifest = require("../.openzeppelin/unknown-5003.json");
  const proxyAddress = manifest.proxies[manifest.proxies.length - 1].address;
  if (!proxyAddress) throw new Error("No proxy address found in .openzeppelin manifest");

  const [deployer] = await ethers.getSigners();
  console.log("Upgrading with:", deployer.address);
  console.log("Proxy address:", proxyAddress);

  const TweetCity = await ethers.getContractFactory("TweetCity");
  const upgraded = await upgrades.upgradeProxy(proxyAddress, TweetCity, { kind: "uups" });
  await upgraded.waitForDeployment();

  const newImpl = await upgrades.erc1967.getImplementationAddress(proxyAddress);
  console.log("\n✅ Upgrade complete!");
  console.log("   Proxy (unchanged):", proxyAddress);
  console.log("   New implementation:", newImpl);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
