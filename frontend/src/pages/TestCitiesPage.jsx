import CityRenderer from "../components/CityRenderer";

// Full spectrum: Ghost (10) → Mega (1M)
// Palettes use no green (green reserved for ground)
const TEST_ACCOUNTS = [
  {
    label: "Ghost", sub: "10 followers",
    city: { style: "Brutalist",
      colorPalette: { primary: "#666677", secondary: "#444455", accent: "#9999bb" },
      followers: 10, tweetCount: 3, following: 5, engagement: 0.0 },
    tokenId: 1,
  },
  {
    label: "Lurker", sub: "80 followers",
    city: { style: "Minimalist",
      colorPalette: { primary: "#aabbcc", secondary: "#8899aa", accent: "#ccddee" },
      followers: 80, tweetCount: 15, following: 120, engagement: 0.05 },
    tokenId: 2,
  },
  {
    label: "Micro", sub: "350 followers",
    city: { style: "Medieval",
      colorPalette: { primary: "#aa7722", secondary: "#774400", accent: "#ddaa44" },
      followers: 350, tweetCount: 90, following: 250, engagement: 0.1 },
    tokenId: 3,
  },
  {
    label: "Rising", sub: "900 followers",
    city: { style: "Cyberpunk",
      colorPalette: { primary: "#3355cc", secondary: "#112288", accent: "#44aaff" },
      followers: 900, tweetCount: 280, following: 600, engagement: 0.25 },
    tokenId: 4,
  },
  {
    label: "Active", sub: "2 500 followers",
    city: { style: "Bio-Punk",
      colorPalette: { primary: "#cc5500", secondary: "#993300", accent: "#ff8833" },
      followers: 2500, tweetCount: 700, following: 1200, engagement: 0.6 },
    tokenId: 5,
  },
  {
    label: "Creator", sub: "6 000 followers",
    city: { style: "Baroque",
      colorPalette: { primary: "#bb8800", secondary: "#886600", accent: "#ffcc22" },
      followers: 6000, tweetCount: 1500, following: 800, engagement: 1.4 },
    tokenId: 6,
  },
  {
    label: "Influencer", sub: "18 000 followers",
    city: { style: "Cyberpunk",
      colorPalette: { primary: "#cc0088", secondary: "#880055", accent: "#ff44cc" },
      followers: 18000, tweetCount: 4000, following: 2000, engagement: 2.2 },
    tokenId: 7,
  },
  {
    label: "Big Account", sub: "60 000 followers",
    city: { style: "Minimalist",
      colorPalette: { primary: "#2244cc", secondary: "#112299", accent: "#6688ff" },
      followers: 60000, tweetCount: 9000, following: 3000, engagement: 3.8 },
    tokenId: 8,
  },
  {
    label: "Star", sub: "200 000 followers",
    city: { style: "Baroque",
      colorPalette: { primary: "#cc6600", secondary: "#994400", accent: "#ffaa00" },
      followers: 200000, tweetCount: 16000, following: 500, engagement: 5.2 },
    tokenId: 9,
  },
  {
    label: "Mega", sub: "1 000 000 followers",
    city: { style: "Brutalist",
      colorPalette: { primary: "#555566", secondary: "#333344", accent: "#8888bb" },
      followers: 1000000, tweetCount: 28000, following: 800, engagement: 7.0 },
    tokenId: 10,
  },
  // Edge cases
  {
    label: "Tweet Machine", sub: "8k followers, 12k tweets, low eng",
    city: { style: "Brutalist",
      colorPalette: { primary: "#556677", secondary: "#334455", accent: "#7799aa" },
      followers: 8000, tweetCount: 12000, following: 9000, engagement: 0.15 },
    tokenId: 11,
  },
  {
    label: "Viral Ghost", sub: "3k followers, 80 tweets, 4.5% eng",
    city: { style: "Medieval",
      colorPalette: { primary: "#884400", secondary: "#552200", accent: "#cc8833" },
      followers: 3000, tweetCount: 80, following: 40, engagement: 4.5 },
    tokenId: 12,
  },
];

export default function TestCitiesPage() {
  return (
    <div style={{ padding: "24px 32px", background: "#111", minHeight: "100vh" }}>
      <h1 style={{ color: "#fff", fontFamily: "monospace", marginBottom: 4 }}>City Scale Test</h1>
      <p style={{ color: "#666", fontFamily: "monospace", fontSize: 12, marginBottom: 32 }}>
        followers→size &nbsp;|&nbsp; tweets→density &nbsp;|&nbsp; engagement→height &nbsp;|&nbsp; following→trees &nbsp;|&nbsp; ratio→prestige
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 32 }}>
        {TEST_ACCOUNTS.map((acc) => (
          <div key={acc.tokenId} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontFamily: "monospace" }}>
              <span style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{acc.label}</span>
              <span style={{ color: "#888", fontSize: 12, marginLeft: 8 }}>{acc.sub}</span>
              <span style={{ color: "#555", fontSize: 11, marginLeft: 8 }}>[{acc.city.style}]</span>
            </div>

            <CityRenderer city={acc.city} tokenId={acc.tokenId} />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1px 14px", fontFamily: "monospace", fontSize: 11, color: "#777", width: 600 }}>
              <span>followers: <b style={{ color: "#ccc" }}>{acc.city.followers.toLocaleString()}</b></span>
              <span>tweets: <b style={{ color: "#ccc" }}>{acc.city.tweetCount.toLocaleString()}</b></span>
              <span>engagement: <b style={{ color: "#ccc" }}>{acc.city.engagement}%</b></span>
              <span>following: <b style={{ color: "#ccc" }}>{acc.city.following.toLocaleString()}</b></span>
              <span>ratio: <b style={{ color: "#ccc" }}>{acc.city.following > 0 ? (acc.city.followers / acc.city.following).toFixed(1) : "∞"}x</b></span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
