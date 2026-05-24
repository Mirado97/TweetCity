import { useState, useCallback, useEffect } from "react";
import { ethers } from "ethers";
import { MANTLE_TESTNET } from "../lib/contract";

export function useWallet() {
  const [address, setAddress] = useState(null);
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [error, setError] = useState(null);

  // Auto-reconnect on page load without prompting
  useEffect(() => {
    if (!window.ethereum) return;
    window.ethereum.request({ method: "eth_accounts" }).then(async (accounts) => {
      if (!accounts.length) return;
      try {
        const p = new ethers.BrowserProvider(window.ethereum);
        const s = await p.getSigner();
        const addr = await s.getAddress();
        setProvider(p);
        setSigner(s);
        setAddress(addr);
      } catch {}
    });
  }, []);

  const connect = useCallback(async () => {
    setError(null);
    if (!window.ethereum) {
      setError("MetaMask not installed");
      return;
    }
    try {
      await window.ethereum.request({ method: "eth_requestAccounts" });

      // Switch to Mantle Testnet
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: MANTLE_TESTNET.chainId }],
        });
      } catch (switchErr) {
        if (switchErr.code === 4902) {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [MANTLE_TESTNET],
          });
        } else throw switchErr;
      }

      const p = new ethers.BrowserProvider(window.ethereum);
      const s = await p.getSigner();
      const addr = await s.getAddress();
      setProvider(p);
      setSigner(s);
      setAddress(addr);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    setProvider(null);
    setSigner(null);
  }, []);

  return { address, provider, signer, error, connect, disconnect };
}
