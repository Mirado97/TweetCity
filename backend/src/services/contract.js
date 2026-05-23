const { ethers } = require("ethers");
const TweetCityABI = require("../../abi/TweetCity.json");

let _contract = null;

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
  return _contract;
}

function serializeCity(city) {
  return {
    twitterHandle: city.twitterHandle,
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

module.exports = { mintCity, updateCity, getCityData, getLeaderboard, getTokenIdByHandle };
