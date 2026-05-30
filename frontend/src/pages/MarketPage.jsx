import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { Store, Search, Users, TrendingUp, Loader2, Gift } from "lucide-react";
import { API_BASE, LEVEL_NAMES } from "../lib/contract";
import CityThumbnail from "../components/CityThumbnail";

export default function MarketPage({ onCityClick }) {
  const [allCities, setAllCities] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${API_BASE}/api/cities`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.error) throw new Error(data.error);
        setAllCities(Array.isArray(data) ? data : []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^@/, "");
    const list = q
      ? allCities.filter((c) => (c.twitterHandle || "").toLowerCase().includes(q))
      : allCities.slice();
    // Sort by followers desc — visitors care about reach when buying gifts.
    return list.sort((a, b) => Number(b.followers || 0) - Number(a.followers || 0));
  }, [allCities, query]);

  if (loading) return (
    <div className="pt-32 flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="w-8 h-8 text-[#00d4ff] animate-spin" />
        <p className="text-[#94a3b8]">Loading cities...</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="pt-32 flex items-center justify-center min-h-[60vh]">
      <p className="text-rose-400">{error}</p>
    </div>
  );

  return (
    <div className="w-full pt-20 md:pt-24 px-4 sm:px-6 lg:px-8 pb-20 relative">
      <div className="absolute top-1/4 right-0 w-96 h-96 bg-[#00d4ff]/5 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full relative max-w-5xl mx-auto">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#00d4ff]/10 border border-[#00d4ff]/20 text-[#00d4ff] text-xs font-semibold mb-4">
            <Store className="w-3.5 h-3.5" />
            Market
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold mb-3">Find a City</h1>
          <p className="text-[#94a3b8] max-w-lg mx-auto">
            Search any minted city by Twitter handle. Tap a card to visit and send a gift.
          </p>
        </motion.div>

        {/* Search input */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mb-6">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748b]" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by handle, e.g. @miradonas"
              className="w-full pl-11 pr-4 py-3 rounded-xl bg-[#0a0a0f] border border-[rgba(255,255,255,0.08)] text-[#f1f5f9] placeholder:text-[#64748b] focus:outline-none focus:border-[#00d4ff]/40 transition-colors"
            />
          </div>
          <div className="mt-2 text-xs text-[#64748b] text-center">
            {filtered.length} of {allCities.length} cities
          </div>
        </motion.div>

        {/* List */}
        {filtered.length === 0 ? (
          <p className="text-center text-[#64748b] mt-8">
            {query ? `No cities match “${query}”` : "No cities minted yet."}
          </p>
        ) : (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="space-y-3">
            {filtered.map((entry, i) => {
              const level = Number(entry.level || 1);
              const thumbCity = {
                followers:  Number(entry.followers  || 0),
                tweetCount: Number(entry.tweetCount || 0),
                following:  Number(entry.following  || 0),
                engagement: Number(entry.engagement || 0),
              };
              return (
                <motion.div
                  key={entry.tokenId}
                  initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(0.05 * i, 0.5) }}
                  onClick={() => onCityClick(entry.tokenId)}
                  className="glass rounded-xl p-4 hover:bg-[#16161f] transition-all cursor-pointer group gradient-border"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-24 hidden sm:block flex-shrink-0">
                      <CityThumbnail city={thumbCity} tokenId={entry.tokenId} width={96} height={60} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-bold text-[#f1f5f9]">@{entry.twitterHandle || `#${entry.tokenId}`}</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#00d4ff]/10 text-[#00d4ff]">
                          {LEVEL_NAMES[level]}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-[#64748b]">
                        <span className="flex items-center gap-1"><Users className="w-3 h-3" />{Number(entry.followers || 0).toLocaleString()}</span>
                        <span className="flex items-center gap-1"><TrendingUp className="w-3 h-3" />{Number(entry.engagement || 0).toFixed(1)}%</span>
                      </div>
                    </div>
                    <div className="hidden sm:flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#00d4ff]/10 text-[#00d4ff] text-xs font-medium group-hover:bg-[#00d4ff]/20 transition-colors">
                      <Gift className="w-3.5 h-3.5" />
                      Send Gift
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </div>
    </div>
  );
}
