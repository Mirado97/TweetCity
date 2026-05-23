require("dotenv").config();
const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying with:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "MNT");

  // Oracle wallet = same as deployer for now; replace with a dedicated key in prod
  const oracleAddress = process.env.ORACLE_ADDRESS || deployer.address;

  const TweetCity = await ethers.getContractFactory("TweetCity");
  const contract = await TweetCity.deploy(oracleAddress);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("TweetCity deployed to:", address);
  console.log("Oracle set to:", oracleAddress);
  console.log("\nAdd to .env:");
  console.log(`CONTRACT_ADDRESS=${address}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
