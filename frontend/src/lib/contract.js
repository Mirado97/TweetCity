import { ethers } from "ethers";
import TweetCityABI from "./TweetCityABI.json";

export const MANTLE_TESTNET = {
  chainId: "0x138B", // 5003
  chainName: "Mantle Sepolia Testnet",
  rpcUrls: ["https://rpc.sepolia.mantle.xyz"],
  blockExplorerUrls: ["https://explorer.sepolia.mantle.xyz"],
  nativeCurrency: { name: "MNT", symbol: "MNT", decimals: 18 },
};

export const CONTRACT_ADDRESS = "0x1d27d3E227F75Ba64E295205B66B2756A5A6f096";
// TweetCityABI.json is a raw ABI array (from backend/abi/)
export const ABI = Array.isArray(TweetCityABI) ? TweetCityABI : TweetCityABI.abi;

export const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001";

export function getContract(signerOrProvider) {
  return new ethers.Contract(CONTRACT_ADDRESS, ABI, signerOrProvider);
}

export const LEVEL_NAMES = ["", "Village", "Town", "City", "Metropolis", "Megacity"];
