require("dotenv").config({ path: "./backend/.env" });
const { ethers } = require("hardhat");

async function main() {
  const [oracle] = await ethers.getSigners();
  const identityAddr = process.env.ERC8004_IDENTITY_REGISTRY;
  if (!identityAddr) throw new Error("ERC8004_IDENTITY_REGISTRY not set in backend/.env");

  const IdentityRegistry = await ethers.getContractAt("IdentityRegistry", identityAddr);

  // Check if oracle already registered
  try {
    const existing = await IdentityRegistry.resolveByAddress(oracle.address);
    console.log(`Oracle already registered as agentId=${existing.agentId} domain="${existing.agentDomain}"`);
    console.log(`\nSet in backend/.env: ERC8004_ORACLE_AGENT_ID=${existing.agentId}`);
    return;
  } catch {}

  const fee = await IdentityRegistry.REGISTRATION_FEE();
  const tx = await IdentityRegistry.newAgent("tweetcity-oracle", oracle.address, { value: fee });
  const receipt = await tx.wait();

  const event = receipt.logs
    .map((log) => { try { return IdentityRegistry.interface.parseLog(log); } catch { return null; } })
    .find((e) => e?.name === "AgentRegistered");

  const agentId = event?.args?.agentId;
  console.log(`\n✅ Oracle registered as agentId=${agentId}`);
  console.log(`Set in backend/.env: ERC8004_ORACLE_AGENT_ID=${agentId}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
