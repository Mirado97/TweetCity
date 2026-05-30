import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Loader2, AlertCircle, ArrowRight, ExternalLink, CheckCircle2 } from "lucide-react";
import { API_BASE, LEVEL_NAMES } from "../lib/contract";
import CityRendererV2 from "../components/CityRendererV2";

const VIRAL_TEXTS = [
  (name, level, style) => `Just minted ${name} — a ${LEVEL_NAMES[level]} ${style} city on Mantle! My Twitter is now an NFT 🏙 Join TweetCity and mint yours!`,
  (name, level, style) => `My Twitter presence is now a ${LEVEL_NAMES[level]} ${style} city called ${name} 🌆 Built on Mantle blockchain. What would YOUR city look like?`,
  (name, level, style) => `${name} rises from the blockchain! 🏗 A ${style} ${LEVEL_NAMES[level]} born from my tweets on @MantleNetwork. Claim your city on TweetCity!`,
  (name, level, style) => `Every tweet I've posted built this city ↓ ${name}, a ${style} ${LEVEL_NAMES[level]} on Mantle 🌃 Mint your own at TweetCity!`,
  (name, level, style) => `I turned my Twitter into a living city NFT 🗺 ${name} (${style} ${LEVEL_NAMES[level]}) is now on-chain on Mantle. Who else is minting?`,
];

function getShareUrl(name, level, style) {
  const t = VIRAL_TEXTS[Math.floor(Math.random() * VIRAL_TEXTS.length)](name, level, style);
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(t)}&hashtags=TweetCity,Mantle,NFT,Web3`;
}

const STEPS = {
  wallet:  { num: "1 / 3", title: "Connect Wallet" },
  x:       { num: "2 / 3", title: "Connect X" },
  ready:   { num: "3 / 3", title: "Mint Your City" },
  minting: { num: "—",     title: "Building Your City" },
  done:    { num: "✓",     title: "City Minted!" },
};

export default function MintPage({ address, onConnect, onMinted }) {
  const [step, setStep] = useState(address ? "x" : "wallet");
  const [linked, setLinked] = useState(null); // null | {linked, cityHandle, twitterUserId}
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const pollRef = useRef(null);

  // Check current OAuth link state for this wallet.
  async function refreshLink(addr) {
    if (!addr) return null;
    try {
      const r = await fetch(`${API_BASE}/auth/twitter/status?address=${addr}`);
      const d = await r.json();
      setLinked(d);
      if (d?.linked) setStep((s) => (s === "x" || s === "wallet" ? "ready" : s));
      return d;
    } catch { return null; }
  }

  useEffect(() => {
    if (address) refreshLink(address);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [address]);

  function startConnectX() {
    if (!address) return;
    const url = `${API_BASE}/auth/twitter/start?address=${address}`;
    window.open(url, "_blank", "noopener,noreferrer");
    // Poll status every 2s until we see linked, then stop.
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const d = await refreshLink(address);
      if (d?.linked) { clearInterval(pollRef.current); pollRef.current = null; }
    }, 2000);
  }

  async function mint() {
    setError("");
    setLoading(true);
    setStep("minting");
    try {
      const res = await fetch(`${API_BASE}/api/mint`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: address }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (data.alreadyMinted) { onMinted?.(data.tokenId); return; }
      setResult(data);
      setStep("done");
      onMinted?.(data.tokenId);
    } catch (e) {
      setError(e.message);
      setStep("ready");
    } finally {
      setLoading(false);
    }
  }

  const city = result?.cityData;
  const cityConfig = city ? {
    followers:  Number(city.metrics?.followers  || 0),
    tweetCount: Number(city.metrics?.tweetCount || 0),
    following:  Number(city.metrics?.following  || 0),
    engagement: Number(city.metrics?.engagement || 0),
  } : null;

  const handle = linked?.cityHandle || "";
  const currentStep = STEPS[step];

  return (
    <div className="w-full pt-24 md:pt-28 px-4 sm:px-6 lg:px-8 pb-20 relative">
      <div className="absolute top-1/3 left-0 w-72 h-72 bg-[#00d4ff]/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-0 w-72 h-72 bg-[#a855f7]/5 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-2xl mx-auto relative">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#00d4ff]/10 border border-[#00d4ff]/20 text-[#00d4ff] text-xs font-semibold mb-4">
            <Sparkles className="w-3.5 h-3.5" />
            {currentStep.num}
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold mt-3 mb-4">{currentStep.title}</h1>
          <p className="text-[#94a3b8]">Transform your Twitter presence into a living city NFT on Mantle</p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass rounded-2xl p-6 md:p-8">

          {/* Step 1: Wallet */}
          {step === "wallet" && (
            <div className="text-center py-4 space-y-6">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#00d4ff] to-[#a855f7] flex items-center justify-center mx-auto shadow-lg shadow-[#00d4ff]/20">
                <Sparkles className="w-8 h-8 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-bold mb-2 text-[#f1f5f9]">Connect Your Wallet</h3>
                <p className="text-[#94a3b8]">Connect MetaMask to get started. We'll switch you to Mantle Testnet automatically.</p>
              </div>
              <motion.button
                onClick={async () => { await onConnect(); setStep("x"); }}
                className="px-6 py-3 rounded-xl bg-gradient-to-r from-[#00d4ff] to-[#a855f7] text-white font-semibold shadow-lg shadow-[#00d4ff]/25"
                whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
              >
                Connect MetaMask
              </motion.button>
            </div>
          )}

          {/* Step 2: Connect X */}
          {step === "x" && (
            <div className="space-y-6">
              <p className="text-sm text-[#94a3b8]">
                Connected: <span className="font-mono text-[#00d4ff]">{address?.slice(0, 6)}...{address?.slice(-4)}</span>
              </p>
              <div className="text-center py-4">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center mx-auto mb-4 text-3xl text-white font-bold">𝕏</div>
                <h3 className="text-xl font-bold mb-2 text-[#f1f5f9]">Connect Your X Account</h3>
                <p className="text-[#94a3b8] max-w-md mx-auto">
                  Authorize TweetCity to read your profile. We use this to mint your city and verify engagement on paid gifts.
                </p>
              </div>
              <motion.button
                onClick={startConnectX}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-semibold shadow-lg shadow-emerald-500/25"
                whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}
              >
                <span className="text-base">𝕏</span> Connect X
              </motion.button>
              <p className="text-xs text-[#64748b] text-center">
                A new tab will open on x.com. Approve access, then return here — this page will update automatically.
              </p>
            </div>
          )}

          {/* Step 3: Ready to mint */}
          {step === "ready" && (
            <div className="space-y-6">
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-emerald-300">Connected as @{handle}</div>
                  <div className="text-xs text-emerald-300/70">Wallet {address?.slice(0,6)}…{address?.slice(-4)}</div>
                </div>
              </div>

              <p className="text-sm text-[#94a3b8]">
                We'll analyze your last tweets, generate a unique city with AI, upload to IPFS, and mint the NFT on Mantle.
              </p>

              <AnimatePresence>
                {error && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                    className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                    <AlertCircle className="w-4 h-4 shrink-0" />{error}
                  </motion.div>
                )}
              </AnimatePresence>

              <motion.button
                onClick={mint} disabled={loading}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-[#00d4ff] to-[#a855f7] text-white font-semibold shadow-lg shadow-[#00d4ff]/25 disabled:opacity-50 disabled:cursor-not-allowed"
                whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><span>Mint My City</span><ArrowRight className="w-4 h-4" /></>}
              </motion.button>
            </div>
          )}

          {/* Minting */}
          {step === "minting" && (
            <div className="text-center py-8 space-y-6">
              <Loader2 className="w-12 h-12 text-[#00d4ff] animate-spin mx-auto" />
              <h2 className="text-xl font-bold text-[#f1f5f9]">Building Your City...</h2>
              <ul className="space-y-2 text-sm text-[#94a3b8]">
                {["Analyzing your tweets", "Generating city with AI", "Uploading to IPFS", "Minting on Mantle"].map((s, i) => (
                  <motion.li key={s} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.4 }}
                    className="flex items-center justify-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#00d4ff]" />{s}
                  </motion.li>
                ))}
              </ul>
            </div>
          )}

          {/* Done */}
          {step === "done" && city && cityConfig && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="text-4xl mb-3">🎉</div>
                <h2 className="text-2xl font-bold text-[#f1f5f9]">{city.name} Minted!</h2>
              </div>
              <div className="rounded-xl overflow-hidden">
                <CityRendererV2 city={cityConfig} tokenId={result?.tokenId || 0} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Level',   value: LEVEL_NAMES[city.city?.level] },
                  { label: 'Token',   value: `#${result.tokenId}` },
                  { label: 'Style',   value: city.city?.style },
                  { label: 'Motto',   value: city.city?.motto },
                ].map(r => (
                  <div key={r.label} className="p-3 rounded-xl bg-[#0a0a0f]/50 border border-[rgba(255,255,255,0.06)]">
                    <div className="text-[10px] text-[#64748b] uppercase tracking-wider mb-1">{r.label}</div>
                    <div className="text-sm font-bold text-[#f1f5f9] truncate">{r.value}</div>
                  </div>
                ))}
              </div>
              {city.description && <p className="text-sm text-[#94a3b8] italic">{city.description}</p>}

              <div className="flex gap-3">
                <motion.a
                  href={`https://explorer.sepolia.mantle.xyz/tx/${result.txHash}`}
                  target="_blank" rel="noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl glass text-[#f1f5f9] font-medium hover:bg-[#16161f] transition-colors text-sm"
                  whileHover={{ scale: 1.01 }}
                >
                  <ExternalLink className="w-4 h-4" /> View Tx
                </motion.a>
                <motion.a
                  href={getShareUrl(city.name, city.city?.level, city.city?.style)}
                  target="_blank" rel="noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-[#00d4ff] to-[#a855f7] text-white font-semibold text-sm"
                  whileHover={{ scale: 1.01 }}
                >
                  <Sparkles className="w-4 h-4" /> Share on Twitter
                </motion.a>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
