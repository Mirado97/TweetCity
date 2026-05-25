import { ethers } from "ethers";
import TweetCityABI from "./TweetCityABI.json";
import CityGiftsABI from "./CityGiftsABI.json";

export const MANTLE_TESTNET = {
  chainId: "0x138B", // 5003
  chainName: "Mantle Sepolia Testnet",
  rpcUrls: ["https://rpc.sepolia.mantle.xyz"],
  blockExplorerUrls: ["https://explorer.sepolia.mantle.xyz"],
  nativeCurrency: { name: "MNT", symbol: "MNT", decimals: 18 },
};

export const CONTRACT_ADDRESS = "0x1d27d3E227F75Ba64E295205B66B2756A5A6f096";
export const GIFTS_CONTRACT_ADDRESS = import.meta.env.VITE_GIFTS_CONTRACT || "";

export const ABI = Array.isArray(TweetCityABI) ? TweetCityABI : TweetCityABI.abi;

export const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001";

export function getContract(signerOrProvider) {
  return new ethers.Contract(CONTRACT_ADDRESS, ABI, signerOrProvider);
}

export function getGiftsContract(signerOrProvider) {
  if (!GIFTS_CONTRACT_ADDRESS) return null;
  return new ethers.Contract(GIFTS_CONTRACT_ADDRESS, CityGiftsABI, signerOrProvider);
}

export const LEVEL_NAMES = ["", "Village", "Town", "City", "Metropolis", "Megacity"];

export const GIFT_TYPES = [
  { name: "Graffiti",   icon: "🎨", obligation: "Like the tweet",          days: 3  },
  { name: "Street Art", icon: "🖼",  obligation: "Like + Retweet",          days: 7  },
  { name: "Flag",       icon: "🚩", obligation: "Comment on tweet",        days: 7  },
  { name: "Billboard",  icon: "📺", obligation: "Quote tweet with mention", days: 14 },
  { name: "Monument",   icon: "🏛",  obligation: "Dedicated mention post",  days: 21 },
  { name: "District",   icon: "🏘",  obligation: "Pinned tweet for 7 days", days: 30 },
];
