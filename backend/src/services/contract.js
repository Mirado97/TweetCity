const { ethers } = require("ethers");
const _abiFile = require("../../abi/TweetCity.json");
const TweetCityABI = Array.isArray(_abiFile) ? _abiFile : _abiFile.abi;

const IDENTITY_ABI = [
  "function newAgent(string agentDomain, address agentAddress) payable returns (uint256 agentId)",
  "function resolveByAddress(address agentAddress) view returns (tuple(uint256 agentId, string agentDomain, address agentAddress))",
  "function agentExists(uint256 agentId) view returns (bool)",
  "function getAgent(uint256 agentId) view returns (tuple(uint256 agentId, string agentDomain, address agentAddress))",
  "function REGISTRATION_FEE() pure returns (uint256)",
  "event AgentRegistered(uint256 indexed agentId, string agentDomain, address agentAddress)",
];
const REPUTATION_ABI = [
  "function acceptFeedback(uint256 agentClientId, uint256 agentServerId)",
  "function isFeedbackAuthorized(uint256 agentClientId, uint256 agentServerId) view returns (bool authorized, bytes32 feedbackAuthId)",
  "event AuthFeedback(uint256 indexed agentClientId, uint256 indexed agentServerId, bytes32 feedbackAuthId)",
];
const VALIDATION_ABI = [
  "function validationRequest(uint256 agentValidatorId, uint256 agentServerId, bytes32 dataHash)",
  "function validationResponse(bytes32 dataHash, uint8 response)",
  "event ValidationRequestEvent(uint256 indexed agentValidatorId, uint256 indexed agentServerId, bytes32 indexed dataHash)",
  "event ValidationResponseEvent(uint256 indexed agentValidatorId, uint256 indexed agentServerId, bytes32 indexed dataHash, uint8 response)",
];

let _contract = null;
let _identity = null;
let _reputation = null;
let _validation = null;
let _wallet = null;

function getContract() {
  if (_contract) return _contract;

  const key = process.env.ORACLE_PRIVATE_KEY;
  const rpc = process.env.MANTLE_TESTNET_RPC;
  const addr = process.env.CONTRACT_ADDRESS;

  if (!key || key.includes("your_oracle")) throw new Error("ORACLE_PRIVATE_KEY not set in .env");
  if (!addr || addr.length < 10) throw new Error("CONTRACT_ADDRESS not set in .env");

  const provider = new ethers.JsonRpcProvider(rpc);
  _wallet = new ethers.Wallet(key, provider);
  _contract = new ethers.Contract(addr, TweetCityABI, _wallet);

  const idAddr  = process.env.ERC8004_IDENTITY_REGISTRY;
  const repAddr = process.env.ERC8004_REPUTATION_REGISTRY;
  const valAddr = process.env.ERC8004_VALIDATION_REGISTRY;
  if (idAddr)  _identity   = new ethers.Contract(idAddr,  IDENTITY_ABI,   _wallet);
  if (repAddr) _reputation = new ethers.Contract(repAddr, REPUTATION_ABI, _wallet);
  if (valAddr) _validation = new ethers.Contract(valAddr, VALIDATION_ABI, _wallet);

  return _contract;
}

// Register a city as ERC-8004 agent and link agentId on TweetCity contract.
// Called after mintCity. Non-fatal — mint succeeds even if ERC-8004 calls fail.
async function registerERC8004Agent(twitterHandle, walletAddress, tokenId) {
  if (!_identity) getContract();
  const oracleAgentId = Number(process.env.ERC8004_ORACLE_AGENT_ID || 0);

  try {
    const fee = await _identity.REGISTRATION_FEE();
    const agentDomain = `tweetcity-${twitterHandle.toLowerCase()}`;

    const tx = await _identity.newAgent(agentDomain, walletAddress, { value: fee });
    const receipt = await tx.wait();
    const event = receipt.logs
      .map((log) => { try { return _identity.interface.parseLog(log); } catch { return null; } })
      .find((e) => e?.name === "AgentRegistered");
    const agentId = event ? Number(event.args.agentId) : null;
    if (!agentId) throw new Error("AgentRegistered event not found");

    console.log(`[ERC8004] City "${agentDomain}" registered as agentId=${agentId}`);

    // Store agentId on-chain in TweetCity
    try {
      const tx2 = await _contract.setTokenAgentId(tokenId, agentId);
      await tx2.wait();
    } catch (e) {
      console.warn("[ERC8004] setTokenAgentId failed:", e.message);
    }

    // ReputationRegistry: oracle accepts feedback relationship with city
    if (_reputation && oracleAgentId) {
      try {
        const tx3 = await _reputation.acceptFeedback(agentId, oracleAgentId);
        await tx3.wait();
        console.log(`[ERC8004] acceptFeedback recorded: city=${agentId} oracle=${oracleAgentId}`);
      } catch (e) {
        console.warn("[ERC8004] acceptFeedback failed:", e.message);
      }
    }

    return agentId;
  } catch (err) {
    console.warn("[ERC8004] registerERC8004Agent failed (non-fatal):", err.message);
    return null;
  }
}

// Record a sync event in ValidationRegistry: oracle validates city metrics on-chain.
async function recordValidation(tokenId, cityAgentId, followers, tweetCount, following) {
  if (!_validation) getContract();
  const oracleAgentId = Number(process.env.ERC8004_ORACLE_AGENT_ID || 0);
  if (!oracleAgentId || !cityAgentId) return;

  try {
    const dataHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "uint32", "uint32", "uint32", "uint256"],
        [tokenId, followers, tweetCount, following, Math.floor(Date.now() / 1000)]
      )
    );

    const tx1 = await _validation.validationRequest(oracleAgentId, cityAgentId, dataHash);
    await tx1.wait();

    // Score = engagement proxy: capped at 100
    const score = Math.min(100, Math.floor((followers / 1000) * 10) + 50);
    const tx2 = await _validation.validationResponse(dataHash, score);
    await tx2.wait();
    console.log(`[ERC8004] Validation recorded: tokenId=${tokenId} score=${score}`);
  } catch (err) {
    console.warn("[ERC8004] recordValidation failed (non-fatal):", err.message);
  }
}

function serializeCity(city) {
  return {
    followers:  Number(city.followers),
    tweetCount: Number(city.tweetCount),
    following:  Number(city.following),
    engagement: Number(city.engagement),
    level:      Number(city.level),
    ipfsCID:    city.ipfsCID,
  };
}

async function mintCity({ to, twitterHandle, followers, tweetCount, following, engagement, ipfsCID }) {
  const contract = getContract();
  const tx = await contract.mintCity(to, twitterHandle, followers, tweetCount, following, engagement, ipfsCID);
  const receipt = await tx.wait();

  const mintedEvent = receipt.logs
    .map((log) => { try { return contract.interface.parseLog(log); } catch { return null; } })
    .find((e) => e?.name === "CityMinted");

  return {
    tokenId: mintedEvent?.args?.tokenId?.toString(),
    txHash: receipt.hash,
  };
}

async function updateCity({ tokenId, followers, tweetCount, following, engagement, ipfsCID }) {
  const contract = getContract();
  let tx, receipt;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      tx = await contract.updateCity(tokenId, followers, tweetCount, following, engagement, ipfsCID);
      receipt = await tx.wait();
      break;
    } catch (e) {
      if (attempt === 3) throw e;
      console.warn(`[updateCity] attempt ${attempt} failed: ${e.message} — retrying`);
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }

  const levelUpEvent = receipt.logs
    .map((log) => { try { return contract.interface.parseLog(log); } catch { return null; } })
    .find((e) => e?.name === "CityLevelUp");

  return {
    txHash: receipt.hash,
    levelUp: !!levelUpEvent,
    oldLevel: levelUpEvent?.args?.oldLevel ? Number(levelUpEvent.args.oldLevel) : null,
    newLevel: levelUpEvent?.args?.newLevel ? Number(levelUpEvent.args.newLevel) : null,
  };
}

async function getHandleByTokenId(tokenId) {
  const contract = getContract();
  const handle = await contract.tokenToHandle(tokenId);
  return handle || "";
}

async function getCityData(tokenId) {
  const contract = getContract();
  const [city, history, likes] = await Promise.all([
    contract.cities(tokenId),
    contract.getHistory(tokenId),
    contract.cityLikes(tokenId),
  ]);
  return {
    city: serializeCity(city),
    history: history.map((h) => serializeCity(h)),
    likes: likes.toString(),
  };
}

async function getTokenIdByHandle(twitterHandle) {
  const contract = getContract();
  const tokenId = await contract.handleToTokenId(twitterHandle);
  return Number(tokenId);
}

async function getLeaderboard(limit = 10) {
  const contract = getContract();
  const total = Number(await contract.totalSupply());
  const cities = [];

  for (let id = 1; id <= total; id++) {
    const [city, handle] = await Promise.all([
      contract.cities(id),
      contract.tokenToHandle(id),
    ]);
    if (city.followers > 0n) {
      cities.push({ tokenId: id, twitterHandle: handle || "", ...serializeCity(city) });
    }
  }

  return cities.sort((a, b) => b.followers - a.followers).slice(0, limit);
}

async function getTokenAgentId(tokenId) {
  const contract = getContract();
  const aid = await contract.tokenAgentId(tokenId);
  return Number(aid);
}

module.exports = { mintCity, updateCity, getCityData, getLeaderboard, getTokenIdByHandle, getHandleByTokenId, registerERC8004Agent, recordValidation, getTokenAgentId };
