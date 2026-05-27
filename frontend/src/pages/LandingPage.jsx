import CityRenderer, { LEVEL_NAMES, LEVEL_THRESHOLDS } from "../components/CityRenderer";

const LEVEL_RANGES = [
  "0–49", "50–249", "250–999", "1K–3K", "3K–10K",
  "10K–30K", "30K–100K", "100K–300K", "300K–1M", "1M+",
];

const LEVELS = LEVEL_NAMES.map((name, i) => ({
  name,
  level: i + 1,
  range: LEVEL_RANGES[i],
}));

const DEMO_CITIES = [
  { 
    level: 5, 
    style: "Cyberpunk", 
    colorPalette: { primary: "#2a0040", secondary: "#440066", accent: "#ff00ff" }, 
    followers: 150000, 
    cityName: "NeonVex Prime" 
  },
  { 
    level: 3, 
    style: "Eco-Futurism", 
    colorPalette: { primary: "#003320", secondary: "#005533", accent: "#00ff88" }, 
    followers: 5000, 
    cityName: "Verdania" 
  },
  { 
    level: 4, 
    style: "Medieval", 
    colorPalette: { primary: "#3d1f00", secondary: "#5c3300", accent: "#ffaa00" }, 
    followers: 42000, 
    cityName: "Ironhold" 
  },
];


export default function LandingPage({ onMintClick }) {
  return (
    <div className="landing fade-in">
      
      {/* Hero Section */}
      <section className="hero">
        <div className="hero-badge">
          <span>⚡</span>
          <span>Live on Mantle Network</span>
        </div>
        
        <h1 className="hero-title">
          <span className="accent">Tweet</span>City
        </h1>
        
        <p className="hero-sub">
          Your Twitter presence becomes a generative city NFT.<br />
          Grow your followers. Evolve your city. Compete with others.
        </p>
        
        <div className="hero-actions">
          <button className="btn btn-primary btn-lg" onClick={onMintClick}>
            <span>Mint Your City</span>
            <span>→</span>
          </button>
          <button 
            className="btn btn-secondary btn-lg" 
            onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}
          >
            Learn More
          </button>
        </div>
      </section>

      {/* Demo Cities */}
      <section className="section">
        <span className="section-label">Live Examples</span>
        <h2 className="section-title">Explore Generated Cities</h2>
        
        <div className="demo-grid stagger">
          {DEMO_CITIES.map((city, i) => (
            <div key={i} className="demo-card">
              <CityRenderer city={city} width={300} height={180} />
              <div className="demo-name">{city.cityName}</div>
              <div className="demo-style">{city.style} · Level {city.level}</div>
              <span className="demo-link">
                Explore <span>↗</span>
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section className="section" id="how-it-works">
        <span className="section-label">Process</span>
        <h2 className="section-title">How It Works</h2>
        
        <div className="steps-grid stagger">
          <div className="step-card">
            <div className="step-number">1</div>
            <div className="step-title">Connect & Verify</div>
            <div className="step-desc">Connect your wallet and prove Twitter ownership with a simple verification tweet.</div>
          </div>
          
          <div className="step-card">
            <div className="step-number">2</div>
            <div className="step-title">AI Generates City</div>
            <div className="step-desc">Claude AI analyzes your tweets and assigns your city a unique style, name, and lore.</div>
          </div>
          
          <div className="step-card">
            <div className="step-number">3</div>
            <div className="step-title">NFT on Mantle</div>
            <div className="step-desc">Your city is minted as a dynamic NFT. Gain followers, level up your city.</div>
          </div>
          
          <div className="step-card">
            <div className="step-number">4</div>
            <div className="step-title">Grow & Compete</div>
            <div className="step-desc">Sync your metrics, climb the leaderboard, earn on-chain likes from other cities.</div>
          </div>
        </div>
      </section>

      {/* City Levels */}
      <section className="section">
        <span className="section-label">Progression</span>
        <h2 className="section-title">City Levels</h2>
        
        <div className="levels-container">
          <div className="level-row stagger">
            {LEVELS.map((l, i) => (
              <>
                <div key={l.level} className={`level-item ${i === 0 ? 'first' : ''}`}>
                  <div className="level-circle">{l.level}</div>
                  <div className="level-name">{l.name}</div>
                  <div className="level-range">{l.range}</div>
                </div>
                {i < LEVELS.length - 1 && (
                  <div className="level-connector" key={`conn-${i}`} />
                )}
              </>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="cta-section section">
        <h2 className="section-title" style={{ fontSize: '2.2rem', marginBottom: 'var(--space-4)' }}>
          Ready to Build Your City?
        </h2>
        <p className="section-desc">
          Join thousands of Twitter users who turned their presence into NFT cities.
        </p>
        <div style={{ marginTop: 'var(--space-6)' }}>
          <button className="btn btn-primary btn-lg" onClick={onMintClick}>
            <span>Start Now</span>
            <span>→</span>
          </button>
        </div>
      </section>

    </div>
  );
}