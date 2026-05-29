import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ethers } from "ethers";
import {
  Heart, RefreshCw, Share2, ExternalLink,
  Loader2, AlertCircle, TrendingUp, Users, MessageSquare, Activity,
  Gift, Settings, X, Inbox
} from "lucide-react";
import { API_BASE, LEVEL_NAMES, GIFT_TYPES, getContract, getGiftsContract, fetchConfig } from "../lib/contract";
import CityRendererV2 from "../components/CityRendererV2";

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
  const [myGifts, setMyGifts] = useState([]);
  const [claimingId, setClaimingId] = useState(null);
  const [giftStats, setGiftStats] = useState(null);
  const [showGiftPanel, setShowGiftPanel] = useState(false);
  const [showPriceManager, setShowPriceManager] = useState(false);
  const [showInbox, setShowInbox] = useState(false);
  const [giftType, setGiftType] = useState(0);
  const [tweetUrl, setTweetUrl] = useState("");
  const [sending, setSending] = useState(false);

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
      // Only Verified gifts (status === 2) get rendered on the city map.
      // Accepted ones (status === 1) are NOT shown until the oracle confirms.
      console.log("[CityPage] active gifts from contract:", active.map(g => ({ id: Number(g.id), status: Number(g.status), type: Number(g.giftType) })));
      const visible = active
        .filter(g => Number(g.status) === 2)
        .map(g => ({ id: g.id, giftType: g.giftType, tweetUrl: g.tweetUrl, buyer: g.buyer, status: g.status }));
      console.log("[CityPage] visible on map after filter:", visible.length);
      setActiveGifts(visible);
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

  const loadMyGifts = useCallback(async (provider, addr) => {
    if (!address) { setMyGifts([]); return; }
    const gc = getGiftsContract(addr, provider);
    if (!gc) return;
    try {
      const all = await gc.getAllGifts(tokenId);
      const me = address.toLowerCase();
      setMyGifts(all
        .filter(g => g.buyer.toLowerCase() === me)
        .map(g => ({
          id: g.id, giftType: Number(g.giftType), tweetUrl: g.tweetUrl,
          ownerAmount: g.ownerAmount, status: Number(g.status),
          acceptDeadline: Number(g.acceptDeadline), engageDeadline: Number(g.engageDeadline),
        }))
      );
    } catch {}
  }, [tokenId, address]);

  async function claimGift(giftId) {
    if (!signer) { setError("Connect wallet first"); return; }
    setClaimingId(String(giftId));
    setError("");
    try {
      const gc = getGiftsContract(giftsContractAddr, signer);
      if (!gc) throw new Error("Gifts contract not deployed");
      const tx = await gc.claimExpired(giftId);
      await tx.wait();
      await loadMyGifts(signer.provider, giftsContractAddr);
      await loadGifts(signer.provider, giftsContractAddr);
    } catch (e) {
      setError(e.reason || e.message);
    } finally {
      setClaimingId(null);
    }
  }

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

      const provider = signer?.provider || (window.ethereum ? new ethers.BrowserProvider(window.ethereum) : null);
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
        await loadMyGifts(provider, addr);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadCity(); }, [tokenId]);

  // Recompute ownership whenever the wallet address changes (e.g. user connects MetaMask
  // after page load) or after the city's managerWallet is loaded.
  useEffect(() => {
    const mgr = city?.managerWallet;
    setIsOwner(!!(address && mgr && mgr.toLowerCase() === address.toLowerCase()));
  }, [address, city]);

  useEffect(() => { if (isOwner) loadPending(giftsContractAddr); }, [isOwner, loadPending, giftsContractAddr]);
  useEffect(() => {
    if (!giftsContractAddr || !address) return;
    const provider = signer?.provider || (window.ethereum ? new ethers.BrowserProvider(window.ethereum) : null);
    if (provider) loadMyGifts(provider, giftsContractAddr);
  }, [address, giftsContractAddr, loadMyGifts, signer]);

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

  async function sendGift() {
    if (!signer) { setError("Connect wallet first"); return; }
    if (!tweetUrl.trim()) { setError("Paste your tweet URL"); return; }
    setSending(true);
    setError("");
    try {
      const gc = getGiftsContract(giftsContractAddr, signer);
      if (!gc) throw new Error("Gifts contract not deployed yet");
      const tx = await gc.sendGift(tokenId, giftType, tweetUrl.trim(), { value: prices[giftType] });
      await tx.wait();
      setTweetUrl("");
      setShowGiftPanel(false);
      await loadGifts(signer?.provider, giftsContractAddr);
    } catch (e) {
      setError(e.reason || e.message);
    } finally {
      setSending(false);
    }
  }

  async function actOnGift(giftId, approve) {
    try {
      const gc = getGiftsContract(giftsContractAddr, signer);
      const tx = approve ? await gc.approveGift(giftId) : await gc.rejectGift(giftId);
      await tx.wait();
      loadPending(giftsContractAddr);
      loadGifts(signer?.provider, giftsContractAddr);
    } catch (e) { alert(e.reason || e.message); }
  }

  if (loading) return (
    <div className="pt-32 flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="w-8 h-8 text-[#00d4ff] animate-spin" />
        <p className="text-[#94a3b8]">Loading city...</p>
      </div>
    </div>
  );

  if (error && !city) return (
    <div className="pt-32 flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-4 text-center px-4">
        <AlertCircle className="w-12 h-12 text-red-400" />
        <p className="text-[#94a3b8]">{error || 'City not found'}</p>
      </div>
    </div>
  );

  const cityMeta = city.city;
  const level = Number(cityMeta?.level || 1);
  const twitterHandle = cityMeta?.twitterHandle;

  const rendererCity = {
    followers:  Number(cityMeta?.followers  || 0),
    tweetCount: Number(cityMeta?.tweetCount || 0),
    following:  Number(cityMeta?.following  || 0),
    engagement: Number(cityMeta?.engagement || 0),
  };

  const cityName = city.ipfsData?.name || `City #${tokenId}`;
  const cityStyle = city.ipfsData?.city?.style || "Cyberpunk";
  const colorPalette = city.ipfsData?.city?.colorPalette || {};

  const shareText = `My Twitter became a ${cityStyle} ${LEVEL_NAMES[level]} called ${cityName} on Mantle! Every tweet builds the city 🏙️`;

  return (
    <div className="w-full pt-20 md:pt-24 px-4 sm:px-8 lg:px-16 xl:px-24 pb-20 relative">
      <div className="absolute top-1/3 left-0 w-96 h-96 bg-[#00d4ff]/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-0 w-96 h-96 bg-[#a855f7]/5 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full relative">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className="flex flex-col lg:flex-row lg:items-center gap-6">
            {/* Left: title + level + handle */}
            <div className="lg:shrink-0">
              <h1 className="text-3xl sm:text-4xl font-bold text-[#f1f5f9]">{cityName}</h1>
              <div className="flex items-center gap-3 mt-2">
                <span className="px-2.5 py-1 rounded-md bg-[#00d4ff]/10 border border-[#00d4ff]/20 text-[#00d4ff] text-xs font-bold">
                  {LEVEL_NAMES[level]}
                </span>
                {twitterHandle && (
                  <a href={`https://twitter.com/${twitterHandle}`} target="_blank" rel="noreferrer"
                    className="text-[#94a3b8] hover:text-[#00d4ff] text-sm flex items-center gap-1 transition-colors">
                    @{twitterHandle}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>

            {/* Center: motto + description */}
            {(city.ipfsData?.city?.motto || city.ipfsData?.description) ? (
              <div className="flex-1 glass rounded-2xl px-5 py-3 min-w-0">
                {city.ipfsData?.city?.motto && <p className="text-base italic text-[#94a3b8]">"{city.ipfsData.city.motto}"</p>}
                {city.ipfsData?.description && <p className="text-xs text-[#64748b] mt-1">{city.ipfsData.description}</p>}
              </div>
            ) : <div className="flex-1" />}

            {/* Right: actions */}
            <div className="flex items-center gap-2 lg:shrink-0">
              {isOwner && pendingGifts.length > 0 && (
                <motion.button
                  onClick={() => setShowInbox(true)}
                  className="relative flex items-center gap-2 px-4 py-2 rounded-lg glass hover:bg-[#16161f] transition-colors text-[#f59e0b]"
                  whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                >
                  <Inbox className="w-4 h-4" />
                  <span className="text-sm font-semibold">Inbox</span>
                  <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full bg-[#f59e0b] text-[#0a0a0f] text-[10px] font-bold flex items-center justify-center">
                    {pendingGifts.length}
                  </span>
                </motion.button>
              )}
              <motion.button
                onClick={likeCity} disabled={liking}
                className="flex items-center gap-2 px-4 py-2 rounded-lg glass hover:bg-[#16161f] transition-colors text-rose-400"
                whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
              >
                <Heart className={`w-4 h-4 ${liking ? 'animate-pulse' : ''}`} />
                <span className="text-sm font-semibold">{likeCount.toLocaleString()}</span>
              </motion.button>
              <motion.a
                href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(`${API_BASE}/share/city/${tokenId}`)}&hashtags=TweetCity,Mantle,NFT`}
                target="_blank" rel="noreferrer"
                className="flex items-center gap-2 px-4 py-2 rounded-lg glass hover:bg-[#16161f] transition-colors text-[#00d4ff]"
                whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
              >
                <Share2 className="w-4 h-4" />
                <span className="text-sm font-semibold hidden sm:inline">Share</span>
              </motion.a>
            </div>
          </div>
        </motion.div>

        {/* 3D City + Middle + Sidebar — 3 equal cols, stretch to tallest */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="grid lg:grid-cols-3 gap-6 mb-8 items-stretch">

          {/* Col 1: 3D City */}
          <div className="relative glass rounded-2xl overflow-hidden">
            <div className="absolute -inset-1 bg-gradient-to-r from-[#00d4ff]/20 to-[#a855f7]/20 rounded-2xl blur-xl opacity-50 pointer-events-none" />
            <div className="relative h-full">
              <CityRendererV2 city={rendererCity} tokenId={tokenId} gifts={activeGifts} />
            </div>
          </div>

          {/* Col 2: Buttons + Set Gift Prices panel (always rendered for height) */}
          <div className="glass rounded-2xl p-5 flex flex-col gap-4">
            {/* Buttons at top */}
            <div className="flex flex-col gap-2">
              {isOwner && (
                <motion.button onClick={sync} disabled={syncing}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#0a0a0f] border border-white/20 hover:bg-[#16161f] transition-colors text-[#f1f5f9] font-medium disabled:opacity-50"
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                  <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                  {syncing ? 'Syncing...' : 'Sync City'}
                </motion.button>
              )}
              {!isOwner && (
                <motion.button onClick={() => setShowGiftPanel(!showGiftPanel)}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#0a0a0f] border border-white/20 hover:bg-[#16161f] transition-colors text-[#f1f5f9] font-medium"
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                  <Gift className="w-4 h-4" />
                  {showGiftPanel ? 'Hide Gifts' : 'Send Gift'}
                </motion.button>
              )}
              {isOwner && (
                <motion.button onClick={() => setShowPriceManager(!showPriceManager)}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#0a0a0f] border border-white/20 hover:bg-[#16161f] transition-colors text-[#f1f5f9] font-medium"
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                  <Settings className="w-4 h-4" />
                  {showPriceManager ? 'Close Prices' : 'Gift Prices'}
                </motion.button>
              )}
            </div>

            {/* Set Gift Prices panel below buttons (owner) */}
            <AnimatePresence>
              {showPriceManager && isOwner && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden">
                  <div className="border-t border-white/20 pt-4">
                    <PriceManager tokenId={tokenId} signer={signer} giftsAddr={giftsContractAddr} currentPrices={prices}
                      onSaved={p => { setPrices(p); setShowPriceManager(false); }} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Send Gift panel below buttons (visitor) */}
            <AnimatePresence>
              {showGiftPanel && !isOwner && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden">
                  <div className="border-t border-white/20 pt-4 space-y-3">
                    <h3 className="font-bold text-[#f1f5f9]">Send a Gift {twitterHandle ? `to @${twitterHandle}` : ''}</h3>
                    <div className="grid grid-cols-3 gap-2">
                      {GIFT_TYPES.map((t, i) => {
                        const p = prices[i];
                        const on = p > 0n;
                        return (
                          <button key={i}
                            onClick={() => on && setGiftType(i)}
                            className={`p-2 rounded-lg transition-colors text-center border ${giftType === i ? 'border-[#00d4ff]/50 bg-[#00d4ff]/10' : 'border-white/20 bg-[#0a0a0f]/50'} ${!on ? 'opacity-40 cursor-not-allowed' : 'hover:bg-[#0a0a0f] cursor-pointer'}`}
                          >
                            <div className="text-xl mb-0.5">{t.icon}</div>
                            <div className="text-[11px] font-medium text-[#f1f5f9] leading-tight">{t.name}</div>
                            <div className="text-[10px] text-[#64748b] mt-0.5">{on ? fmt(p) : '—'}</div>
                          </button>
                        );
                      })}
                    </div>
                    {prices[giftType] > 0n && (
                      <div className="space-y-2 pt-1">
                        <input
                          className="w-full px-3 py-2 rounded-lg bg-[#0a0a0f] border border-white/20 text-[#f1f5f9] text-sm placeholder-[#64748b] focus:outline-none focus:border-[#00d4ff]/50 transition-colors"
                          placeholder="https://twitter.com/... (your tweet)"
                          value={tweetUrl}
                          onChange={e => setTweetUrl(e.target.value)}
                        />
                        <motion.button onClick={sendGift} disabled={sending || !signer}
                          className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-[#00d4ff] to-[#a855f7] text-white text-sm font-semibold disabled:opacity-50"
                          whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
                          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : `Send for ${fmt(prices[giftType])}`}
                        </motion.button>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Col 3: City Details + Color Palette */}
          <div className="glass rounded-2xl p-5 flex flex-col gap-4">
            <div>
              <h3 className="font-bold text-[#f1f5f9] mb-3">City Details</h3>
              <div className="space-y-3 text-sm">
                {[
                  { label: 'Token ID', value: `#${tokenId}`,           mono: true },
                  { label: 'Style',    value: cityStyle },
                  { label: 'Level',    value: level,                   accent: true },
                  { label: 'Owner',    value: city.managerWallet ? `${city.managerWallet.slice(0,6)}...${city.managerWallet.slice(-4)}` : '—', mono: true },
                ].map(r => (
                  <div key={r.label} className="flex justify-between">
                    <span className="text-[#64748b]">{r.label}</span>
                    <span className={`${r.mono ? 'font-mono' : ''} ${r.accent ? 'text-[#00d4ff] font-bold' : 'text-[#f1f5f9]'}`}>{r.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {Object.keys(colorPalette).length > 0 && (
              <div className="border-t border-white/20 pt-4">
                <h3 className="font-bold text-[#f1f5f9] mb-3">Color Palette</h3>
                <div className="flex gap-2 flex-wrap">
                  {Object.values(colorPalette).map((color, i) => (
                    <div key={i} className="w-10 h-10 rounded-lg border border-white/45" style={{ backgroundColor: color }} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </motion.div>

        {/* Stats */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          {[
            { icon: Users,        label: 'Population',   value: rendererCity.followers.toLocaleString(),  color: 'text-[#00d4ff]' },
            { icon: MessageSquare,label: 'Tweets',       value: rendererCity.tweetCount.toLocaleString(), color: 'text-[#a855f7]' },
            { icon: TrendingUp,   label: 'Trade Routes', value: rendererCity.following.toLocaleString(),  color: 'text-[#ec4899]' },
            { icon: Activity,     label: 'Engagement',   value: `${rendererCity.engagement}%`,            color: 'text-[#f59e0b]' },
            { icon: Heart,        label: 'Likes',        value: likeCount.toLocaleString(),               color: 'text-rose-400' },
          ].map((stat, i) => (
            <motion.div key={stat.label}
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3 + i * 0.05 }}
              className="glass rounded-xl p-4 text-center hover:bg-[#16161f] transition-all group gradient-border"
            >
              <stat.icon className={`w-5 h-5 mx-auto mb-2 ${stat.color} group-hover:scale-110 transition-transform`} />
              <div className="text-xl font-bold text-[#f1f5f9]">{stat.value}</div>
              <div className="text-[10px] text-[#64748b] uppercase tracking-wider mt-1">{stat.label}</div>
            </motion.div>
          ))}
        </motion.div>

        {/* Info & Actions */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="space-y-6">
          {/* Gift stats */}
          {giftStats && giftStats.totalGifts > 0n && (
            <div className="flex items-center gap-4 text-sm text-[#64748b]">
              <span>🎁 {giftStats.totalGifts.toString()} gifts received</span>
              <span>💰 {fmt(giftStats.totalEarned)} earned</span>
              {giftStats.pendingCount > 0n && <span className="text-[#f59e0b]">⏳ {giftStats.pendingCount.toString()} pending</span>}
            </div>
          )}

          {/* Level Up */}
          <AnimatePresence>
            {syncResult?.levelUp && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                className="glass rounded-2xl p-6 border border-[#00d4ff]/30 bg-[#00d4ff]/5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#00d4ff] to-[#a855f7] flex items-center justify-center text-lg">🚀</div>
                  <div>
                    <h4 className="font-bold text-[#f1f5f9]">Level Up! {LEVEL_NAMES[syncResult.oldLevel]} → {LEVEL_NAMES[syncResult.newLevel]}</h4>
                    {syncResult.narrative && <p className="text-sm text-[#94a3b8]">{syncResult.narrative}</p>}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="flex items-center gap-2 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />{error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* My Gifts to this city (visible to buyer) */}
          {myGifts.length > 0 && (
            <div className="glass rounded-2xl p-6">
              <h3 className="font-bold text-[#f1f5f9] mb-4">🎁 My Gifts to This City</h3>
              <div className="space-y-3">
                {myGifts.map(g => {
                  const t = GIFT_TYPES[g.giftType];
                  const now = Math.floor(Date.now() / 1000);
                  const canClaim =
                    (g.status === 0 && now > g.acceptDeadline) ||  // Pending expired
                    (g.status === 1 && now > g.engageDeadline);    // Accepted past engage
                  const statusName = ["Pending","Accepted","Verified","Rejected","Expired"][g.status] || "Unknown";
                  const statusColor = {
                    0: "text-[#f59e0b]",   // pending = amber
                    1: "text-[#00d4ff]",   // accepted = cyan
                    2: "text-emerald-400", // verified
                    3: "text-rose-400",    // rejected
                    4: "text-[#64748b]",   // expired
                  }[g.status] || "text-[#64748b]";

                  return (
                    <div key={g.id.toString()} className="p-4 rounded-xl bg-[#0a0a0f]/50 border border-white/20">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className="text-[#f1f5f9] font-medium">{t?.icon} {t?.name}</span>
                        <span className="text-[#00d4ff] text-sm">{fmt(g.ownerAmount)}</span>
                        <span className={`text-xs font-semibold ml-auto ${statusColor}`}>{statusName}</span>
                      </div>
                      <a className="text-[#00d4ff] text-xs hover:underline break-all" href={g.tweetUrl} target="_blank" rel="noreferrer">{g.tweetUrl} ↗</a>
                      {canClaim && (
                        <motion.button
                          onClick={() => claimGift(g.id)}
                          disabled={claimingId === String(g.id)}
                          className="w-full mt-3 py-2 rounded-lg bg-gradient-to-r from-rose-500 to-amber-500 text-white text-sm font-semibold disabled:opacity-50"
                          whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}
                        >
                          {claimingId === String(g.id) ? (
                            <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                          ) : `Claim Refund (${fmt(g.ownerAmount)})`}
                        </motion.button>
                      )}
                      {!canClaim && g.status === 0 && (
                        <div className="text-xs text-[#64748b] mt-2">⏱ {timeLeft(g.acceptDeadline)} for owner to respond</div>
                      )}
                      {!canClaim && g.status === 1 && (
                        <div className="text-xs text-[#64748b] mt-2">⏱ {timeLeft(g.engageDeadline)} for owner to engage</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </motion.div>
      </div>

      {/* Inbox modal */}
      <AnimatePresence>
        {showInbox && isOwner && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
            onClick={() => setShowInbox(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="glass rounded-2xl p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-[#f1f5f9] text-lg flex items-center gap-2">
                  <Inbox className="w-5 h-5 text-[#f59e0b]" /> Inbox
                  <span className="ml-1 px-2 py-0.5 rounded-full bg-[#f59e0b]/20 text-[#f59e0b] text-xs font-bold">{pendingGifts.length}</span>
                </h3>
                <button
                  onClick={() => setShowInbox(false)}
                  className="p-1 rounded-lg text-[#64748b] hover:text-[#f1f5f9] hover:bg-[#16161f] transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {pendingGifts.length === 0 ? (
                <p className="text-sm text-[#64748b] py-8 text-center">No pending gifts.</p>
              ) : (
                <div className="space-y-3">
                  {pendingGifts.map(g => {
                    const t = GIFT_TYPES[Number(g.giftType)];
                    return (
                      <div key={g.id.toString()} className="p-4 rounded-xl bg-[#0a0a0f]/70 border border-white/20">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <span className="text-[#f1f5f9] font-medium">{t?.icon} {t?.name}</span>
                          <span className="text-[#00d4ff] text-sm">{fmt(g.ownerAmount)}</span>
                          <span className="text-[#64748b] text-xs ml-auto">⏱ {timeLeft(g.acceptDeadline)}</span>
                        </div>
                        <div className="text-[11px] text-[#64748b] mb-1">{t?.obligation}</div>
                        <a className="text-[#00d4ff] text-xs hover:underline break-all" href={g.tweetUrl} target="_blank" rel="noreferrer">{g.tweetUrl} ↗</a>
                        <div className="flex gap-2 mt-3">
                          <button onClick={() => actOnGift(g.id, true)}
                            className="flex-1 py-2 rounded-lg bg-gradient-to-r from-[#00d4ff] to-[#a855f7] text-white text-sm font-medium">Accept</button>
                          <button onClick={() => actOnGift(g.id, false)}
                            className="flex-1 py-2 rounded-lg glass text-[#94a3b8] text-sm font-medium hover:bg-[#16161f] transition-colors">Reject</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PriceManager({ tokenId, signer, giftsAddr, currentPrices, onSaved }) {
  const [inputs, setInputs] = useState(currentPrices.map(p => p > 0n ? ethers.formatEther(p) : ""));
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
    } catch (e) { setErr(e.reason || e.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        {GIFT_TYPES.map((t, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-base">{t.icon}</span>
            <span className="text-xs text-[#94a3b8] flex-1 truncate">{t.name}</span>
            <input
              type="number" min="0" step="0.001" placeholder="MNT"
              value={inputs[i]}
              onChange={e => setInputs(prev => { const n=[...prev]; n[i]=e.target.value; return n; })}
              className="w-16 px-2 py-1 rounded-md bg-[#0a0a0f] border border-white/20 text-[#f1f5f9] text-xs focus:outline-none focus:border-[#00d4ff]/50"
            />
          </div>
        ))}
      </div>
      {err && <p className="text-red-400 text-xs">{err}</p>}
      <motion.button onClick={save} disabled={saving}
        className="w-full py-2 rounded-lg bg-gradient-to-r from-[#00d4ff] to-[#a855f7] text-white font-semibold text-sm disabled:opacity-50"
        whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
        {saving ? "Saving..." : "Save Prices"}
      </motion.button>
    </div>
  );
}
