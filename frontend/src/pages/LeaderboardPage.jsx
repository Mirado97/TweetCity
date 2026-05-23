import { useState, useEffect } from "react";
import { API_BASE, LEVEL_NAMES } from "../lib/contract";
import CityRenderer from "../components/CityRenderer";

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

  if (loading) return <div className="page-loading">Loading leaderboard...</div>;
  if (error) return <div className="page-error">{error}</div>;

  return (
    <div className="leaderboard-page">
      <h1>City Leaderboard</h1>
      <p className="subtitle">Top cities ranked by Twitter population</p>
      {board.length === 0 && <p className="empty">No cities minted yet. Be the first!</p>}
      <div className="leaderboard-grid">
        {board.map((entry, i) => {
          const level = Number(entry.level || 1);
          const rendererCity = {
            level,
            style: "Cyberpunk",
            colorPalette: { primary: "#334", secondary: "#667", accent: "#f0f" },
            followers: Number(entry.followers || 0),
            cityName: entry.twitterHandle ? `@${entry.twitterHandle}` : `#${entry.tokenId}`,
          };
          return (
            <div key={entry.tokenId} className="leaderboard-card" onClick={() => onCityClick(entry.tokenId)}>
              <div className="rank">#{i + 1}</div>
              <CityRenderer city={rendererCity} width={220} height={130} />
              <div className="lb-info">
                <div className="lb-handle">@{entry.twitterHandle || "unknown"}</div>
                <div className="lb-level">{LEVEL_NAMES[level]}</div>
                <div className="lb-followers">{Number(entry.followers || 0).toLocaleString()} followers</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
