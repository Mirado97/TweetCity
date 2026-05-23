import CityRenderer from "../components/CityRenderer";

const DEMO_CITIES = [
  { level: 5, style: "Cyberpunk", colorPalette: { primary: "#2a0040", secondary: "#440066", accent: "#ff00ff" }, followers: 150000, cityName: "NeonVex Prime" },
  { level: 3, style: "Eco-Futurism", colorPalette: { primary: "#003320", secondary: "#005533", accent: "#00ff88" }, followers: 5000, cityName: "Verdania" },
  { level: 4, style: "Medieval", colorPalette: { primary: "#3d1f00", secondary: "#5c3300", accent: "#ffaa00" }, followers: 42000, cityName: "Ironhold" },
];

export default function LandingPage({ onMintClick }) {
  return (
    <div className="landing">
      <section className="hero">
        <h1 className="hero-title">
          <span className="accent">Tweet</span>City
        </h1>
        <p className="hero-sub">
          Your Twitter presence becomes a generative city NFT on Mantle.<br />
          Grow your followers, evolve your city.
        </p>
        <button className="btn-primary btn-lg" onClick={onMintClick}>
          Mint Your City
        </button>
      </section>

      <section className="demo-cities">
        {DEMO_CITIES.map((c, i) => (
          <div key={i} className="demo-city">
            <CityRenderer city={c} width={280} height={160} />
            <div className="demo-meta">
              <div className="demo-name">{c.cityName}</div>
              <div className="demo-style">{c.style}</div>
            </div>
          </div>
        ))}
      </section>

      <section className="how-it-works">
        <h2>How It Works</h2>
        <div className="steps-row">
          <div className="how-step">
            <div className="how-num">1</div>
            <h3>Connect & Verify</h3>
            <p>Connect your wallet and prove Twitter ownership with a simple verification tweet.</p>
          </div>
          <div className="how-step">
            <div className="how-num">2</div>
            <h3>AI Generates City</h3>
            <p>Claude AI analyzes your tweets and assigns your city a unique style, name, and lore.</p>
          </div>
          <div className="how-step">
            <div className="how-num">3</div>
            <h3>NFT on Mantle</h3>
            <p>Your city is minted as a dynamic NFT. Gain followers, level up your city.</p>
          </div>
          <div className="how-step">
            <div className="how-num">4</div>
            <h3>Grow & Compete</h3>
            <p>Sync your metrics, climb the leaderboard, earn on-chain likes from other cities.</p>
          </div>
        </div>
      </section>

      <section className="levels-section">
        <h2>City Levels</h2>
        <div className="levels-row">
          {[
            { name: "Village", range: "< 100 followers", level: 1 },
            { name: "Town", range: "100–1K", level: 2 },
            { name: "City", range: "1K–10K", level: 3 },
            { name: "Metropolis", range: "10K–100K", level: 4 },
            { name: "Megacity", range: "100K+", level: 5 },
          ].map((l) => (
            <div key={l.level} className="level-pill">
              <span className="level-badge">Lvl {l.level}</span>
              <span>{l.name}</span>
              <span className="level-range">{l.range}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
