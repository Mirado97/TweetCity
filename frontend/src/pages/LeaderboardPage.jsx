import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Trophy, Crown, Medal, Users, TrendingUp, Loader2 } from "lucide-react";
import { API_BASE, LEVEL_NAMES } from "../lib/contract";
import CityThumbnail from "../components/CityThumbnail";

function RankBadge({ rank }) {
  if (rank === 1) return (
    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-300 to-amber-500 flex items-center justify-center shadow-lg shadow-amber-500/30">
      <Crown className="w-5 h-5 text-amber-900" />
    </div>
  );
  if (rank === 2) return (
    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-300 to-slate-400 flex items-center justify-center shadow-lg shadow-slate-400/30">
      <Medal className="w-5 h-5 text-slate-800" />
    </div>
  );
  if (rank === 3) return (
    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-300 to-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/30">
      <Medal className="w-5 h-5 text-orange-900" />
    </div>
  );
  return (
    <div className="w-10 h-10 rounded-full bg-[#0a0a0f] border border-[rgba(255,255,255,0.06)] flex items-center justify-center">
      <span className="text-sm font-bold text-[#64748b]">#{rank}</span>
    </div>
  );
}

export default function LeaderboardPage({ onCityClick }) {
  const [board, setBoard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${API_BASE}/api/leaderboard`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setBoard(Array.isArray(data) ? data : []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="pt-32 flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="w-8 h-8 text-[#00d4ff] animate-spin" />
        <p className="text-[#94a3b8]">Loading leaderboard...</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="pt-32 flex items-center justify-center min-h-[60vh]">
      <p className="text-[#94a3b8]">{error}</p>
    </div>
  );

  return (
    <div className="pt-20 md:pt-24 px-4 sm:px-6 lg:px-8 pb-20 relative">
      <div className="absolute top-1/4 right-0 w-96 h-96 bg-[#f59e0b]/5 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-5xl mx-auto relative">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#f59e0b]/10 border border-[#f59e0b]/20 text-[#f59e0b] text-xs font-semibold mb-4">
            <Trophy className="w-3.5 h-3.5" />
            Community
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold mb-3">City Leaderboard</h1>
          <p className="text-[#94a3b8] max-w-lg mx-auto">Top cities ranked by Twitter population. The bigger your audience, the grander your metropolis.</p>
        </motion.div>

        {board.length === 0 && (
          <p className="text-center text-[#64748b]">No cities minted yet. Be the first!</p>
        )}

        {/* Top 3 Podium */}
        {board.length >= 3 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="grid grid-cols-3 gap-4 mb-12 max-w-2xl mx-auto">
            {[board[1], board[0], board[2]].map((entry, i) => {
              if (!entry) return null;
              const positions = [
                { order: 2, height: 'h-32', margin: 'mt-8' },
                { order: 1, height: 'h-40', margin: '' },
                { order: 3, height: 'h-28', margin: 'mt-12' },
              ];
              const pos = positions[i];
              return (
                <motion.div
                  key={entry.tokenId}
                  initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + i * 0.1 }}
                  className={`flex flex-col items-center ${pos.margin} cursor-pointer`}
                  onClick={() => onCityClick(entry.tokenId)}
                >
                  <div className="mb-3"><RankBadge rank={pos.order} /></div>
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#00d4ff] to-[#a855f7] flex items-center justify-center text-2xl mb-2">🏙️</div>
                  <div className="text-sm font-bold text-[#f1f5f9] text-center truncate w-full">@{entry.twitterHandle || `#${entry.tokenId}`}</div>
                  <div className="text-xs text-[#64748b]">{Number(entry.followers || 0).toLocaleString()} followers</div>
                  <div className={`w-full ${pos.height} mt-3 rounded-t-xl bg-gradient-to-t from-[#16161f] to-transparent border-t border-x border-[rgba(255,255,255,0.06)]`} />
                </motion.div>
              );
            })}
          </motion.div>
        )}

        {/* List */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="space-y-3">
          {board.slice(3).map((entry, i) => {
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
                initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 * i }}
                onClick={() => onCityClick(entry.tokenId)}
                className="glass rounded-xl p-4 hover:bg-[#16161f] transition-all cursor-pointer group gradient-border"
              >
                <div className="flex items-center gap-4">
                  <RankBadge rank={i + 4} />
                  <div className="w-24 hidden sm:block flex-shrink-0">
                    <CityThumbnail city={thumbCity} tokenId={entry.tokenId} width={96} height={60} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
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
                  <div className="text-right">
                    <div className="text-sm font-bold text-[#f1f5f9]">#{entry.tokenId}</div>
                    <div className="text-[10px] text-[#64748b]">Token ID</div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </div>
  );
}
