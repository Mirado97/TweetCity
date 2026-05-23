import { useState } from "react";
import { API_BASE, LEVEL_NAMES } from "../lib/contract";
import CityRenderer from "../components/CityRenderer";

const STEPS = ["wallet", "handle", "tweet", "minting", "done"];

export default function MintPage({ address, onConnect }) {
  const [step, setStep] = useState(address ? "handle" : "wallet");
  const [handle, setHandle] = useState("");
  const [verifyText, setVerifyText] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  async function getVerifyText() {
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/verify-tweet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: address, twitterHandle: handle }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setVerifyText(data.verifyText);
      setStep("tweet");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function mint() {
    setError("");
    setLoading(true);
    setStep("minting");
    try {
      const res = await fetch(`${API_BASE}/api/mint`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: address, twitterHandle: handle }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResult(data);
      setStep("done");
    } catch (e) {
      setError(e.message);
      setStep("tweet");
    } finally {
      setLoading(false);
    }
  }

  function tweetUrl() {
    return `https://twitter.com/intent/tweet?text=${encodeURIComponent(verifyText)}`;
  }

  return (
    <div className="mint-page">
      <h1>Mint Your City</h1>
      <p className="subtitle">Transform your Twitter presence into a living city on Mantle</p>

      {/* Step: Connect Wallet */}
      {step === "wallet" && (
        <div className="step-card">
          <div className="step-num">1 / 3</div>
          <h2>Connect Wallet</h2>
          <p>Connect MetaMask to get started. We'll switch you to Mantle Testnet automatically.</p>
          <button className="btn-primary" onClick={async () => { await onConnect(); setStep("handle"); }}>
            Connect MetaMask
          </button>
        </div>
      )}

      {/* Step: Enter Handle */}
      {step === "handle" && (
        <div className="step-card">
          <div className="step-num">2 / 3</div>
          <h2>Enter Twitter Handle</h2>
          <p>Connected: <span className="addr">{address?.slice(0, 6)}...{address?.slice(-4)}</span></p>
          <div className="input-row">
            <span className="at">@</span>
            <input
              value={handle}
              onChange={(e) => setHandle(e.target.value.replace("@", ""))}
              placeholder="your_handle"
              onKeyDown={(e) => e.key === "Enter" && handle && getVerifyText()}
            />
          </div>
          {error && <div className="error">{error}</div>}
          <button className="btn-primary" onClick={getVerifyText} disabled={!handle || loading}>
            {loading ? "Loading..." : "Continue"}
          </button>
        </div>
      )}

      {/* Step: Tweet Proof */}
      {step === "tweet" && (
        <div className="step-card">
          <div className="step-num">3 / 3</div>
          <h2>Share & Verify</h2>
          <p>Post this tweet from <strong>@{handle}</strong> to verify your account:</p>
          <div className="verify-text">{verifyText}</div>
          <p className="verify-hint">Your wallet address is not included — just a unique code that links your Twitter to this mint.</p>
          <div className="btn-row">
            <a className="btn-primary" href={tweetUrl()} target="_blank" rel="noreferrer">
              Post Tweet
            </a>
            <button className="btn-secondary" onClick={mint} disabled={loading}>
              {loading ? "Verifying..." : "I've Posted — Mint Now"}
            </button>
          </div>
          {error && <div className="error">{error}</div>}
        </div>
      )}

      {/* Minting */}
      {step === "minting" && (
        <div className="step-card minting-card">
          <div className="spinner" />
          <h2>Building Your City...</h2>
          <p>Analyzing tweets, generating city AI, uploading to IPFS, minting NFT on Mantle...</p>
        </div>
      )}

      {/* Done */}
      {step === "done" && result && (
        <div className="step-card done-card">
          <h2>🏙 {result.cityData?.name} Minted!</h2>
          <CityRenderer
            city={{
              level: result.cityData?.city?.level,
              style: result.cityData?.city?.style,
              colorPalette: result.cityData?.city?.colorPalette,
              followers: result.cityData?.metrics?.followers,
              cityName: result.cityData?.name,
            }}
            width={500}
            height={260}
          />
          <div className="result-meta">
            <div><span>Level</span> {LEVEL_NAMES[result.cityData?.city?.level]}</div>
            <div><span>Token ID</span> #{result.tokenId}</div>
            <div><span>Style</span> {result.cityData?.city?.style}</div>
            <div><span>Motto</span> {result.cityData?.city?.motto}</div>
          </div>
          <p className="lore">{result.cityData?.description}</p>
          <div className="btn-row">
            <a
              className="btn-primary"
              href={`https://explorer.sepolia.mantle.xyz/tx/${result.txHash}`}
              target="_blank" rel="noreferrer"
            >
              View Transaction
            </a>
            <button className="btn-secondary" onClick={() => {
              const url = `${window.location.origin}/city/${result.tokenId}`;
              navigator.clipboard.writeText(`Check out my TweetCity! ${url} #TweetCity #Mantle`);
              alert("Copied to clipboard!");
            }}>
              Share City
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
