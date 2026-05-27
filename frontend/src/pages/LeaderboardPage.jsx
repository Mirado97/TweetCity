import { useState, useEffect } from "react";
import { API_BASE, LEVEL_NAMES } from "../lib/contract";
import CityRenderer from "../components/CityRenderer";

const RANK_STYLES = {
  1: { bg: "linear-gradient(135deg, #ffd700, #ffb700)", color: "#1a1a2e" },
  2: { bg: "linear-gradient(135deg, #c0c0c0, #a8a8a8)", color: "#1a1a2e" },
  3: { bg: "linear-gradient(135deg, #cd7f32, #b8722d)", color: "#ffffff" },
};

function RankBadge({ rank }) {
  const style = RANK_STYLES[rank];
  if (style) {
    return (
      <div 
        className="leader-rank"
        style={{ 
          background: style.bg,
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          width: 40,
          height: 40,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1rem',
          fontWeight: 900,
          boxShadow: '0 2px 12px rgba(0,0,0,0.4)'
        }}
      >
        {rank}
      </div>
    );
  }
  return <div className="leader-rank">#{rank}</div>;
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

  if (loading) return <div className="loading">Loading leaderboard...</div>;
  if (error) return <div className="page-error">{error}</div>;

  return (
    <div className="leaderboard-page fade-in">
      <div className="leaderboard-header">
        <span className="section-label">Community</span>
        <h1>City Leaderboard</h1>
        <p>Top cities ranked by Twitter population</p>
      </div>

      {board.length === 0 && (
        <p className="empty">No cities minted yet. Be the first to mint your city!</p>
      )}
      
      <div className="leaderboard-grid">
        {board.map((entry, i) => {
          const rank = i + 1;
          const level = Number(entry.level || 1);
          const rendererCity = {
            level,
            style: "Cyberpunk",
            colorPalette: { primary: "#334", secondary: "#667", accent: "#f0f" },
            followers: Number(entry.followers || 0),
            cityName: entry.twitterHandle ? `@${entry.twitterHandle}` : `#${entry.tokenId}`,
          };
          return (
            <div 
              key={entry.tokenId} 
              className="leader-card"
              onClick={() => onCityClick(entry.tokenId)}
            >
              <RankBadge rank={rank} />
              <CityRenderer city={rendererCity} width={240} height={140} />
              <div className="leader-info">
                <div className="leader-handle">@{entry.twitterHandle || "unknown"}</div>
                <div className="leader-level">{LEVEL_NAMES[level]}</div>
                <div className="leader-followers">
                  {Number(entry.followers || 0).toLocaleString()} followers
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}