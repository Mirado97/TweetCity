import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ethers } from "ethers";
import {
  Heart, RefreshCw, Share2, ExternalLink,
  Loader2, AlertCircle, TrendingUp, Users, MessageSquare, Activity,
  Gift, Settings, X
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
  const [giftStats, setGiftStats] = useState(null);
  const [showGiftPanel, setShowGiftPanel] = useState(false);
  const [showPriceManager, setShowPriceManager] = useState(false);
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
      setActiveGifts(active.map(g => ({ id: g.id, giftType: g.giftType, tweetUrl: g.tweetUrl, buyer: g.buyer, status: g.status })));
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
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadCity(); }, [tokenId]);
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
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
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
            <div className="flex items-center gap-2">
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

        {/* 3D City + Sidebar */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="grid lg:grid-cols-3 gap-6 mb-8">
          {/* 3D City */}
          <div className="lg:col-span-2 relative">
            <div className="absolute -inset-1 bg-gradient-to-r from-[#00d4ff]/20 to-[#a855f7]/20 rounded-2xl blur-xl opacity-50" />
            <div className="relative">
              <CityRendererV2 city={rendererCity} tokenId={tokenId} />
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <div className="glass rounded-2xl p-5">
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
              <div className="glass rounded-2xl p-5">
                <h3 className="font-bold text-[#f1f5f9] mb-3">Color Palette</h3>
                <div className="flex gap-2 flex-wrap">
                  {Object.values(colorPalette).map((color, i) => (
                    <div key={i} className="w-10 h-10 rounded-lg border border-white/20" style={{ backgroundColor: color }} />
                  ))}
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex flex-col gap-2">
              {isOwner && (
                <motion.button onClick={sync} disabled={syncing}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg glass hover:bg-[#16161f] transition-colors text-[#f1f5f9] font-medium disabled:opacity-50 w-full"
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                  <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                  {syncing ? 'Syncing...' : 'Sync City'}
                </motion.button>
              )}
              {!isOwner && (
                <motion.button onClick={() => setShowGiftPanel(!showGiftPanel)}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg glass hover:bg-[#16161f] transition-colors text-[#f1f5f9] font-medium w-full"
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                  <Gift className="w-4 h-4" />
                  {showGiftPanel ? 'Hide Gifts' : 'Send Gift'}
                </motion.button>
              )}
              {isOwner && (
                <motion.button onClick={() => setShowPriceManager(!showPriceManager)}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg glass hover:bg-[#16161f] transition-colors text-[#f1f5f9] font-medium w-full"
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                  <Settings className="w-4 h-4" />
                  Gift Prices
                </motion.button>
              )}
            </div>

            {/* Price Manager (owner) — in sidebar */}
            <AnimatePresence>
              {showPriceManager && isOwner && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="glass rounded-2xl p-5">
                  <h3 className="font-bold text-[#f1f5f9] mb-4">Set Gift Prices</h3>
                  <PriceManager tokenId={tokenId} signer={signer} giftsAddr={giftsContractAddr} currentPrices={prices}
                    onSaved={p => { setPrices(p); setShowPriceManager(false); }} />
                </motion.div>
              )}
            </AnimatePresence>
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
          {(city.ipfsData?.city?.motto || city.ipfsData?.description) && (
            <div className="glass rounded-2xl p-6">
              {city.ipfsData?.city?.motto && <p className="text-lg italic text-[#94a3b8] mb-3">"{city.ipfsData.city.motto}"</p>}
              {city.ipfsData?.description && <p className="text-sm text-[#64748b]">{city.ipfsData.description}</p>}
            </div>
          )}

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

          {/* Gift Shop (visitors) */}
          <AnimatePresence>
            {showGiftPanel && !isOwner && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="glass rounded-2xl p-6">
                <h3 className="font-bold text-[#f1f5f9] mb-4">Send a Gift to {twitterHandle ? `@${twitterHandle}` : 'this city'}</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                  {GIFT_TYPES.map((t, i) => {
                    const p = prices[i];
                    const on = p > 0n;
                    return (
                      <button key={i}
                        onClick={() => on && setGiftType(i)}
                        className={`p-4 rounded-xl transition-colors text-center border ${giftType === i ? 'border-[#00d4ff]/50 bg-[#00d4ff]/10' : 'border-white/20 bg-[#0a0a0f]/50'} ${!on ? 'opacity-40 cursor-not-allowed' : 'hover:bg-[#0a0a0f] cursor-pointer'}`}
                      >
                        <div className="text-2xl mb-1">{t.icon}</div>
                        <div className="text-sm font-medium text-[#f1f5f9]">{t.name}</div>
                        <div className="text-xs text-[#64748b]">{on ? fmt(p) : '—'}</div>
                      </button>
                    );
                  })}
                </div>
                {prices[giftType] > 0n && (
                  <div className="space-y-3">
                    <input
                      className="w-full px-4 py-3 rounded-xl bg-[#0a0a0f] border border-white/20 text-[#f1f5f9] placeholder-[#64748b] focus:outline-none focus:border-[#00d4ff]/50 transition-colors"
                      placeholder="https://twitter.com/... (your tweet link)"
                      value={tweetUrl}
                      onChange={e => setTweetUrl(e.target.value)}
                    />
                    <motion.button onClick={sendGift} disabled={sending || !signer}
                      className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-[#00d4ff] to-[#a855f7] text-white font-semibold disabled:opacity-50"
                      whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
                      {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : `Send for ${fmt(prices[giftType])}`}
                    </motion.button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Inbox (owner) */}
          {isOwner && pendingGifts.length > 0 && (
            <div className="glass rounded-2xl p-6">
              <h3 className="font-bold text-[#f1f5f9] mb-4">📬 Inbox <span className="ml-2 px-2 py-0.5 rounded-full bg-[#f59e0b]/20 text-[#f59e0b] text-xs">{pendingGifts.length}</span></h3>
              <div className="space-y-3">
                {pendingGifts.map(g => {
                  const t = GIFT_TYPES[Number(g.giftType)];
                  return (
                    <div key={g.id.toString()} className="p-4 rounded-xl bg-[#0a0a0f]/50 border border-white/20">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[#f1f5f9] font-medium">{t?.icon} {t?.name}</span>
                        <span className="text-[#00d4ff] text-sm">{fmt(g.ownerAmount)}</span>
                        <span className="text-[#64748b] text-xs ml-auto">⏱ {timeLeft(g.acceptDeadline)}</span>
                      </div>
                      <a className="text-[#00d4ff] text-xs hover:underline" href={g.tweetUrl} target="_blank" rel="noreferrer">View tweet ↗</a>
                      <div className="flex gap-2 mt-3">
                        <button onClick={() => actOnGift(g.id, true)}
                          className="flex-1 py-1.5 rounded-lg bg-gradient-to-r from-[#00d4ff] to-[#a855f7] text-white text-sm font-medium">Accept</button>
                        <button onClick={() => actOnGift(g.id, false)}
                          className="flex-1 py-1.5 rounded-lg glass text-[#94a3b8] text-sm font-medium">Reject</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </motion.div>
      </div>
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
      {GIFT_TYPES.map((t, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="text-lg">{t.icon}</span>
          <span className="text-sm text-[#94a3b8] flex-1">{t.name}</span>
          <input
            type="number" min="0" step="0.001" placeholder="MNT"
            value={inputs[i]}
            onChange={e => setInputs(prev => { const n=[...prev]; n[i]=e.target.value; return n; })}
            className="w-24 px-3 py-1.5 rounded-lg bg-[#0a0a0f] border border-white/20 text-[#f1f5f9] text-sm focus:outline-none focus:border-[#00d4ff]/50"
          />
        </div>
      ))}
      {err && <p className="text-red-400 text-sm">{err}</p>}
      <motion.button onClick={save} disabled={saving}
        className="w-full py-2.5 rounded-lg bg-gradient-to-r from-[#00d4ff] to-[#a855f7] text-white font-semibold text-sm disabled:opacity-50"
        whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
        {saving ? "Saving..." : "Save Prices"}
      </motion.button>
    </div>
  );
}
