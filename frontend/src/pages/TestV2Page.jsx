import CityRendererV2 from "../components/CityRendererV2";

// 10 уровней по LEVEL_THRESHOLDS: [0,50,250,1000,3000,10000,30000,100000,300000,1000000]
const TEST_ACCOUNTS = [
  { label: "Hamlet",       sub: "25 followers",         city: { followers: 25,      tweetCount: 3,     following: 10,   engagement: 0.0  }, tokenId: 1 },
  { label: "Village",      sub: "120 followers",        city: { followers: 120,     tweetCount: 20,    following: 80,   engagement: 0.05 }, tokenId: 2 },
  { label: "Borough",      sub: "500 followers",        city: { followers: 500,     tweetCount: 80,    following: 200,  engagement: 0.1  }, tokenId: 3 },
  { label: "Town",         sub: "2 000 followers",      city: { followers: 2000,    tweetCount: 400,   following: 600,  engagement: 0.3  }, tokenId: 4 },
  { label: "Township",     sub: "6 000 followers",      city: { followers: 6000,    tweetCount: 1200,  following: 1000, engagement: 0.8  }, tokenId: 5 },
  { label: "City",         sub: "18 000 followers",     city: { followers: 18000,   tweetCount: 3500,  following: 2000, engagement: 1.5  }, tokenId: 6 },
  { label: "Metropolis",   sub: "60 000 followers",     city: { followers: 60000,   tweetCount: 9000,  following: 3000, engagement: 2.5  }, tokenId: 7 },
  { label: "Megalopolis",  sub: "180 000 followers",    city: { followers: 180000,  tweetCount: 20000, following: 5000, engagement: 4.0  }, tokenId: 8 },
  { label: "Megacity",     sub: "600 000 followers",    city: { followers: 600000,  tweetCount: 50000, following: 8000, engagement: 6.0  }, tokenId: 9 },
  { label: "World Capital",sub: "2 000 000 followers",  city: { followers: 2000000, tweetCount: 100000,following: 10000,engagement: 10.0 }, tokenId: 10 },
];

export default function TestV2Page() {
  return (
    <div style={{ padding: "24px 32px", background: "#111", minHeight: "100vh" }}>
      <h1 style={{ color: "#fff", fontFamily: "monospace", marginBottom: 4 }}>City V2 — All 10 Levels</h1>
      <p style={{ color: "#666", fontFamily: "monospace", fontSize: 12, marginBottom: 32 }}>
        Hamlet → World Capital · Kenney GLB tiles · commercial / industrial / suburban zones
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 32 }}>
        {TEST_ACCOUNTS.map((acc) => (
          <div key={acc.tokenId} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontFamily: "monospace" }}>
              <span style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>Lv{acc.tokenId} · {acc.label}</span>
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
