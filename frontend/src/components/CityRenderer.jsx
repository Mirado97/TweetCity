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
  Cyberpunk:      { sky: "#04000f", ground: "#1a0035", fog: "#08001a", road: "#0d0d2e", stars: true,  ambI: 0.5, dirI: 1.0 },
  "Eco-Futurism": { sky: "#001a05", ground: "#3a8a3a", fog: "#004d15", road: "#2a5a2a", stars: false, ambI: 1.0, dirI: 1.3 },
  Medieval:       { sky: "#1a0d00", ground: "#5a3200", fog: "#3d1f00", road: "#3a2000", stars: true,  ambI: 0.6, dirI: 1.0 },
  Brutalist:      { sky: "#111",    ground: "#3a3a3a", fog: "#222",    road: "#222",    stars: false, ambI: 0.7, dirI: 1.0 },
  Minimalist:     { sky: "#eeeeee", ground: "#cccccc", fog: "#dddddd", road: "#aaaaaa", stars: false, ambI: 1.2, dirI: 1.0 },
  Baroque:        { sky: "#08000f", ground: "#3d0060", fog: "#1a001f", road: "#200040", stars: true,  ambI: 0.5, dirI: 1.0 },
  "Bio-Punk":     { sky: "#000d03", ground: "#1f4d1f", fog: "#001a08", road: "#0f2a0f", stars: true,  ambI: 0.5, dirI: 0.9 },
};

function Ground({ size, color }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[size, size]} />
      <meshStandardMaterial color={color} roughness={0.85} />
    </mesh>
  );
}

// Proper skyscraper: wide base body + narrower crown + optional antenna
function Skyscraper({ pos, w, d, h, color, crownColor, accentColor, emissiveI = 0.05 }) {
  const crownH = h * 0.18;
  const crownW = w * 0.6;
  const crownD = d * 0.6;
  const hasAntenna = h > 8;

  return (
    <group position={[pos[0], 0, pos[1]]}>
      {/* Main body */}
      <mesh position={[0, h / 2, 0]}>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={color} emissive={accentColor} emissiveIntensity={emissiveI} roughness={0.6} metalness={0.2} />
      </mesh>
      {/* Crown setback */}
      <mesh position={[0, h + crownH / 2, 0]}>
        <boxGeometry args={[crownW, crownH, crownD]} />
        <meshStandardMaterial color={crownColor} emissive={accentColor} emissiveIntensity={emissiveI * 1.5} roughness={0.5} metalness={0.3} />
      </mesh>
      {/* Antenna */}
      {hasAntenna && (
        <mesh position={[0, h + crownH + 0.8, 0]}>
          <cylinderGeometry args={[0.04, 0.04, 1.6, 4]} />
          <meshStandardMaterial color={accentColor} emissive={accentColor} emissiveIntensity={1} />
        </mesh>
      )}
    </group>
  );
}

// Eco / Bio: round tower
function RoundTower({ pos, r, h, color, accentColor }) {
  return (
    <group position={[pos[0], 0, pos[1]]}>
      <mesh position={[0, h / 2, 0]}>
        <cylinderGeometry args={[r * 0.85, r, h, 10]} />
        <meshStandardMaterial color={color} emissive={accentColor} emissiveIntensity={0.04} roughness={0.5} />
      </mesh>
      {/* dome cap */}
      <mesh position={[0, h, 0]}>
        <sphereGeometry args={[r * 0.85, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={accentColor} roughness={0.4} />
      </mesh>
    </group>
  );
}

// Medieval: stone tower + conical roof
function MedievalTower({ pos, w, h, color, roofColor }) {
  return (
    <group position={[pos[0], 0, pos[1]]}>
      <mesh position={[0, h / 2, 0]}>
        <boxGeometry args={[w, h, w]} />
        <meshStandardMaterial color={color} roughness={0.95} />
      </mesh>
      <mesh position={[0, h + w * 0.5, 0]}>
        <coneGeometry args={[w * 0.72, w, 4]} />
        <meshStandardMaterial color={roofColor} roughness={0.8} />
      </mesh>
    </group>
  );
}

function Road({ x, z, len, horiz, color }) {
  return (
    <mesh position={[x, 0.02, z]} rotation={[-Math.PI / 2, 0, horiz ? 0 : Math.PI / 2]}>
      <planeGeometry args={[len, 2.5]} />
      <meshStandardMaterial color={color} roughness={1} />
    </mesh>
  );
}

function Tree({ pos, scale = 1 }) {
  return (
    <group position={pos} scale={scale}>
      <mesh position={[0, 0.9, 0]}>
        <cylinderGeometry args={[0.18, 0.28, 1.8, 6]} />
        <meshStandardMaterial color="#5a3800" roughness={1} />
      </mesh>
      <mesh position={[0, 2.8, 0]}>
        <sphereGeometry args={[0.9, 7, 6]} />
        <meshStandardMaterial color="#2d8a30" roughness={0.9} />
      </mesh>
    </group>
  );
}

function Lantern({ pos }) {
  return (
    <group position={pos}>
      <mesh position={[0, 2, 0]}>
        <cylinderGeometry args={[0.06, 0.06, 4, 5]} />
        <meshStandardMaterial color="#666" roughness={0.8} />
      </mesh>
      <mesh position={[0, 4.1, 0]}>
        <sphereGeometry args={[0.22, 6, 6]} />
        <meshStandardMaterial color="#ffffdd" emissive="#ffffaa" emissiveIntensity={2} />
      </mesh>
    </group>
  );
}

function CityScene({ metrics, style, colorPalette, level, tokenId }) {
  const { followers = 0, tweetCount = 0, engagement = 0 } = metrics;
  const cfg = STYLE_CFG[style] || STYLE_CFG.Cyberpunk;
  const { primary, secondary, accent } = colorPalette;

  const isEco  = style === "Eco-Futurism";
  const isBio  = style === "Bio-Punk";
  const isMed  = style === "Medieval";
  const isCyber = style === "Cyberpunk";

  const data = useMemo(() => {
    const seed = (((tokenId | 0) * 9973) + (followers | 0)) >>> 0;
    const rng = mkRng(seed);

    const numBuildings = Math.max(10, Math.min(Math.floor(followers / 10), 120));
    const cols = Math.ceil(Math.sqrt(numBuildings)) + 2;
    const cellSize = 5.5;
    const groundSize = cols * cellSize + 14;

    // Grid cells with slight jitter
    const cells = [];
    for (let r = 0; r < cols; r++)
      for (let c = 0; c < cols; c++)
        cells.push([
          (c - cols / 2) * cellSize + (rng() - 0.5) * 1.2,
          (r - cols / 2) * cellSize + (rng() - 0.5) * 1.2,
        ]);
    for (let i = cells.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [cells[i], cells[j]] = [cells[j], cells[i]];
    }

    // Building heights based on level
    const minH = 3 + level * 1.5;
    const maxH = 6 + level * (isCyber ? 7 : isMed ? 4 : 5);

    const buildings = cells.slice(0, numBuildings).map((pos) => {
      const h = minH + rng() * (maxH - minH);
      const color = rng() > 0.45 ? primary : secondary;

      if (isEco || isBio) {
        return { type: "round", pos, r: 1.2 + rng() * 0.8, h, color, accentColor: accent };
      }
      if (isMed) {
        const w = 2.0 + rng() * 1.5;
        return { type: "med", pos, w, h: h * 0.75, color, roofColor: accent };
      }
      // Box skyscraper (Cyberpunk, Baroque, Brutalist, Minimalist)
      const w = isCyber ? 1.8 + rng() * 1.5 : 2.5 + rng() * 2.0;
      const d = isCyber ? 1.8 + rng() * 1.5 : 2.5 + rng() * 2.0;
      const crownColor = rng() > 0.5 ? secondary : primary;
      const emissiveI = isCyber ? 0.25 + rng() * 0.35 : 0.05;
      return { type: "sky", pos, w, d, h, color, crownColor, accentColor: accent, emissiveI };
    });

    // Roads
    const numRoads = Math.max(2, Math.min(Math.floor(tweetCount / 300) + 2, 7));
    const roads = [];
    for (let i = 0; i < numRoads; i++) {
      const t = (i / Math.max(numRoads - 1, 1) - 0.5) * (groundSize - 8);
      roads.push({ x: t, z: 0, len: groundSize, horiz: true });
      roads.push({ x: 0, z: t, len: groundSize, horiz: false });
    }

    // Trees
    const wantTrees = isEco || isBio || engagement > 0;
    const numTrees = wantTrees
      ? Math.min(Math.floor(engagement * 0.5) + (isEco ? 40 : isBio ? 20 : 10), 60)
      : 0;
    const treeRng = mkRng(seed + 1);
    const trees = Array.from({ length: numTrees }, () => ({
      pos: [(treeRng() - 0.5) * (groundSize - 6), 0, (treeRng() - 0.5) * (groundSize - 6)],
      scale: 0.6 + treeRng() * 0.8,
    }));

    // Lanterns
    const lanternRng = mkRng(seed + 2);
    const numLanterns = Math.min(numBuildings, 25);
    const lanterns = Array.from({ length: numLanterns }, () => [
      (lanternRng() - 0.5) * (groundSize - 5),
      0,
      (lanternRng() - 0.5) * (groundSize - 5),
    ]);

    return { buildings, roads, trees, lanterns, groundSize };
  }, [followers, tweetCount, engagement, tokenId, level, style, primary, secondary, accent]);

  return (
    <>
      <color attach="background" args={[cfg.sky]} />
      <fog attach="fog" args={[cfg.fog, 60, 140]} />

      <ambientLight intensity={cfg.ambI} />
      <directionalLight position={[20, 30, 15]} intensity={cfg.dirI} />
      <directionalLight position={[-10, 15, -10]} intensity={cfg.dirI * 0.4} color={accent} />
      <hemisphereLight args={[cfg.sky, cfg.ground, 0.7]} />
      <pointLight position={[0, 10, 0]} color={accent} intensity={1.2} distance={50} decay={1.5} />

      {cfg.stars && <Stars radius={100} depth={50} count={1000} factor={2} fade />}

      <Ground size={data.groundSize + 20} color={cfg.ground} />

      {data.roads.map((r, i) => <Road key={i} {...r} color={cfg.road} />)}

      {data.buildings.map((b, i) => {
        if (b.type === "round") return <RoundTower key={i} {...b} />;
        if (b.type === "med")   return <MedievalTower key={i} {...b} />;
        return <Skyscraper key={i} {...b} />;
      })}

      {data.trees.map((t, i) => <Tree key={i} pos={t.pos} scale={t.scale} />)}
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
        <Canvas camera={{ position: [22, 18, 22], fov: 50 }}>
          <Suspense fallback={null}>
            <CityScene {...sceneProps} />
            <OrbitControls enableZoom={false} enablePan={false} enableRotate={false} autoRotate autoRotateSpeed={0.7} />
          </Suspense>
        </Canvas>
        <div style={{ position: "absolute", bottom: 10, right: 12, color: "rgba(255,255,255,0.55)", fontSize: 11, fontFamily: "monospace", pointerEvents: "none" }}>
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
            <Canvas camera={{ position: [25, 20, 25], fov: 45 }}>
              <Suspense fallback={null}>
                <CityScene {...sceneProps} />
                <OrbitControls enablePan={false} minDistance={5} maxDistance={100} maxPolarAngle={Math.PI / 2 - 0.05} autoRotate autoRotateSpeed={0.4} />
              </Suspense>
            </Canvas>
            <button
              onClick={() => setOpen(false)}
              style={{ position: "absolute", top: 16, right: 16, background: "rgba(255,255,255,0.15)", border: "none", color: "white", width: 36, height: 36, borderRadius: "50%", cursor: "pointer", fontSize: 18, lineHeight: "36px", textAlign: "center" }}
            >✕</button>
          </div>
        </div>
      )}
    </>
  );
}
