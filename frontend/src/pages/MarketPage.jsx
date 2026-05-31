import { useEffect, useMemo, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ethers } from "ethers";
import {
  BriefcaseBusiness, Home, Link as LinkIcon, Loader2, Plus, Search,
  Send, Store, Users, X
} from "lucide-react";
import { API_BASE, GIFT_TYPES, MANTLE_TESTNET, fetchConfig, getGiftsContract } from "../lib/contract";
import { createWalletAuth } from "../lib/walletAuth";

const LS_TOKEN = "tweetcity_my_token";
const TABS = [
  { id: "administrator", label: "City Administrator", icon: BriefcaseBusiness },
  { id: "resident", label: "City Resident", icon: Home },
  { id: "post", label: "Post", icon: Plus },
];

function fmtWei(wei) {
  if (!wei || wei === 0n) return "—";
  const v = Number(ethers.formatEther(wei));
  return `${Number.isFinite(v) ? v.toFixed(v >= 1 ? 2 : 4) : "0"} MNT`;
}

function readMyTokenId() {
  try {
    const raw = localStorage.getItem(LS_TOKEN);
    if (!raw) return "";
    const parsed = JSON.parse(raw);
    return parsed?.tokenId ? String(parsed.tokenId) : "";
  } catch {
    return "";
  }
}

function readProvider() {
  if (window.ethereum) return new ethers.BrowserProvider(window.ethereum);
  return new ethers.JsonRpcProvider(MANTLE_TESTNET.rpcUrls[0]);
}

function GiftPriceGrid({ prices, dense = false }) {
  return (
    <div className={`grid ${dense ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3"} gap-2`}>
      {GIFT_TYPES.map((gift, i) => {
        const price = prices?.[i] || 0n;
        const enabled = price > 0n;
        return (
          <div key={gift.name} className={`rounded-lg border px-2.5 py-2 ${enabled ? "border-white/15 bg-[#0a0a0f]/55" : "border-white/10 bg-[#0a0a0f]/25 opacity-45"}`}>
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-base leading-none">{gift.icon}</span>
              <span className="text-[11px] font-semibold text-[#f1f5f9] truncate">{gift.name}</span>
            </div>
            <div className="mt-1 text-[10px] font-mono text-[#94a3b8]">{fmtWei(price)}</div>
          </div>
        );
      })}
    </div>
  );
}

function MarketCard({ listing, prices, onOpen, onCityClick }) {
  const isResident = listing.kind === "resident";
  return (
    <motion.div
      layout
      className="glass rounded-xl p-4 flex flex-col gap-3 gradient-border hover:bg-[#16161f] transition-colors cursor-pointer"
      onClick={() => onOpen(listing)}
      whileHover={{ y: -2 }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-bold text-[#f1f5f9] truncate">@{listing.twitterHandle || `city-${listing.tokenId}`}</span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${isResident ? "bg-[#a855f7]/10 text-[#c084fc]" : "bg-[#00d4ff]/10 text-[#00d4ff]"}`}>
              {isResident ? "Resident" : "Administrator"}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-3 text-xs text-[#64748b]">
            <span className="flex items-center gap-1"><Users className="w-3 h-3" />{Number(listing.followers || 0).toLocaleString()}</span>
            <span className="font-mono">#{listing.tokenId}</span>
          </div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onCityClick?.(listing.tokenId); }}
          className="px-2.5 py-1 rounded-lg border border-white/10 text-[11px] text-[#94a3b8] hover:text-[#f1f5f9] hover:bg-white/5 transition-colors"
        >
          City
        </button>
      </div>

      {isResident && listing.postUrl && (
        <div className="flex items-center gap-2 text-xs text-[#00d4ff] bg-[#00d4ff]/5 border border-[#00d4ff]/10 rounded-lg px-2.5 py-2 min-w-0">
          <LinkIcon className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{listing.postUrl}</span>
        </div>
      )}

      <GiftPriceGrid prices={prices} dense />
    </motion.div>
  );
}

function GiftOrderModal({ listing, prices, giftsAddr, signer, onClose }) {
  const [giftType, setGiftType] = useState(0);
  const [tweetUrl, setTweetUrl] = useState(listing?.kind === "resident" ? listing.postUrl || "" : "");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const selectedPrice = prices?.[giftType] || 0n;
  const isResident = listing?.kind === "resident";

  async function sendGift() {
    setError("");
    try {
      if (!signer) throw new Error("Connect wallet first");
      if (!giftsAddr) throw new Error("Gifts contract not configured");
      if (!tweetUrl.trim()) throw new Error("Tweet/Post URL required");
      if (selectedPrice <= 0n) throw new Error("This gift type is disabled");
      setSending(true);
      const gc = getGiftsContract(giftsAddr, signer);
      const tx = await gc.sendGift(listing.tokenId, giftType, tweetUrl.trim(), { value: selectedPrice });
      await tx.wait();
      onClose();
    } catch (e) {
      setError(e.reason || e.message);
    } finally {
      setSending(false);
    }
  }

  if (!listing) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="glass rounded-2xl p-5 w-full max-w-xl max-h-[88vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h3 className="text-lg font-bold text-[#f1f5f9]">Send Gift to @{listing.twitterHandle}</h3>
            <p className="text-xs text-[#64748b]">{Number(listing.followers || 0).toLocaleString()} followers · city #{listing.tokenId}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-[#64748b] hover:text-[#f1f5f9] hover:bg-white/5"><X className="w-5 h-5" /></button>
        </div>

        {isResident && listing.postUrl && (
          <a href={listing.postUrl} target="_blank" rel="noreferrer" className="mb-4 flex items-center gap-2 text-sm text-[#00d4ff] rounded-xl border border-[#00d4ff]/15 bg-[#00d4ff]/5 px-3 py-2 hover:bg-[#00d4ff]/10 transition-colors">
            <LinkIcon className="w-4 h-4" />
            Open resident post
          </a>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
          {GIFT_TYPES.map((gift, i) => {
            const price = prices?.[i] || 0n;
            const enabled = price > 0n;
            return (
              <button
                key={gift.name}
                onClick={() => enabled && setGiftType(i)}
                disabled={!enabled}
                className={`p-3 rounded-xl border text-left transition-colors ${giftType === i ? "border-[#00d4ff]/50 bg-[#00d4ff]/10" : "border-white/10 bg-[#0a0a0f]/45"} ${!enabled ? "opacity-40 cursor-not-allowed" : "hover:bg-[#16161f]"}`}
              >
                <div className="text-xl">{gift.icon}</div>
                <div className="text-xs font-semibold text-[#f1f5f9] mt-1">{gift.name}</div>
                <div className="text-[11px] font-mono text-[#94a3b8] mt-1">{fmtWei(price)}</div>
              </button>
            );
          })}
        </div>

        <label className="block text-xs font-semibold text-[#94a3b8] mb-2">
          {isResident ? "Post URL for this resident listing" : "Your post URL for the city owner to engage with"}
        </label>
        <input
          value={tweetUrl}
          onChange={(e) => setTweetUrl(e.target.value)}
          readOnly={isResident}
          placeholder="https://x.com/.../status/..."
          className="w-full px-3 py-2.5 rounded-xl bg-[#0a0a0f] border border-white/15 text-[#f1f5f9] text-sm placeholder-[#64748b] focus:outline-none focus:border-[#00d4ff]/50 disabled:opacity-60"
        />

        {error && <div className="mt-3 text-sm text-rose-400">{error}</div>}

        <button
          onClick={sendGift}
          disabled={sending || selectedPrice <= 0n}
          className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-[#00d4ff] to-[#a855f7] text-white font-semibold disabled:opacity-50"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {sending ? "Sending..." : `Pay ${fmtWei(selectedPrice)}`}
        </button>
      </motion.div>
    </div>
  );
}

export default function MarketPage({ onCityClick, signer, address, onConnect }) {
  const [tab, setTab] = useState("administrator");
  const [listings, setListings] = useState([]);
  const [query, setQuery] = useState("");
  const [pricesByToken, setPricesByToken] = useState({});
  const [giftsAddr, setGiftsAddr] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [postKind, setPostKind] = useState("administrator");
  const [postTokenId, setPostTokenId] = useState(readMyTokenId());
  const [postUrl, setPostUrl] = useState("");
  const [posting, setPosting] = useState(false);
  const [postMessage, setPostMessage] = useState("");

  const loadListings = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const [cfg, data] = await Promise.all([
        fetchConfig(),
        fetch(`${API_BASE}/api/market/listings`).then((r) => r.json()),
      ]);
      if (data?.error) throw new Error(data.error);
      setGiftsAddr(cfg.giftsContract || "");
      setListings(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadListings(); }, [loadListings]);

  useEffect(() => {
    if (!giftsAddr || listings.length === 0) return;
    let cancelled = false;
    async function loadPrices() {
      try {
        const provider = readProvider();
        const gc = getGiftsContract(giftsAddr, provider);
        const ids = [...new Set(listings.map((x) => String(x.tokenId)))];
        const pairs = await Promise.all(ids.map(async (id) => {
          try {
            const prices = await gc.getPrices(id);
            return [id, [...prices]];
          } catch {
            return [id, [0n, 0n, 0n, 0n, 0n, 0n]];
          }
        }));
        if (!cancelled) setPricesByToken(Object.fromEntries(pairs));
      } catch {}
    }
    loadPrices();
    return () => { cancelled = true; };
  }, [giftsAddr, listings]);

  async function publishListing() {
    setPostMessage("");
    setError("");
    try {
      if (!signer || !address) {
        onConnect?.();
        return;
      }
      if (!postTokenId.trim()) throw new Error("My City tokenId required");
      if (postKind === "resident" && !postUrl.trim()) throw new Error("Post URL required for City Resident");
      setPosting(true);
      const auth = await createWalletAuth(signer, `market-listing:${postTokenId.trim()}:${postKind}`);
      const res = await fetch(`${API_BASE}/api/market/listings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: postKind, tokenId: postTokenId.trim(), postUrl: postUrl.trim(), ...auth }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Failed to publish listing");
      setPostMessage("Listing published");
      await loadListings();
      setTab(postKind);
    } catch (e) {
      setError(e.message);
    } finally {
      setPosting(false);
    }
  }

  const visibleListings = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^@/, "");
    return listings
      .filter((x) => x.kind === tab)
      .filter((x) => !q || String(x.twitterHandle || "").toLowerCase().includes(q) || String(x.tokenId).includes(q))
      .sort((a, b) => Number(b.followers || 0) - Number(a.followers || 0));
  }, [listings, query, tab]);

  const myPrices = pricesByToken[String(postTokenId)] || null;

  return (
    <div className="w-full pt-20 md:pt-24 px-4 sm:px-6 lg:px-8 pb-20 relative">
      <div className="w-full relative">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-5">
          <div className="flex gap-2 flex-wrap">
            {TABS.map((item) => (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-semibold transition-colors ${tab === item.id ? "bg-[#00d4ff]/10 border-[#00d4ff]/30 text-[#00d4ff]" : "bg-[#0a0a0f]/65 border-white/10 text-[#94a3b8] hover:text-[#f1f5f9]"}`}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </button>
            ))}
          </div>
          {tab !== "post" && (
            <div className="relative lg:ml-auto w-full lg:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748b]" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search @handle or token"
                className="w-full pl-10 pr-3 py-2 rounded-lg bg-[#0a0a0f] border border-white/10 text-[#f1f5f9] text-sm placeholder-[#64748b] focus:outline-none focus:border-[#00d4ff]/40"
              />
            </div>
          )}
        </div>

        {error && <div className="mb-4 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</div>}

        {tab === "post" ? (
          <div className="grid xl:grid-cols-[0.85fr_1.15fr] gap-5">
            <div className="glass rounded-xl p-5">
              <h3 className="font-bold text-[#f1f5f9] mb-4">Create Market Listing</h3>
              <div className="grid grid-cols-2 gap-2 mb-4">
                {["administrator", "resident"].map((kind) => (
                  <button
                    key={kind}
                    onClick={() => setPostKind(kind)}
                    className={`px-3 py-3 rounded-xl border text-sm font-semibold ${postKind === kind ? "border-[#00d4ff]/40 bg-[#00d4ff]/10 text-[#00d4ff]" : "border-white/10 bg-[#0a0a0f]/45 text-[#94a3b8]"}`}
                  >
                    {kind === "administrator" ? "City Administrator" : "City Resident"}
                  </button>
                ))}
              </div>
              <label className="block text-xs font-semibold text-[#94a3b8] mb-2">My City Token ID</label>
              <input
                value={postTokenId}
                onChange={(e) => setPostTokenId(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="1"
                className="w-full px-3 py-2.5 rounded-xl bg-[#0a0a0f] border border-white/15 text-[#f1f5f9] text-sm focus:outline-none focus:border-[#00d4ff]/50 mb-4"
              />
              {postKind === "resident" && (
                <>
                  <label className="block text-xs font-semibold text-[#94a3b8] mb-2">Post URL</label>
                  <input
                    value={postUrl}
                    onChange={(e) => setPostUrl(e.target.value)}
                    placeholder="https://x.com/.../status/..."
                    className="w-full px-3 py-2.5 rounded-xl bg-[#0a0a0f] border border-white/15 text-[#f1f5f9] text-sm placeholder-[#64748b] focus:outline-none focus:border-[#00d4ff]/50 mb-4"
                  />
                </>
              )}
              <button
                onClick={publishListing}
                disabled={posting}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-[#00d4ff] to-[#a855f7] text-white font-semibold disabled:opacity-50"
              >
                {posting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Store className="w-4 h-4" />}
                {posting ? "Publishing..." : "Publish Listing"}
              </button>
              {postMessage && <div className="mt-3 text-sm text-emerald-400">{postMessage}</div>}
              {!address && <div className="mt-3 text-xs text-[#64748b]">Connect wallet to publish. The wallet must manage this city.</div>}
            </div>

            <div className="glass rounded-xl p-5">
              <h3 className="font-bold text-[#f1f5f9] mb-4">Listing Preview</h3>
              <div className="rounded-xl border border-white/10 bg-[#0a0a0f]/35 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-bold text-[#f1f5f9]">City #{postTokenId || "?"}</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#00d4ff]/10 text-[#00d4ff]">
                    {postKind === "administrator" ? "Administrator" : "Resident"}
                  </span>
                </div>
                {postKind === "resident" && postUrl && (
                  <div className="mb-4 text-xs text-[#00d4ff] truncate">{postUrl}</div>
                )}
                <GiftPriceGrid prices={myPrices} />
              </div>
            </div>
          </div>
        ) : loading ? (
          <div className="pt-24 flex justify-center"><Loader2 className="w-8 h-8 text-[#00d4ff] animate-spin" /></div>
        ) : visibleListings.length === 0 ? (
          <div className="glass rounded-xl p-10 text-center text-[#64748b]">No listings yet.</div>
        ) : (
          <motion.div layout className="grid md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
            {visibleListings.map((listing) => (
              <MarketCard
                key={listing.id}
                listing={listing}
                prices={pricesByToken[String(listing.tokenId)]}
                onOpen={setSelected}
                onCityClick={onCityClick}
              />
            ))}
          </motion.div>
        )}
      </div>

      <AnimatePresence>
        {selected && (
          <GiftOrderModal
            listing={selected}
            prices={pricesByToken[String(selected.tokenId)]}
            giftsAddr={giftsAddr}
            signer={signer}
            onClose={() => setSelected(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
