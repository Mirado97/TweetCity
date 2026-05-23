import { useState } from "react";
import { API_BASE, LEVEL_NAMES } from "../lib/contract";
import CityRenderer from "../components/CityRenderer";

const VIRAL_TEXTS = [
  (name, level, style) => `Just minted ${name} — a ${LEVEL_NAMES[level]} ${style} city on Mantle! My Twitter is now an NFT 🏙 Join TweetCity and mint yours!`,
  (name, level, style) => `My Twitter presence is now a ${LEVEL_NAMES[level]} ${style} city called ${name} 🌆 Built on Mantle blockchain. What would YOUR city look like?`,
  (name, level, style) => `${name} rises from the blockchain! 🏗 A ${style} ${LEVEL_NAMES[level]} born from my tweets on @MantleNetwork. Claim your city on TweetCity!`,
  (name, level, style) => `Every tweet I've posted built this city ↓ ${name}, a ${style} ${LEVEL_NAMES[level]} on Mantle 🌃 Mint your own at TweetCity!`,
  (name, level, style) => `I turned my Twitter into a living city NFT 🗺 ${name} (${style} ${LEVEL_NAMES[level]}) is now on-chain on Mantle. Who else is minting?`,
  (name, level, style) => `${name} is now on the Mantle blockchain 🔥 A ${style} city shaped by my Twitter activity. Followers = Population. Grow your city on TweetCity!`,
  (name, level, style) => `Your Twitter = Your city. Mine is ${name}, a ${style} ${LEVEL_NAMES[level]} on Mantle ⚡ The more you tweet, the bigger it gets. Mint yours!`,
  (name, level, style) => `Minted my generative city NFT on Mantle! 🏙 ${name} — ${style} style, ${LEVEL_NAMES[level]} tier. AI generated from my real tweet history!`,
  (name, level, style) => `${name} is live on Mantle 🌆 My ${style} city NFT grows as my Twitter grows — ${LEVEL_NAMES[level]} and rising. Check out TweetCity!`,
  (name, level, style) => `Just joined TweetCity — my tweets literally built ${name}, a ${style} ${LEVEL_NAMES[level]} on @MantleNetwork 🏛 Your city is waiting to be minted!`,
];

function getShareUrl(name, level, style, tokenId) {
  const template = VIRAL_TEXTS[Math.floor(Math.random() * VIRAL_TEXTS.length)];
  const text = template(name, level, style);
  const hashtags = "TweetCity,Mantle,NFT,Web3";
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&hashtags=${hashtags}`;
}

export default function MintPage({ address, onConnect, onMinted }) {
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
      if (data.alreadyMinted) {
        onMinted?.(data.tokenId);
        return;
      }
      setResult(data);
      setStep("done");
      onMinted?.(data.tokenId);
    } catch (e) {
      setError(e.message);
      setStep("tweet");
    } finally {
      setLoading(false);
    }
  }

  const city = result?.cityData;
  const cityConfig = city ? {
    level: city.city?.level,
    style: city.city?.style,
    colorPalette: city.city?.colorPalette,
    followers: city.metrics?.followers,
    cityName: city.name,
  } : null;

  return (
    <div className="mint-page">
      <h1>Mint Your City</h1>
      <p className="subtitle">Transform your Twitter presence into a living city on Mantle</p>

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

      {step === "tweet" && (
        <div className="step-card">
          <div className="step-num">3 / 3</div>
          <h2>Verify Ownership</h2>
          <div className="verify-steps">
            <div className="vstep"><span className="vnum">1</span> Log in to Twitter as <strong>@{handle}</strong> — <a href="https://twitter.com/login" target="_blank" rel="noreferrer" className="handle-link">open Twitter →</a></div>
            <div className="vstep"><span className="vnum">2</span> Post this exact text from that account:</div>
          </div>
          <div className="verify-text">{verifyText}</div>
          <div className="verify-steps">
            <div className="vstep"><span className="vnum">3</span> Come back here and click "I've Posted — Mint Now"</div>
          </div>
          <p className="verify-hint">Your wallet address is not exposed — just a unique code linking your Twitter to this mint.</p>
          <div className="btn-row">
            <a className="btn-primary"
              href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(verifyText)}`}
              target="_blank" rel="noreferrer">
              Open Compose (as @{handle})
            </a>
            <button className="btn-secondary" onClick={mint} disabled={loading}>
              {loading ? "Verifying..." : "I've Posted — Mint Now"}
            </button>
          </div>
          {error && <div className="error">{error}</div>}
        </div>
      )}

      {step === "minting" && (
        <div className="step-card minting-card">
          <div className="spinner" />
          <h2>Building Your City...</h2>
          <p>Analyzing tweets · Generating city AI · Uploading to IPFS · Minting on Mantle...</p>
        </div>
      )}

      {step === "done" && city && cityConfig && (
        <div className="step-card done-card">
          <h2>{city.name} Minted!</h2>
          <CityRenderer city={cityConfig} width={500} height={260} />
          <div className="result-meta">
            <div><span>Level</span>{LEVEL_NAMES[city.city?.level]}</div>
            <div><span>Token ID</span>#{result.tokenId}</div>
            <div><span>Style</span>{city.city?.style}</div>
            <div><span>Motto</span>{city.city?.motto}</div>
          </div>
          <p className="lore">{city.description}</p>
          <div className="btn-row">
            <a className="btn-primary"
              href={`https://explorer.sepolia.mantle.xyz/tx/${result.txHash}`}
              target="_blank" rel="noreferrer">
              View Transaction
            </a>
            <a className="btn-secondary"
              href={getShareUrl(city.name, city.city?.level, city.city?.style, result.tokenId)}
              target="_blank" rel="noreferrer">
              Share on Twitter
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
