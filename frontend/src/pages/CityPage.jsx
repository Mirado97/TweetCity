import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { API_BASE, LEVEL_NAMES, GIFT_TYPES, getContract, getGiftsContract, fetchConfig } from "../lib/contract";
import CityRenderer from "../components/CityRenderer";

// ─── Gift Components ─────────────────────────────────────────────────────────

function fmt(wei) {
  if (!wei) return "—";
  return parseFloat(ethers.formatEther(wei)).toFixed(4) + " MNT";
}

function timeLeft(deadline) {
  const sec = Number(deadline) - Math.floor(Date.now() / 1000);
  if (sec <= 0) return "expired";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function PriceManager({ tokenId, signer, giftsAddr, currentPrices, onSaved }) {
  const [inputs, setInputs] = useState(
    currentPrices.map(p => p > 0n ? ethers.formatEther(p) : "")
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    setSaving(true);
    setErr("");
    try {
      const gc = getGiftsContract(giftsAddr, signer);
      if (!gc) throw new Error("Gifts contract not deployed yet");
      const prices = inputs.map(v => v ? ethers.parseEther(v) : 0n);
      const tx = await gc.setPrices(tokenId, prices);
      await tx.wait();
      onSaved(prices);
    } catch (e) {
      setErr(e.reason || e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="gift-panel">
      <div className="gift-header">
        <span>💰</span>
        <span>My Price List</span>
      </div>
      <p className="gift-hint">Set 0 or leave empty to disable a gift type.</p>
      <div className="price-list">
        {GIFT_TYPES.map((t, i) => (
          <div key={i} className="price-row">
            <span className="price-icon">{t.icon}</span>
            <span className="price-name">{t.name}</span>
            <input
              type="number"
              min="0"
              step="0.001"
              placeholder="MNT"
              value={inputs[i]}
              onChange={e => setInputs(prev => { const n=[...prev]; n[i]=e.target.value; return n; })}
              className="price-input"
            />
            <span className="price-info">{t.obligation} · {t.days}d</span>
          </div>
        ))}
      </div>
      {err && <div className="error">{err}</div>}
      <button className="btn btn-primary" onClick={save} disabled={saving}>
        {saving ? "Saving..." : "Save Prices"}
      </button>
    </div>
  );
}

function GiftInbox({ tokenId, signer, giftsAddr, pendingGifts, onAction }) {
  const [busy, setBusy] = useState(null);

  async function act(giftId, approve) {
    setBusy(giftId);
    try {
      const gc = getGiftsContract(giftsAddr, signer);
      const tx = approve ? await gc.approveGift(giftId) : await gc.rejectGift(giftId);
      await tx.wait();
      onAction();
    } catch (e) {
      alert(e.reason || e.message);
    } finally {
      setBusy(null);
    }
  }

  if (pendingGifts.length === 0) return null;

  return (
    <div className="gift-panel" style={{ borderColor: 'rgba(251, 191, 36, 0.3)' }}>
      <div className="gift-header">
        <span>📬</span>
        <span>Inbox</span>
        <span className="inbox-badge">{pendingGifts.length}</span>
      </div>
      {pendingGifts.map(g => {
        const t = GIFT_TYPES[Number(g.giftType)];
        return (
          <div key={g.id.toString()} className="inbox-item">
            <div className="inbox-meta">
              <span className="inbox-type">{t?.icon} {t?.name}</span>
              <span className="inbox-price">{fmt(g.ownerAmount)}</span>
              <span className="inbox-timer">⏱ {timeLeft(g.acceptDeadline)}</span>
            </div>
            <a className="inbox-tweet" href={g.tweetUrl} target="_blank" rel="noreferrer">
              View tweet ↗
            </a>
            <p className="inbox-obligation">Obligation: {t?.obligation}</p>
            <div className="inbox-actions">
              <button
                className="btn btn-primary"
                disabled={busy === g.id}
                onClick={() => act(g.id, true)}
              >
                {busy === g.id ? "..." : "Accept"}
              </button>
              <button
                className="btn btn-ghost"
                disabled={busy === g.id}
                onClick={() => act(g.id, false)}
              >
                Reject
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function GiftShop({ tokenId, signer, giftsAddr, prices, ownerHandle, onSent }) {
  const [type, setType] = useState(0);
  const [tweetUrl, setTweetUrl] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");

  const price = prices[type];
  const enabled = price > 0n;

  async function send() {
    if (!signer) { setErr("Connect wallet first"); return; }
    if (!tweetUrl.trim()) { setErr("Paste your tweet URL"); return; }
    setSending(true);
    setErr("");
    try {
      const gc = getGiftsContract(giftsAddr, signer);
      if (!gc) throw new Error("Gifts contract not deployed yet");
      const tx = await gc.sendGift(tokenId, type, tweetUrl.trim(), { value: price });
      await tx.wait();
      setTweetUrl("");
      onSent();
    } catch (e) {
      setErr(e.reason || e.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="gift-panel">
      <div className="gift-header">
        <span>🎁</span>
        <span>Send a Gift to {ownerHandle ? `@${ownerHandle}` : "this city"}</span>
      </div>

      <div className="gift-grid">
        {GIFT_TYPES.map((t, i) => {
          const p = prices[i];
          const on = p > 0n;
          return (
            <button
              key={i}
              className={`gift-type ${type === i ? "selected" : ""} ${!on ? "disabled" : ""}`}
              onClick={() => on && setType(i)}
            >
              <span className="gift-icon">{t.icon}</span>
              <span className="gift-name">{t.name}</span>
              <span className="gift-price">{on ? fmt(p) : "—"}</span>
            </button>
          );
        })}
      </div>

      {enabled ? (
        <>
          <div className="obligation-box">
            Owner must: <b>{GIFT_TYPES[type].obligation}</b> within {GIFT_TYPES[type].days} days
          </div>
          <input
            className="tweet-input"
            placeholder="https://twitter.com/... (your tweet link)"
            value={tweetUrl}
            onChange={e => setTweetUrl(e.target.value)}
          />
          {err && <div className="error">{err}</div>}
          <button className="btn btn-primary" onClick={send} disabled={sending || !signer}>
            {sending ? "Sending..." : `Send for ${fmt(price)}`}
          </button>
          <p className="refund-note">Funds locked until owner engages · refund if they decline or miss deadline</p>
        </>
      ) : (
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 'var(--space-4)' }}>
          Owner hasn't enabled this gift type
        </p>
      )}
    </div>
  );
}

function GiftStats({ stats }) {
  if (!stats || stats.totalGifts === 0n) return null;
  return (
    <div className="gift-stats">
      <span>🎁 {stats.totalGifts.toString()} gifts received</span>
      <span>💰 {fmt(stats.totalEarned)} earned</span>
      {stats.pendingCount > 0n && <span className="pending-tag">⏳ {stats.pendingCount.toString()} pending</span>}
    </div>
  );
}

// ─── City Page ───────────────────────────────────────────────────────────────

export default function CityPage({ tokenId, signer, address }) {
  const [city, setCity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [liking, setLiking] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [error, setError] = useState("");
  const [likeCount, setLikeCount] = useState(0);
  const [isOwner, setIsOwner] = useState(false);

  const [giftsContractAddr, setGiftsContractAddr] = useState("");
  const [prices, setPrices] = useState([0n, 0n, 0n, 0n, 0n, 0n]);
  const [activeGifts, setActiveGifts] = useState([]);
  const [pendingGifts, setPendingGifts] = useState([]);
  const [giftStats, setGiftStats] = useState(null);
  const [showPriceManager, setShowPriceManager] = useState(false);

  useEffect(() => { loadCity(); }, [tokenId]);

  const loadGifts = useCallback(async (provider, addr) => {
    const gc = getGiftsContract(addr, provider);
    if (!gc) return;
    try {
      const [p, active, stats] = await Promise.all([
        gc.getPrices(tokenId),
        gc.getActiveGifts(tokenId),
        gc.getCityStats(tokenId),
      ]);
      setPrices([...p]);
      setActiveGifts(active.map(g => ({
        id: g.id, giftType: g.giftType, tweetUrl: g.tweetUrl,
        buyer: g.buyer, status: g.status,
      })));
      setGiftStats({ totalGifts: stats[0], totalEarned: stats[1], pendingCount: stats[2] });
    } catch {}
  }, [tokenId]);

  const loadPending = useCallback(async (addr) => {
    if (!signer) return;
    const gc = getGiftsContract(addr, signer);
    if (!gc) return;
    try {
      const p = await gc.getPendingGifts(tokenId);
      setPendingGifts([...p]);
    } catch {}
  }, [tokenId, signer]);

  async function loadCity() {
    setLoading(true);
    setError("");
    try {
      const [res, cfg] = await Promise.all([
        fetch(`${API_BASE}/api/city/${tokenId}`),
        fetchConfig().catch(() => ({})),
      ]);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setCity(data);

      const addr = cfg.giftsContract || "";
      setGiftsContractAddr(addr);

      const provider = signer?.provider
        || (window.ethereum ? new ethers.BrowserProvider(window.ethereum) : null);

      const managerWallet = data.managerWallet || null;
      const owned = !!(address && managerWallet && managerWallet.toLowerCase() === address.toLowerCase());
      setIsOwner(owned);

      if (provider) {
        try {
          const contract = getContract(provider);
          const likes = await contract.cityLikes(tokenId);
          setLikeCount(Number(likes));
        } catch {}

        await loadGifts(provider, addr);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (isOwner) loadPending(giftsContractAddr); }, [isOwner, loadPending, giftsContractAddr]);

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
      setLikeCount(c => c + 1);
    } catch (e) {
      setError(e.reason || e.message);
    } finally {
      setLiking(false);
    }
  }

  if (loading) return <div className="loading">Loading city...</div>;
  if (error && !city) return <div className="page-error">{error}</div>;
  if (!city) return <div className="page-error">City not found</div>;

  const cityMeta      = city.city;
  const level         = Number(cityMeta?.level || 1);
  const twitterHandle = cityMeta?.twitterHandle;

  const rendererCity = {
    level,
    style:        city.ipfsData?.city?.style       || "Cyberpunk",
    colorPalette: city.ipfsData?.city?.colorPalette || { primary: "#334", secondary: "#556", accent: "#f0f" },
    followers:    Number(cityMeta?.followers  || 0),
    tweetCount:   Number(cityMeta?.tweetCount || 0),
    following:    Number(cityMeta?.following  || 0),
    engagement:   Number(cityMeta?.engagement || 0),
    cityName:     city.ipfsData?.name || `City #${tokenId}`,
  };

  const shareText = (() => {
    const variants = [
      `My Twitter became a ${rendererCity.style} ${LEVEL_NAMES[level]} called ${rendererCity.cityName} on Mantle! ${twitterHandle ? `@${twitterHandle}` : ""} Every tweet builds the city 🏙`,
      `${rendererCity.cityName} is live on Mantle! A ${rendererCity.style} ${LEVEL_NAMES[level]} NFT shaped by my Twitter activity 🌆`,
      `I turned my tweets into a ${LEVEL_NAMES[level]} city on-chain 🏗 ${rendererCity.cityName} (${rendererCity.style}) on Mantle.`,
    ];
    return variants[tokenId % variants.length];
  })();

  return (
    <div className="city-page fade-in">
      {/* Header */}
      <div className="city-header">
        <h1 className="city-name">{rendererCity.cityName}</h1>
        <div className="city-badge">
          <span>⭐</span>
          <span>{LEVEL_NAMES[level]}</span>
        </div>
        {twitterHandle && (
          <a href={`https://twitter.com/${twitterHandle}`} target="_blank" rel="noreferrer" className="city-handle">
            @{twitterHandle}
          </a>
        )}
      </div>

      {/* City Visual */}
      <div className="city-visual">
        <CityRenderer city={rendererCity} tokenId={tokenId} gifts={activeGifts} />
      </div>

      <GiftStats stats={giftStats} />

      {/* City Info */}
      {(city.ipfsData?.city?.motto || city.ipfsData?.description) && (
        <div className="city-info">
          {city.ipfsData?.city?.motto && <p className="city-motto">"{city.ipfsData.city.motto}"</p>}
          {city.ipfsData?.description && <p className="city-lore">{city.ipfsData.description}</p>}
        </div>
      )}

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{Number(cityMeta?.followers  || 0).toLocaleString()}</div>
          <div className="stat-label">Population</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{Number(cityMeta?.tweetCount || 0).toLocaleString()}</div>
          <div className="stat-label">Tweets</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{Number(cityMeta?.following  || 0).toLocaleString()}</div>
          <div className="stat-label">Trade Routes</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{Number(cityMeta?.engagement || 0).toLocaleString()}</div>
          <div className="stat-label">Engagement</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{likeCount.toLocaleString()}</div>
          <div className="stat-label">Likes</div>
        </div>
      </div>

      {/* Level Up */}
      {syncResult?.levelUp && (
        <div className="level-up">
          <div className="level-up-icon">🚀</div>
          <div className="level-up-content">
            <h4>Level Up! {LEVEL_NAMES[syncResult.oldLevel]} → {LEVEL_NAMES[syncResult.newLevel]}</h4>
            {syncResult.narrative && <p>{syncResult.narrative}</p>}
          </div>
        </div>
      )}

      {/* Error */}
      {error && <div className="error">{error}</div>}

      {/* Actions */}
      <div className="city-actions">
        {isOwner && (
          <button className="btn btn-secondary" onClick={sync} disabled={syncing}>
            {syncing ? "Syncing..." : "🔄 Sync City"}
          </button>
        )}
        <button className="btn btn-secondary" onClick={likeCity} disabled={liking || !signer}>
          {liking ? "..." : `❤️ Like (${likeCount})`}
        </button>
        <a className="btn btn-secondary" target="_blank" rel="noreferrer"
          href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(`${API_BASE}/share/city/${tokenId}`)}&hashtags=TweetCity,Mantle,NFT`}>
          Share on Twitter
        </a>
        {isOwner && (
          <button
            className="btn btn-secondary"
            onClick={() => setShowPriceManager(v => !v)}
          >
            {showPriceManager ? "Hide Price List" : "💰 Set Gift Prices"}
          </button>
        )}
      </div>

      {/* Gift Sections */}
      {isOwner && showPriceManager && (
        <PriceManager
          tokenId={tokenId}
          signer={signer}
          giftsAddr={giftsContractAddr}
          currentPrices={prices}
          onSaved={p => { setPrices(p); setShowPriceManager(false); }}
        />
      )}

      {isOwner && (
        <GiftInbox
          tokenId={tokenId}
          signer={signer}
          giftsAddr={giftsContractAddr}
          pendingGifts={pendingGifts}
          onAction={() => { loadPending(giftsContractAddr); loadGifts(signer?.provider, giftsContractAddr); }}
        />
      )}

      {!isOwner && (
        <GiftShop
          tokenId={tokenId}
          signer={signer}
          giftsAddr={giftsContractAddr}
          prices={prices}
          ownerHandle={twitterHandle}
          onSent={() => loadGifts(signer?.provider, giftsContractAddr)}
        />
      )}
    </div>
  );
}