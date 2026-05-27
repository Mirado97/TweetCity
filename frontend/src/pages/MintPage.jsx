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

const STEPS = {
  wallet: { num: "1 / 3", title: "Connect Wallet" },
  handle: { num: "2 / 3", title: "Enter Twitter Handle" },
  tweet: { num: "3 / 3", title: "Verify Ownership" },
  minting: { num: "—", title: "Building Your City" },
  done: { num: "✓", title: "City Minted!" },
};

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

  const currentStep = STEPS[step];

  return (
    <div className="mint-page fade-in">
      <div className="mint-header">
        <h1>Mint Your City</h1>
        <p>Transform your Twitter presence into a living city NFT on Mantle</p>
      </div>

      <div className="mint-step">
        <div className="step-badge">{currentStep.num}</div>
        <h2>{currentStep.title}</h2>

        {/* Step 1: Wallet */}
        {step === "wallet" && (
          <>
            <p>Connect MetaMask to get started. We'll switch you to Mantle Testnet automatically.</p>
            <button 
              className="btn btn-primary" 
              style={{ marginTop: 'var(--space-6)' }}
              onClick={async () => { await onConnect(); setStep("handle"); }}
            >
              Connect MetaMask
            </button>
          </>
        )}

        {/* Step 2: Handle */}
        {step === "handle" && (
          <>
            <p>Connected: <span className="addr">{address?.slice(0, 6)}...{address?.slice(-4)}</span></p>
            <div className="input-group" style={{ marginTop: 'var(--space-6)' }}>
              <span className="input-prefix">@</span>
              <input
                value={handle}
                onChange={(e) => setHandle(e.target.value.replace("@", ""))}
                placeholder="your_handle"
                onKeyDown={(e) => e.key === "Enter" && handle && getVerifyText()}
              />
            </div>
            {error && <div className="error">{error}</div>}
            <button 
              className="btn btn-primary" 
              style={{ marginTop: 'var(--space-6)' }}
              onClick={getVerifyText} 
              disabled={!handle || loading}
            >
              {loading ? "Loading..." : "Continue"}
            </button>
          </>
        )}

        {/* Step 3: Verify */}
        {step === "tweet" && (
          <>
            <div className="verify-list">
              <div className="verify-item">
                <span className="verify-num">1</span>
                <span>Log in to Twitter as <strong>@{handle}</strong> — <a href="https://twitter.com/login" target="_blank" rel="noreferrer" className="handle-link">open Twitter →</a></span>
              </div>
              <div className="verify-item">
                <span className="verify-num">2</span>
                <span>Post this exact text from that account:</span>
              </div>
            </div>
            
            <div className="verify-text">{verifyText}</div>
            
            <div className="verify-list" style={{ marginTop: 'var(--space-4)' }}>
              <div className="verify-item">
                <span className="verify-num">3</span>
                <span>Come back here and click "I've Posted — Mint Now"</span>
              </div>
            </div>
            
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 'var(--space-4)' }}>
              Your wallet address is not exposed — just a unique code linking your Twitter to this mint.
            </p>
            
            {error && <div className="error">{error}</div>}
            
            <div className="btn-row" style={{ justifyContent: 'center' }}>
              <a 
                className="btn btn-primary"
                href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(verifyText)}`}
                target="_blank" 
                rel="noreferrer"
              >
                📝 Open Compose
              </a>
              <button 
                className="btn btn-secondary" 
                onClick={mint} 
                disabled={loading}
              >
                {loading ? "Verifying..." : "I've Posted — Mint Now"}
              </button>
            </div>
          </>
        )}

        {/* Minting */}
        {step === "minting" && (
          <div style={{ textAlign: 'center' }}>
            <div className="spinner" />
            <h2 style={{ marginBottom: 'var(--space-4)' }}>Building Your City...</h2>
            <ul className="mint-progress">
              <li>Analyzing your tweets</li>
              <li>Generating city with AI</li>
              <li>Uploading to IPFS</li>
              <li>Minting on Mantle</li>
            </ul>
          </div>
        )}

        {/* Done */}
        {step === "done" && city && cityConfig && (
          <div className="done-card">
            <div className="done-emoji">🎉</div>
            <h2 className="done-title">{city.name} Minted!</h2>
            
            <div style={{ margin: 'var(--space-8) 0', borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
              <CityRenderer city={cityConfig} width={520} height={280} />
            </div>
            
            <div className="result-grid">
              <div className="result-item">
                <span>Level</span>
                <strong>{LEVEL_NAMES[city.city?.level]}</strong>
              </div>
              <div className="result-item">
                <span>Token ID</span>
                <strong>#{result.tokenId}</strong>
              </div>
              <div className="result-item">
                <span>Style</span>
                <strong>{city.city?.style}</strong>
              </div>
              <div className="result-item">
                <span>Motto</span>
                <strong>{city.city?.motto}</strong>
              </div>
            </div>
            
            <p className="lore-text">{city.description}</p>
            
            <div className="btn-row" style={{ justifyContent: 'center' }}>
              <a 
                className="btn btn-primary"
                href={`https://explorer.sepolia.mantle.xyz/tx/${result.txHash}`}
                target="_blank" 
                rel="noreferrer"
              >
                View Transaction
              </a>
              <a 
                className="btn btn-secondary"
                href={getShareUrl(city.name, city.city?.level, city.city?.style, result.tokenId)}
                target="_blank" 
                rel="noreferrer"
              >
                Share on Twitter
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}