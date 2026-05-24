require("dotenv").config({ path: "./backend/.env" });
const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying ERC-8004 registries with:", deployer.address);

  const IdentityRegistry = await ethers.getContractFactory("IdentityRegistry");
  const identity = await IdentityRegistry.deploy();
  await identity.waitForDeployment();
  const identityAddr = await identity.getAddress();
  console.log("IdentityRegistry:  ", identityAddr);

  const ReputationRegistry = await ethers.getContractFactory("ReputationRegistry");
  const reputation = await ReputationRegistry.deploy(identityAddr);
  await reputation.waitForDeployment();
  const reputationAddr = await reputation.getAddress();
  console.log("ReputationRegistry:", reputationAddr);

  const ValidationRegistry = await ethers.getContractFactory("ValidationRegistry");
  const validation = await ValidationRegistry.deploy(identityAddr);
  await validation.waitForDeployment();
  const validationAddr = await validation.getAddress();
  console.log("ValidationRegistry:", validationAddr);

  console.log("\nAdd to backend/.env:");
  console.log(`ERC8004_IDENTITY_REGISTRY=${identityAddr}`);
  console.log(`ERC8004_REPUTATION_REGISTRY=${reputationAddr}`);
  console.log(`ERC8004_VALIDATION_REGISTRY=${validationAddr}`);
  console.log("\nNext: npx hardhat run scripts/registerOracleAgent.js --network mantleTestnet");
}

main().catch((err) => { console.error(err); process.exit(1); });
