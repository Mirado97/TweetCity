const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
const _abiFile = require("../../abi/TweetCity.json");
const TweetCityABI = Array.isArray(_abiFile) ? _abiFile : _abiFile.abi;

const GIFTS_ABI = [
  "function registerManager(uint256 tokenId, address manager) external",
  "function cityManager(uint256 tokenId) external view returns (address)",
  "function verifyEngagement(uint256 giftId) external",
  "function getAllGifts(uint256 tokenId) external view returns (tuple(uint256 id, address buyer, uint256 cityTokenId, uint8 giftType, string tweetUrl, uint256 amount, uint256 ownerAmount, uint8 status, uint64 createdAt, uint64 acceptDeadline, uint64 engageDeadline)[])",
  "function gifts(uint256 giftId) external view returns (uint256 id, address buyer, uint256 cityTokenId, uint8 giftType, string tweetUrl, uint256 amount, uint256 ownerAmount, uint8 status, uint64 createdAt, uint64 acceptDeadline, uint64 engageDeadline)",
  "function acceptWindow() external view returns (uint64)",
  "function engageWindows(uint256) external view returns (uint64)",
  "function protocolFeeBps() external view returns (uint256)",
  "function nextGiftId() external view returns (uint256)",
  "function oracle() external view returns (address)",
  "function owner() external view returns (address)",
];

// GiftStatus enum mirror (must match CityGifts.sol)
const GIFT_STATUS = { Pending: 0, Accepted: 1, Verified: 2, Rejected: 3, Expired: 4 };
const GIFT_TYPE   = { Graffiti: 0, StreetArt: 1, Flag: 2, Billboard: 3, Monument: 4, District: 5 };

let _giftsContract = null;

const MANAGERS_FILE = path.join(__dirname, "../../data/managers.json");

function loadManagers() {
  try { return JSON.parse(fs.readFileSync(MANAGERS_FILE, "utf8")); } catch { return {}; }
}
function saveManagers(data) {
  fs.mkdirSync(path.dirname(MANAGERS_FILE), { recursive: true });
  fs.writeFileSync(MANAGERS_FILE, JSON.stringify(data, null, 2));
}

function getGiftsContract() {
  if (_giftsContract) return _giftsContract;
  if (!_wallet) getContract();
  const addr = process.env.GIFTS_CONTRACT_ADDRESS;
  if (!addr) return null;
  _giftsContract = new ethers.Contract(addr, GIFTS_ABI, _wallet);
  return _giftsContract;
}

async function registerCityManager(tokenId, walletAddress) {
  const managers = loadManagers();
  managers[String(tokenId)] = walletAddress.toLowerCase();
  saveManagers(managers);

  try {
    const gc = getGiftsContract();
    if (!gc) return;
    const tx = await gc.registerManager(tokenId, walletAddress);
    await waitReceipt(_wallet.provider, tx.hash);
    console.log(`[gifts] manager registered: tokenId=${tokenId} wallet=${walletAddress}`);
  } catch (e) {
    console.warn("[gifts] registerManager failed (non-fatal):", e.message);
  }
}

async function getCityManagerWallet(tokenId) {
  const giftsAddr = process.env.GIFTS_CONTRACT_ADDRESS;
  const rpc = process.env.MANTLE_TESTNET_RPC;
  if (giftsAddr && rpc) {
    try {
      // Direct JSON-RPC call — avoids ethers singleton state issues
      const selector = "0x2e9ea304"; // keccak256("cityManager(uint256)")[:4]
      const padded = BigInt(tokenId).toString(16).padStart(64, "0");
      const resp = await fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method: "eth_call", id: 1,
          params: [{ to: giftsAddr, data: selector + padded }, "latest"] }),
        signal: AbortSignal.timeout(6000),
      });
      const json = await resp.json();
      if (json.result && json.result !== "0x" && json.result.length === 66) {
        const addr = "0x" + json.result.slice(26);
        if (addr !== "0x0000000000000000000000000000000000000000") return addr.toLowerCase();
      }
    } catch {}
  }
  const managers = loadManagers();
  return managers[String(tokenId)] || null;
}

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

// Poll for receipt manually — avoids ECONNRESET from tx.wait() on flaky Mantle RPC
async function waitReceipt(provider, txHash, timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const receipt = await provider.getTransactionReceipt(txHash);
      if (receipt) return receipt;
    } catch {}
    await new Promise((r) => setTimeout(r, 4000));
  }
  throw new Error(`Receipt timeout for ${txHash}`);
}

// При ECONNRESET сбрасываем singleton провайдера и повторяем один раз
async function rpcCall(fn) {
  try {
    return await fn();
  } catch (err) {
    if (String(err.message).includes("ECONNRESET") || err.code === "ECONNRESET") {
      _contract = null; _wallet = null; _identity = null; _reputation = null; _validation = null; _giftsContract = null;
      await new Promise((r) => setTimeout(r, 600));
      return fn();
    }
    throw err;
  }
}

function getContract() {
  if (_contract) return _contract;

  const key = process.env.ORACLE_PRIVATE_KEY;
  const rpc = process.env.MANTLE_TESTNET_RPC;
  const addr = process.env.CONTRACT_ADDRESS;

  if (!key || key.includes("your_oracle")) throw new Error("ORACLE_PRIVATE_KEY not set in .env");
  if (!addr || addr.length < 10) throw new Error("CONTRACT_ADDRESS not set in .env");

  // keepAlive=false — каждый HTTP-запрос открывает новое TCP-соединение,
  // иначе Mantle testnet RPC закрывает idle-соединение и ethers получает ECONNRESET
  const fetchReq = new ethers.FetchRequest(rpc);
  fetchReq.keepAlive = false;
  const provider = new ethers.JsonRpcProvider(fetchReq, undefined, { pollingInterval: 4000 });
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
    const receipt = await waitReceipt(_wallet.provider, tx.hash);
    const event = receipt.logs
      .map((log) => { try { return _identity.interface.parseLog(log); } catch { return null; } })
      .find((e) => e?.name === "AgentRegistered");
    const agentId = event ? Number(event.args.agentId) : null;
    if (!agentId) throw new Error("AgentRegistered event not found");

    console.log(`[ERC8004] City "${agentDomain}" registered as agentId=${agentId}`);

    // Store agentId on-chain in TweetCity
    try {
      const tx2 = await _contract.setTokenAgentId(tokenId, agentId);
      await waitReceipt(_wallet.provider, tx2.hash);
    } catch (e) {
      console.warn("[ERC8004] setTokenAgentId failed:", e.message);
    }

    // ReputationRegistry: oracle accepts feedback relationship with city
    if (_reputation && oracleAgentId) {
      try {
        const tx3 = await _reputation.acceptFeedback(agentId, oracleAgentId);
        await waitReceipt(_wallet.provider, tx3.hash);
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
    await waitReceipt(_wallet.provider, tx1.hash);

    // Score = engagement proxy: capped at 100
    const score = Math.min(100, Math.floor((followers / 1000) * 10) + 50);
    const tx2 = await _validation.validationResponse(dataHash, score);
    await waitReceipt(_wallet.provider, tx2.hash);
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
  const receipt = await waitReceipt(_wallet.provider, tx.hash);

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
  const tx = await contract.updateCity(tokenId, followers, tweetCount, following, engagement, ipfsCID);
  const receipt = await waitReceipt(_wallet.provider, tx.hash);

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
  return rpcCall(async () => {
    const contract = getContract();
    const handle = await contract.tokenToHandle(tokenId);
    return handle || "";
  });
}

async function getCityData(tokenId) {
  return rpcCall(async () => {
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
  });
}

async function getTokenIdByHandle(twitterHandle) {
  return rpcCall(async () => {
    const contract = getContract();
    const tokenId = await contract.handleToTokenId(twitterHandle);
    return Number(tokenId);
  });
}

async function getLeaderboard(limit = 10) {
  return rpcCall(async () => {
    const contract = getContract();
    const total = Number(await contract.totalSupply());
    const cities = [];

    for (let id = 1; id <= total; id++) {
      const [city, handle] = await Promise.all([
        contract.cities(id),
        contract.tokenToHandle(id),
      ]);
      // Show every actually-minted city. `level >= 1` is set on every mint, so this
      // includes new accounts with 0 followers (filtering by followers hid them).
      if (Number(city.level) > 0) {
        cities.push({ tokenId: id, twitterHandle: handle || "", ...serializeCity(city) });
      }
    }

    return cities.sort((a, b) => b.followers - a.followers).slice(0, limit);
  });
}

async function getTokenAgentId(tokenId) {
  return rpcCall(async () => {
    const contract = getContract();
    const aid = await contract.tokenAgentId(tokenId);
    return Number(aid);
  });
}

// ─── CityGifts helpers ───────────────────────────────────────────────────

function normalizeGift(g) {
  return {
    id:              Number(g.id),
    buyer:           g.buyer,
    cityTokenId:     Number(g.cityTokenId),
    giftType:        Number(g.giftType),
    tweetUrl:        g.tweetUrl,
    amount:          g.amount?.toString?.() ?? String(g.amount),
    ownerAmount:     g.ownerAmount?.toString?.() ?? String(g.ownerAmount),
    status:          Number(g.status),
    createdAt:       Number(g.createdAt),
    acceptDeadline:  Number(g.acceptDeadline),
    engageDeadline:  Number(g.engageDeadline),
  };
}

async function getGiftsForCity(tokenId) {
  const gc = getGiftsContract();
  if (!gc) throw new Error("GIFTS_CONTRACT_ADDRESS not set");
  const raw = await gc.getAllGifts(tokenId);
  return raw.map(normalizeGift);
}

async function getGift(giftId) {
  const gc = getGiftsContract();
  if (!gc) throw new Error("GIFTS_CONTRACT_ADDRESS not set");
  const g = await gc.gifts(giftId);
  return normalizeGift({
    id: g[0], buyer: g[1], cityTokenId: g[2], giftType: g[3], tweetUrl: g[4],
    amount: g[5], ownerAmount: g[6], status: g[7], createdAt: g[8],
    acceptDeadline: g[9], engageDeadline: g[10],
  });
}

async function verifyGiftEngagement(giftId) {
  const gc = getGiftsContract();
  if (!gc) throw new Error("GIFTS_CONTRACT_ADDRESS not set");
  const tx = await gc.verifyEngagement(giftId);
  const receipt = await waitReceipt(_wallet.provider, tx.hash);
  return { txHash: receipt.hash };
}

async function getTotalCities() {
  return rpcCall(async () => {
    const contract = getContract();
    return Number(await contract.totalSupply());
  });
}

// ─── Admin helpers ────────────────────────────────────────────────────────

async function getTweetCitySettings() {
  return rpcCall(async () => {
    const c = getContract();
    const [owner, oracle, registry, totalSupply] = await Promise.all([
      c.owner(),
      c.oracle(),
      c.agentIdentityRegistry(),
      c.totalSupply(),
    ]);
    return {
      address:                process.env.CONTRACT_ADDRESS,
      owner,
      oracle,
      agentIdentityRegistry:  registry,
      totalSupply:            Number(totalSupply),
    };
  });
}

async function getGiftsSettings() {
  const gc = getGiftsContract();
  if (!gc) return null;
  const [owner, oracle, feeBps, acceptW, nextId, ew0, ew1, ew2, ew3, ew4, ew5] = await Promise.all([
    gc.owner(),
    gc.oracle(),
    gc.protocolFeeBps(),
    gc.acceptWindow(),
    gc.nextGiftId(),
    gc.engageWindows(0),
    gc.engageWindows(1),
    gc.engageWindows(2),
    gc.engageWindows(3),
    gc.engageWindows(4),
    gc.engageWindows(5),
  ]);
  return {
    address:        process.env.GIFTS_CONTRACT_ADDRESS,
    owner,
    oracle,
    protocolFeeBps: Number(feeBps),
    acceptWindow:   Number(acceptW),
    nextGiftId:     Number(nextId),
    engageWindows:  [ew0, ew1, ew2, ew3, ew4, ew5].map(Number),
  };
}

// Aggregates gift counts and verified volume by scanning all gifts.
// For a hackathon scale (few hundred gifts) this is fine.
async function getGiftsStats() {
  const gc = getGiftsContract();
  if (!gc) return { totalGifts: 0, pending: 0, accepted: 0, verified: 0, rejected: 0, expired: 0, volumeWei: "0" };
  const total = Number(await gc.nextGiftId());
  if (total === 0) return { totalGifts: 0, pending: 0, accepted: 0, verified: 0, rejected: 0, expired: 0, volumeWei: "0" };

  const counts = { pending: 0, accepted: 0, verified: 0, rejected: 0, expired: 0 };
  let volume = 0n;

  // Fetch in parallel batches of 25 to avoid hammering RPC
  const batchSize = 25;
  for (let from = 0; from < total; from += batchSize) {
    const to = Math.min(total, from + batchSize);
    const slice = await Promise.all(
      Array.from({ length: to - from }, (_, i) => gc.gifts(from + i).catch(() => null))
    );
    for (const g of slice) {
      if (!g) continue;
      const status = Number(g[7]);
      const amount = g[5];
      if (status === 0) counts.pending++;
      else if (status === 1) { counts.accepted++; volume += BigInt(amount); }
      else if (status === 2) { counts.verified++; volume += BigInt(amount); }
      else if (status === 3) counts.rejected++;
      else if (status === 4) counts.expired++;
    }
  }

  return { totalGifts: total, ...counts, volumeWei: volume.toString() };
}

// Lightweight list of all cities for the admin moderation tab.
async function listAllCities() {
  return rpcCall(async () => {
    const contract = getContract();
    const total = Number(await contract.totalSupply());
    const out = [];
    const batch = 20;
    for (let from = 1; from <= total; from += batch) {
      const to = Math.min(total, from + batch - 1);
      const ids = Array.from({ length: to - from + 1 }, (_, i) => from + i);
      const pairs = await Promise.all(ids.map(async (id) => {
        const [city, handle] = await Promise.all([
          contract.cities(id),
          contract.tokenToHandle(id),
        ]);
        return { tokenId: id, twitterHandle: handle || "", ...serializeCity(city) };
      }));
      out.push(...pairs);
    }
    return out;
  });
}

module.exports = {
  mintCity, updateCity, getCityData, getLeaderboard,
  getTokenIdByHandle, getHandleByTokenId,
  registerERC8004Agent, recordValidation, getTokenAgentId,
  registerCityManager, getCityManagerWallet,
  // gifts oracle
  getGiftsForCity, getGift, verifyGiftEngagement, getTotalCities,
  // admin
  getTweetCitySettings, getGiftsSettings, getGiftsStats, listAllCities,
  GIFT_STATUS, GIFT_TYPE,
};
