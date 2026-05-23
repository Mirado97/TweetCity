const { ethers } = require("ethers");
const TweetCityABI = require("../../abi/TweetCity.json");

const ERC8004_ADDRESS = "0x8004A818BFB912233c491871b3d84c89A494BD9e";
const ERC8004_ABI = [
  "function register(string agentURI) returns (uint256 agentId)",
  "function setAgentURI(uint256 agentId, string newURI)",
  "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)",
];

let _contract = null;
let _erc8004 = null;

function getContract() {
  if (_contract) return _contract;

  const key = process.env.ORACLE_PRIVATE_KEY;
  const rpc = process.env.MANTLE_TESTNET_RPC;
  const addr = process.env.CONTRACT_ADDRESS;

  if (!key || key.includes("your_oracle")) throw new Error("ORACLE_PRIVATE_KEY not set in .env");
  if (!addr || addr.length < 10) throw new Error("CONTRACT_ADDRESS not set in .env");

  const provider = new ethers.JsonRpcProvider(rpc);
  const wallet = new ethers.Wallet(key, provider);
  _contract = new ethers.Contract(addr, TweetCityABI, wallet);
  _erc8004 = new ethers.Contract(ERC8004_ADDRESS, ERC8004_ABI, wallet);
  return _contract;
}

async function registerERC8004Agent(ipfsCID) {
  if (!_erc8004) getContract(); // ensure initialized
  const agentURI = `https://ipfs.io/ipfs/${ipfsCID}`;
  try {
    const tx = await _erc8004.register(agentURI);
    const receipt = await tx.wait();
    const event = receipt.logs
      .map((log) => { try { return _erc8004.interface.parseLog(log); } catch { return null; } })
      .find((e) => e?.name === "Registered");
    return event ? Number(event.args.agentId) : null;
  } catch (err) {
    console.warn("[ERC8004] register failed (non-fatal):", err.message);
    return null;
  }
}

function serializeCity(city) {
  return {
    followers:     Number(city.followers),
    tweetCount:    Number(city.tweetCount),
    following:     Number(city.following),
    engagement:    Number(city.engagement),
    level:         Number(city.level),
    ipfsCID:       city.ipfsCID,
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
  const tx = await contract.updateCity(tokenId, followers, tweetCount, following, engagement, ipfsCID);
  const receipt = await tx.wait();

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
  const provider = contract.runner.provider;
  const latestBlock = await provider.getBlockNumber();
  const deployBlock = Number(process.env.CONTRACT_DEPLOY_BLOCK || Math.max(0, latestBlock - 9000));
  const chunkSize = 9000;
  const filter = contract.filters.CityMinted(BigInt(tokenId));

  for (let from = deployBlock; from <= latestBlock; from += chunkSize) {
    const to = Math.min(from + chunkSize - 1, latestBlock);
    const events = await contract.queryFilter(filter, from, to);
    if (events.length > 0) return events[0].args.twitterHandle;
  }
  return "";
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
  return Number(tokenId); // 0 means not minted
}

async function getLeaderboard(limit = 10) {
  const contract = getContract();
  const total = Number(await contract.totalSupply());
  const cities = [];

  for (let id = 1; id <= total; id++) {
    const city = await contract.cities(id);
    if (city.followers > 0n) {
      cities.push({ tokenId: id, ...serializeCity(city) });
    }
  }

  return cities
    .sort((a, b) => b.followers - a.followers)
    .slice(0, limit);
}

module.exports = { mintCity, updateCity, getCityData, getLeaderboard, getTokenIdByHandle, getHandleByTokenId, registerERC8004Agent };
