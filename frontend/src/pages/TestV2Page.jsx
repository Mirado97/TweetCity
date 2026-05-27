import CityRendererV2 from "../components/CityRendererV2";

const TEST_ACCOUNTS = [
  {
    label: "Hamlet", sub: "10 followers",
    city: { followers: 10, tweetCount: 3, following: 5, engagement: 0.0 },
    tokenId: 1,
  },
  {
    label: "Village", sub: "80 followers",
    city: { followers: 80, tweetCount: 15, following: 120, engagement: 0.05 },
    tokenId: 2,
  },
  {
    label: "Borough", sub: "350 followers",
    city: { followers: 350, tweetCount: 90, following: 250, engagement: 0.1 },
    tokenId: 3,
  },
  {
    label: "Town", sub: "900 followers",
    city: { followers: 900, tweetCount: 280, following: 600, engagement: 0.25 },
    tokenId: 4,
  },
  {
    label: "Township", sub: "2 500 followers",
    city: { followers: 2500, tweetCount: 700, following: 1200, engagement: 0.6 },
    tokenId: 5,
  },
  {
    label: "City", sub: "6 000 followers",
    city: { followers: 6000, tweetCount: 1500, following: 800, engagement: 1.4 },
    tokenId: 6,
  },
  {
    label: "Metropolis", sub: "18 000 followers",
    city: { followers: 18000, tweetCount: 4000, following: 2000, engagement: 2.2 },
    tokenId: 7,
  },
  {
    label: "Megalopolis", sub: "60 000 followers",
    city: { followers: 60000, tweetCount: 9000, following: 3000, engagement: 3.8 },
    tokenId: 8,
  },
];

export default function TestV2Page() {
  return (
    <div style={{ padding: "24px 32px", background: "#111", minHeight: "100vh" }}>
      <h1 style={{ color: "#fff", fontFamily: "monospace", marginBottom: 4 }}>City V2 — Kenney Models Only</h1>
      <p style={{ color: "#666", fontFamily: "monospace", fontSize: 12, marginBottom: 32 }}>
        Pure GLB tile grid · no procedural geometry · commercial / industrial / suburban zones
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 32 }}>
        {TEST_ACCOUNTS.map((acc) => (
          <div key={acc.tokenId} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontFamily: "monospace" }}>
              <span style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{acc.label}</span>
              <span style={{ color: "#888", fontSize: 12, marginLeft: 8 }}>{acc.sub}</span>
            </div>
            <CityRendererV2 city={acc.city} tokenId={acc.tokenId} />
            <div style={{ fontFamily: "monospace", fontSize: 11, color: "#555" }}>
              followers: <b style={{ color: "#ccc" }}>{acc.city.followers.toLocaleString()}</b>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
