const { ethers } = require("ethers");
const TweetCityABI = require("../../abi/TweetCity.json");

const provider = new ethers.JsonRpcProvider(process.env.MANTLE_TESTNET_RPC);
const oracleWallet = new ethers.Wallet(process.env.ORACLE_PRIVATE_KEY, provider);

function getContract() {
  return new ethers.Contract(process.env.CONTRACT_ADDRESS, TweetCityABI, oracleWallet);
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
    oldLevel: levelUpEvent?.args?.oldLevel,
    newLevel: levelUpEvent?.args?.newLevel,
  };
}

async function getCityData(tokenId) {
  const contract = getContract();
  const [city, history, likes] = await Promise.all([
    contract.cities(tokenId),
    contract.getHistory(tokenId),
    contract.cityLikes(tokenId),
  ]);
  return { city, history, likes: likes.toString() };
}

async function getLeaderboard(limit = 10) {
  const contract = getContract();
  const total = Number(await contract.totalSupply());
  const cities = [];

  for (let id = 1; id <= total; id++) {
    const city = await contract.cities(id);
    if (city.followers > 0) {
      cities.push({ tokenId: id, ...city });
    }
  }

  return cities
    .sort((a, b) => Number(b.followers) - Number(a.followers))
    .slice(0, limit);
}

module.exports = { mintCity, updateCity, getCityData, getLeaderboard };
