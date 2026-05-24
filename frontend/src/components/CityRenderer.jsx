import { useMemo, useState, Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Stars } from "@react-three/drei";

function mkRng(seed) {
  let s = ((seed >>> 0) || 1337);
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

const STYLE_CFG = {
  Cyberpunk:      { sky: "#0a0010", ground: "#110022", fog: "#0d001a", stars: true,  ambI: 0.25, dirI: 0.6 },
  "Eco-Futurism": { sky: "#001a0a", ground: "#1a3020", fog: "#002d10", stars: false, ambI: 0.7,  dirI: 1.0 },
  Medieval:       { sky: "#1a0d00", ground: "#2d1800", fog: "#3d1f00", stars: true,  ambI: 0.4,  dirI: 0.8 },
  Brutalist:      { sky: "#111111", ground: "#1a1a1a", fog: "#222222", stars: false, ambI: 0.5,  dirI: 0.9 },
  Minimalist:     { sky: "#d8d8d8", ground: "#b0b0b0", fog: "#cccccc", stars: false, ambI: 0.9,  dirI: 1.0 },
  Baroque:        { sky: "#0a0014", ground: "#14001e", fog: "#1e0028", stars: true,  ambI: 0.3,  dirI: 0.7 },
  "Bio-Punk":     { sky: "#000d05", ground: "#001208", fog: "#001a0a", stars: true,  ambI: 0.3,  dirI: 0.6 },
};

function Ground({ size, color }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[size, size]} />
      <meshStandardMaterial color={color} roughness={0.9} />
    </mesh>
  );
}

function Building({ pos, w, d, h, color, accent, emissiveI }) {
  return (
    <mesh position={[pos[0], h / 2, pos[1]]}>
      <boxGeometry args={[w, h, d]} />
      <meshStandardMaterial
        color={color}
        emissive={accent}
        emissiveIntensity={emissiveI}
        roughness={0.7}
        metalness={0.1}
      />
    </mesh>
  );
}

function Road({ x, z, len, horiz, color }) {
  return (
    <mesh position={[x, 0.01, z]} rotation={[-Math.PI / 2, 0, horiz ? 0 : Math.PI / 2]}>
      <planeGeometry args={[len, 1.8]} />
      <meshStandardMaterial color={color} roughness={1} />
    </mesh>
  );
}

function Tree({ pos }) {
  return (
    <group position={pos}>
      <mesh position={[0, 0.6, 0]}>
        <cylinderGeometry args={[0.12, 0.18, 1.2, 6]} />
        <meshStandardMaterial color="#5a3800" roughness={1} />
      </mesh>
      <mesh position={[0, 1.8, 0]}>
        <sphereGeometry args={[0.55, 7, 7]} />
        <meshStandardMaterial color="#2d7a2d" roughness={0.9} />
      </mesh>
    </group>
  );
}

function CityScene({ metrics, style, colorPalette, level, tokenId }) {
  const { followers = 0, tweetCount = 0, engagement = 0 } = metrics;
  const cfg = STYLE_CFG[style] || STYLE_CFG.Cyberpunk;
  const { primary, secondary, accent } = colorPalette;

  const data = useMemo(() => {
    const seed = (((tokenId | 0) * 9973) + (followers | 0)) >>> 0;
    const rng = mkRng(seed);

    const numBuildings = Math.max(8, Math.min(Math.floor(followers / 10), 150));
    const cols = Math.ceil(Math.sqrt(numBuildings)) + 2;
    const cellSize = 3;
    const groundSize = cols * cellSize + 10;

    const cells = [];
    for (let r = 0; r < cols; r++) {
      for (let c = 0; c < cols; c++) {
        cells.push([
          (c - cols / 2) * cellSize + (rng() - 0.5) * 0.8,
          (r - cols / 2) * cellSize + (rng() - 0.5) * 0.8,
        ]);
      }
    }
    for (let i = cells.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [cells[i], cells[j]] = [cells[j], cells[i]];
    }

    const isCyber = style === "Cyberpunk";
    const isEco = style === "Eco-Futurism";
    const minH = 0.5 + level * 0.4;
    const maxH = 1.5 + level * (isCyber ? 4 : 2.5);

    const buildings = cells.slice(0, numBuildings).map((pos) => {
      const h = minH + rng() * (maxH - minH);
      const w = isCyber ? 0.7 + rng() * 0.7 : 1.0 + rng() * 1.2;
      const d = isCyber ? 0.7 + rng() * 0.7 : 1.0 + rng() * 1.2;
      const color = rng() > 0.35 ? primary : secondary;
      const emissiveI = isCyber ? 0.15 + rng() * 0.25 : 0.03;
      return { pos, w, d, h, color, accent, emissiveI };
    });

    const numRoads = Math.max(2, Math.min(Math.floor(tweetCount / 300) + 2, 6));
    const roadColor = isCyber ? "#1a1a2e" : isEco ? "#2a3d2a" : "#2a2a2a";
    const roads = [];
    for (let i = 0; i < numRoads; i++) {
      const t = (i / Math.max(numRoads - 1, 1) - 0.5) * (groundSize - 4);
      roads.push({ x: t, z: 0, len: groundSize, horiz: true, color: roadColor });
      roads.push({ x: 0, z: t, len: groundSize, horiz: false, color: roadColor });
    }

    const wantTrees = isEco || engagement > 0;
    const numTrees = wantTrees
      ? Math.min(Math.floor(engagement * 0.3) + (isEco ? 25 : 5), 40)
      : 0;
    const treeRng = mkRng(seed + 1);
    const trees = Array.from({ length: numTrees }, () => [
      (treeRng() - 0.5) * (groundSize - 4),
      0,
      (treeRng() - 0.5) * (groundSize - 4),
    ]);

    return { buildings, roads, trees, groundSize };
  }, [followers, tweetCount, engagement, tokenId, level, style, primary, secondary, accent]);

  return (
    <>
      <color attach="background" args={[cfg.sky]} />
      <fog attach="fog" args={[cfg.fog, 40, 90]} />
      <ambientLight intensity={cfg.ambI} />
      <directionalLight position={[15, 25, 10]} intensity={cfg.dirI} />
      <hemisphereLight args={[cfg.sky, cfg.ground, 0.4]} />
      {cfg.stars && <Stars radius={60} depth={30} count={800} factor={2} fade />}
      <Ground size={data.groundSize + 12} color={cfg.ground} />
      {data.roads.map((r, i) => <Road key={i} {...r} />)}
      {data.buildings.map((b, i) => <Building key={i} {...b} />)}
      {data.trees.map((pos, i) => <Tree key={i} pos={pos} />)}
    </>
  );
}

export default function CityRenderer({ city, tokenId }) {
  const [open, setOpen] = useState(false);

  const {
    level = 1,
    style = "Cyberpunk",
    colorPalette = { primary: "#334466", secondary: "#223355", accent: "#ff00ff" },
    followers = 0,
    tweetCount = 0,
    following = 0,
    engagement = 0,
  } = city || {};

  const metrics = { followers, tweetCount, following, engagement };
  const sceneProps = { metrics, style, colorPalette, level, tokenId: tokenId || 0 };

  return (
    <>
      <div
        style={{ width: 600, height: 320, borderRadius: 12, overflow: "hidden", cursor: "pointer", position: "relative" }}
        onClick={() => setOpen(true)}
      >
        <Canvas camera={{ position: [20, 18, 20], fov: 50 }}>
          <Suspense fallback={null}>
            <CityScene {...sceneProps} />
            <OrbitControls
              enableZoom={false}
              enablePan={false}
              enableRotate={false}
              autoRotate
              autoRotateSpeed={0.8}
            />
          </Suspense>
        </Canvas>
        <div style={{
          position: "absolute", bottom: 10, right: 12,
          color: "rgba(255,255,255,0.55)", fontSize: 11,
          fontFamily: "monospace", pointerEvents: "none",
        }}>
          Click to explore ↗
        </div>
      </div>

      {open && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 1000,
            background: "rgba(0,0,0,0.92)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onClick={() => setOpen(false)}
        >
          <div
            style={{ width: "90vw", height: "85vh", borderRadius: 16, overflow: "hidden", position: "relative" }}
            onClick={(e) => e.stopPropagation()}
          >
            <Canvas camera={{ position: [22, 20, 22], fov: 45 }}>
              <Suspense fallback={null}>
                <CityScene {...sceneProps} />
                <OrbitControls
                  enablePan={false}
                  minDistance={6}
                  maxDistance={70}
                  maxPolarAngle={Math.PI / 2 - 0.05}
                  autoRotate
                  autoRotateSpeed={0.5}
                />
              </Suspense>
            </Canvas>
            <button
              onClick={() => setOpen(false)}
              style={{
                position: "absolute", top: 16, right: 16,
                background: "rgba(255,255,255,0.15)", border: "none",
                color: "white", width: 36, height: 36, borderRadius: "50%",
                cursor: "pointer", fontSize: 18, lineHeight: "36px", textAlign: "center",
              }}
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </>
  );
}
