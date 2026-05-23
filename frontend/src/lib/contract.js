import { ethers } from "ethers";
import TweetCityABI from "./TweetCityABI.json";

export const MANTLE_TESTNET = {
  chainId: "0x138B", // 5003
  chainName: "Mantle Sepolia Testnet",
  rpcUrls: ["https://rpc.sepolia.mantle.xyz"],
  blockExplorerUrls: ["https://explorer.sepolia.mantle.xyz"],
  nativeCurrency: { name: "MNT", symbol: "MNT", decimals: 18 },
};

export const CONTRACT_ADDRESS = "0x440fD25FECB79bD9367C539990Dd96f5da5c59F4";
// TweetCityABI.json is a raw ABI array (from backend/abi/)
export const ABI = Array.isArray(TweetCityABI) ? TweetCityABI : TweetCityABI.abi;

export const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001";

export function getContract(signerOrProvider) {
  return new ethers.Contract(CONTRACT_ADDRESS, ABI, signerOrProvider);
}

export const LEVEL_NAMES = ["", "Village", "Town", "City", "Metropolis", "Megacity"];
