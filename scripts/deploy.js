require("dotenv").config();
const { ethers, upgrades } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying with:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "MNT");

  const oracleAddress = process.env.ORACLE_ADDRESS || deployer.address;
  console.log("Oracle:", oracleAddress);

  const TweetCity = await ethers.getContractFactory("TweetCity");

  console.log("\nDeploying UUPS proxy...");
  const proxy = await upgrades.deployProxy(TweetCity, [oracleAddress], {
    kind: "uups",
    initializer: "initialize",
  });
  await proxy.waitForDeployment();

  const proxyAddress = await proxy.getAddress();
  const implAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);

  console.log("\n✅ Proxy (permanent address):", proxyAddress);
  console.log("   Implementation:           ", implAddress);
  console.log("\nUpdate backend/.env:");
  console.log(`CONTRACT_ADDRESS=${proxyAddress}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
