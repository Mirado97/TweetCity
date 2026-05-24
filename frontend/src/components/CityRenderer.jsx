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
  Cyberpunk:      { sky: "#0a0010", ground: "#2a0050", fog: "#0d001a", road: "#16213e", stars: true,  ambI: 0.5, dirI: 0.9 },
  "Eco-Futurism": { sky: "#001a0a", ground: "#2d6630", fog: "#004d1a", road: "#1a4020", stars: false, ambI: 0.9, dirI: 1.2 },
  Medieval:       { sky: "#1a0d00", ground: "#4a2800", fog: "#3d1f00", road: "#2a1500", stars: true,  ambI: 0.6, dirI: 1.0 },
  Brutalist:      { sky: "#111111", ground: "#333333", fog: "#222222", road: "#1a1a1a", stars: false, ambI: 0.7, dirI: 1.0 },
  Minimalist:     { sky: "#e8e8e8", ground: "#cccccc", fog: "#d8d8d8", road: "#aaaaaa", stars: false, ambI: 1.1, dirI: 1.0 },
  Baroque:        { sky: "#0a0014", ground: "#3d0060", fog: "#1e0028", road: "#22003a", stars: true,  ambI: 0.5, dirI: 0.9 },
  "Bio-Punk":     { sky: "#000d05", ground: "#1a3d1a", fog: "#001a0a", road: "#0d2a0d", stars: true,  ambI: 0.5, dirI: 0.8 },
};

function Ground({ size, color }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[size, size]} />
      <meshStandardMaterial color={color} roughness={0.85} />
    </mesh>
  );
}

// Box building — Cyberpunk, Brutalist, Minimalist, Baroque
function BoxBuilding({ pos, w, d, h, color, accent, emissiveI }) {
  return (
    <mesh position={[pos[0], h / 2, pos[1]]}>
      <boxGeometry args={[w, h, d]} />
      <meshStandardMaterial color={color} emissive={accent} emissiveIntensity={emissiveI} roughness={0.6} metalness={0.15} />
    </mesh>
  );
}

// Cylinder building — Eco-Futurism, Bio-Punk
function CylBuilding({ pos, r, h, color, accent }) {
  return (
    <mesh position={[pos[0], h / 2, pos[1]]}>
      <cylinderGeometry args={[r * 0.8, r, h, 8]} />
      <meshStandardMaterial color={color} emissive={accent} emissiveIntensity={0.05} roughness={0.5} />
    </mesh>
  );
}

// Tower with tapered top — Medieval
function MedievalBuilding({ pos, w, h, color, accent }) {
  return (
    <group position={[pos[0], 0, pos[1]]}>
      <mesh position={[0, h / 2, 0]}>
        <boxGeometry args={[w, h, w]} />
        <meshStandardMaterial color={color} roughness={0.9} />
      </mesh>
      <mesh position={[0, h + w * 0.4, 0]}>
        <coneGeometry args={[w * 0.6, w * 0.8, 4]} />
        <meshStandardMaterial color={accent} roughness={0.8} />
      </mesh>
    </group>
  );
}

function Road({ x, z, len, horiz, color }) {
  return (
    <mesh position={[x, 0.02, z]} rotation={[-Math.PI / 2, 0, horiz ? 0 : Math.PI / 2]}>
      <planeGeometry args={[len, 2]} />
      <meshStandardMaterial color={color} roughness={1} />
    </mesh>
  );
}

function Tree({ pos }) {
  return (
    <group position={pos}>
      <mesh position={[0, 0.7, 0]}>
        <cylinderGeometry args={[0.13, 0.2, 1.4, 6]} />
        <meshStandardMaterial color="#5a3800" roughness={1} />
      </mesh>
      <mesh position={[0, 2.1, 0]}>
        <sphereGeometry args={[0.65, 7, 6]} />
        <meshStandardMaterial color="#2d8a30" roughness={0.9} />
      </mesh>
    </group>
  );
}

function Lantern({ pos }) {
  return (
    <group position={pos}>
      <mesh position={[0, 1.5, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 3, 5]} />
        <meshStandardMaterial color="#555" roughness={0.8} />
      </mesh>
      <mesh position={[0, 3.1, 0]}>
        <sphereGeometry args={[0.18, 6, 6]} />
        <meshStandardMaterial color="#ffffcc" emissive="#ffffaa" emissiveIntensity={1.5} />
      </mesh>
    </group>
  );
}

function CityScene({ metrics, style, colorPalette, level, tokenId }) {
  const { followers = 0, tweetCount = 0, engagement = 0 } = metrics;
  const cfg = STYLE_CFG[style] || STYLE_CFG.Cyberpunk;
  const { primary, secondary, accent } = colorPalette;

  const isEco  = style === "Eco-Futurism";
  const isCyber = style === "Cyberpunk";
  const isMed  = style === "Medieval";
  const isBio  = style === "Bio-Punk";

  const data = useMemo(() => {
    const seed = (((tokenId | 0) * 9973) + (followers | 0)) >>> 0;
    const rng = mkRng(seed);

    const numBuildings = Math.max(10, Math.min(Math.floor(followers / 10), 150));
    const cols = Math.ceil(Math.sqrt(numBuildings)) + 2;
    const cellSize = isCyber ? 2.5 : 3.2;
    const groundSize = cols * cellSize + 12;

    // Shuffle grid cells
    const cells = [];
    for (let r = 0; r < cols; r++)
      for (let c = 0; c < cols; c++)
        cells.push([
          (c - cols / 2) * cellSize + (rng() - 0.5),
          (r - cols / 2) * cellSize + (rng() - 0.5),
        ]);
    for (let i = cells.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [cells[i], cells[j]] = [cells[j], cells[i]];
    }

    const minH = 0.8 + level * 0.5;
    const maxH = 2 + level * (isCyber ? 5 : isMed ? 3 : 2.5);

    const buildings = cells.slice(0, numBuildings).map((pos) => {
      const h = minH + rng() * (maxH - minH);
      const color = rng() > 0.4 ? primary : secondary;
      if (isEco || isBio) {
        return { type: "cyl", pos, r: 0.7 + rng() * 0.6, h, color, accent };
      }
      if (isMed) {
        return { type: "med", pos, w: 1.0 + rng() * 0.8, h: h * 0.7, color, accent };
      }
      const w = isCyber ? 0.8 + rng() * 0.8 : 1.2 + rng() * 1.4;
      const d = isCyber ? 0.8 + rng() * 0.8 : 1.2 + rng() * 1.4;
      const emissiveI = isCyber ? 0.2 + rng() * 0.3 : 0.04;
      return { type: "box", pos, w, d, h, color, accent, emissiveI };
    });

    // Roads
    const numRoads = Math.max(2, Math.min(Math.floor(tweetCount / 300) + 2, 6));
    const roads = [];
    for (let i = 0; i < numRoads; i++) {
      const t = (i / Math.max(numRoads - 1, 1) - 0.5) * (groundSize - 6);
      roads.push({ x: t, z: 0, len: groundSize, horiz: true });
      roads.push({ x: 0, z: t, len: groundSize, horiz: false });
    }

    // Trees
    const wantTrees = isEco || isBio || engagement > 0;
    const numTrees = wantTrees
      ? Math.min(Math.floor(engagement * 0.4) + (isEco ? 30 : isBio ? 15 : 8), 50)
      : 0;
    const treeRng = mkRng(seed + 1);
    const trees = Array.from({ length: numTrees }, () => [
      (treeRng() - 0.5) * (groundSize - 5),
      0,
      (treeRng() - 0.5) * (groundSize - 5),
    ]);

    // Lanterns — every style, sparse
    const numLanterns = Math.min(Math.floor(numBuildings * 0.3), 20);
    const lanternRng = mkRng(seed + 2);
    const lanterns = Array.from({ length: numLanterns }, () => [
      (lanternRng() - 0.5) * (groundSize - 4),
      0,
      (lanternRng() - 0.5) * (groundSize - 4),
    ]);

    return { buildings, roads, trees, lanterns, groundSize };
  }, [followers, tweetCount, engagement, tokenId, level, style, primary, secondary, accent]);

  return (
    <>
      <color attach="background" args={[cfg.sky]} />
      <fog attach="fog" args={[cfg.fog, 50, 120]} />

      <ambientLight intensity={cfg.ambI} />
      <directionalLight position={[15, 25, 10]} intensity={cfg.dirI} />
      <hemisphereLight args={[cfg.sky, cfg.ground, 0.6]} />
      {/* Colored point light in city center */}
      <pointLight position={[0, 8, 0]} color={accent} intensity={0.8} distance={40} />

      {cfg.stars && <Stars radius={80} depth={40} count={1000} factor={2} fade />}

      <Ground size={data.groundSize + 16} color={cfg.ground} />

      {data.roads.map((r, i) => (
        <Road key={i} {...r} color={cfg.road} />
      ))}

      {data.buildings.map((b, i) => {
        if (b.type === "cyl") return <CylBuilding key={i} {...b} />;
        if (b.type === "med") return <MedievalBuilding key={i} {...b} />;
        return <BoxBuilding key={i} {...b} />;
      })}

      {data.trees.map((pos, i) => <Tree key={i} pos={pos} />)}
      {data.lanterns.map((pos, i) => <Lantern key={i} pos={pos} />)}
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
        <Canvas camera={{ position: [18, 16, 18], fov: 50 }}>
          <Suspense fallback={null}>
            <CityScene {...sceneProps} />
            <OrbitControls enableZoom={false} enablePan={false} enableRotate={false} autoRotate autoRotateSpeed={0.8} />
          </Suspense>
        </Canvas>
        <div style={{
          position: "absolute", bottom: 10, right: 12,
          color: "rgba(255,255,255,0.55)", fontSize: 11, fontFamily: "monospace", pointerEvents: "none",
        }}>
          Click to explore ↗
        </div>
      </div>

      {open && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.92)", display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setOpen(false)}
        >
          <div
            style={{ width: "90vw", height: "85vh", borderRadius: 16, overflow: "hidden", position: "relative" }}
            onClick={(e) => e.stopPropagation()}
          >
            <Canvas camera={{ position: [20, 18, 20], fov: 45 }}>
              <Suspense fallback={null}>
                <CityScene {...sceneProps} />
                <OrbitControls
                  enablePan={false}
                  minDistance={5}
                  maxDistance={80}
                  maxPolarAngle={Math.PI / 2 - 0.05}
                  autoRotate
                  autoRotateSpeed={0.4}
                />
              </Suspense>
            </Canvas>
            <button
              onClick={() => setOpen(false)}
              style={{
                position: "absolute", top: 16, right: 16,
                background: "rgba(255,255,255,0.15)", border: "none", color: "white",
                width: 36, height: 36, borderRadius: "50%", cursor: "pointer",
                fontSize: 18, lineHeight: "36px", textAlign: "center",
              }}
            >✕</button>
          </div>
        </div>
      )}
    </>
  );
}
