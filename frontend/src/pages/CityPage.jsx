import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { API_BASE, LEVEL_NAMES, getContract } from "../lib/contract";
import CityRenderer from "../components/CityRenderer";

export default function CityPage({ tokenId, signer, address }) {
  const [city, setCity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [liking, setLiking] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [error, setError] = useState("");
  const [likeCount, setLikeCount] = useState(0);

  useEffect(() => {
    loadCity();
  }, [tokenId]);

  async function loadCity() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/city/${tokenId}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setCity(data);

      // Fetch like count from contract
      if (signer || window.ethereum) {
        try {
          const p = signer?.provider || new ethers.BrowserProvider(window.ethereum);
          const contract = getContract(p);
          const likes = await contract.cityLikes(tokenId);
          setLikeCount(Number(likes));
        } catch {}
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function sync() {
    setSyncing(true);
    setError("");
    setSyncResult(null);
    try {
      const twitterHandle = city?.city?.twitterHandle;
      if (!twitterHandle) throw new Error("No Twitter handle on this city");
      const res = await fetch(`${API_BASE}/api/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokenId, twitterHandle }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSyncResult(data);
      await loadCity();
    } catch (e) {
      setError(e.message);
    } finally {
      setSyncing(false);
    }
  }

  async function likeCity() {
    if (!signer) { setError("Connect wallet to like"); return; }
    setLiking(true);
    setError("");
    try {
      const contract = getContract(signer);
      const tx = await contract.likeCity(tokenId);
      await tx.wait();
      setLikeCount((c) => c + 1);
    } catch (e) {
      setError(e.reason || e.message);
    } finally {
      setLiking(false);
    }
  }

  if (loading) return <div className="page-loading">Loading city...</div>;
  if (error && !city) return <div className="page-error">{error}</div>;
  if (!city) return <div className="page-error">City not found</div>;

  const cityMeta = city.city;
  const level = Number(cityMeta?.level || 1);
  const twitterHandle = cityMeta?.twitterHandle;

  // Build city config for renderer from on-chain + IPFS data
  const rendererCity = {
    level,
    style: city.ipfsData?.city?.style || "Cyberpunk",
    colorPalette: city.ipfsData?.city?.colorPalette || { primary: "#334", secondary: "#556", accent: "#f0f" },
    followers: Number(cityMeta?.followers || 0),
    cityName: city.ipfsData?.name || `City #${tokenId}`,
  };

  return (
    <div className="city-page">
      <div className="city-header">
        <h1>{rendererCity.cityName}</h1>
        <div className="city-level-badge">{LEVEL_NAMES[level]}</div>
        {twitterHandle && (
          <a href={`https://twitter.com/${twitterHandle}`} target="_blank" rel="noreferrer" className="handle-link">
            @{twitterHandle}
          </a>
        )}
      </div>

      <CityRenderer city={rendererCity} width={600} height={320} />

      {city.ipfsData?.city?.motto && (
        <p className="city-motto">"{city.ipfsData.city.motto}"</p>
      )}
      {city.ipfsData?.description && (
        <p className="city-lore">{city.ipfsData.description}</p>
      )}

      <div className="city-stats">
        <div className="stat"><span>Population</span>{Number(cityMeta?.followers || 0).toLocaleString()}</div>
        <div className="stat"><span>Tweets</span>{Number(cityMeta?.tweetCount || 0).toLocaleString()}</div>
        <div className="stat"><span>Trade Routes</span>{Number(cityMeta?.following || 0).toLocaleString()}</div>
        <div className="stat"><span>Engagement</span>{Number(cityMeta?.engagement || 0).toLocaleString()}</div>
        <div className="stat"><span>Likes</span>{likeCount.toLocaleString()}</div>
      </div>

      {syncResult && syncResult.levelUp && (
        <div className="level-up-banner">
          Level Up! {LEVEL_NAMES[syncResult.oldLevel]} → {LEVEL_NAMES[syncResult.newLevel]}
          {syncResult.narrative && <p>{syncResult.narrative}</p>}
        </div>
      )}

      {error && <div className="error">{error}</div>}

      <div className="city-actions">
        <button className="btn-primary" onClick={sync} disabled={syncing}>
          {syncing ? "Syncing..." : "Sync City"}
        </button>
        <button className="btn-secondary" onClick={likeCity} disabled={liking || !signer}>
          {liking ? "..." : `Like (${likeCount})`}
        </button>
        <a className="btn-secondary" target="_blank" rel="noreferrer"
          href={(() => {
            const name = rendererCity.cityName;
            const lvl = LEVEL_NAMES[level];
            const style = city.ipfsData?.city?.style || "";
            const handle = twitterHandle ? `@${twitterHandle}` : "";
            const variants = [
              `My Twitter became a ${style} ${lvl} called ${name} on Mantle! ${handle} Every tweet builds the city 🏙 Join TweetCity!`,
              `${name} is live on Mantle! A ${style} ${lvl} NFT shaped by my Twitter activity 🌆 Followers = Population. Mint yours!`,
              `I turned my tweets into a ${lvl} city on-chain 🏗 ${name} (${style}) on Mantle. What would YOUR city look like? Join TweetCity!`,
              `${name} rises from the blockchain! 🌃 My ${style} city on @MantleNetwork. The more I tweet, the bigger it gets!`,
              `Just synced my TweetCity — ${name} is a ${style} ${lvl} on Mantle 🔥 Real Twitter metrics, real NFT. Come mint yours!`,
            ];
            const text = variants[tokenId % variants.length];
            return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&hashtags=TweetCity,Mantle,NFT`;
          })()}>
          Share on Twitter
        </a>
      </div>
    </div>
  );
}
