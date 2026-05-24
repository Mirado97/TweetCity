import { useMemo, useState, Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Stars } from "@react-three/drei";

function mkRng(seed) {
  let s = ((seed >>> 0) || 1337);
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 0xffffffff; };
}

// Blend two hex colors: t=0 → colorA, t=1 → colorB
function blendHex(a, b, t) {
  const parse = h => [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];
  const [ar,ag,ab] = parse(a); const [br,bg,bb] = parse(b);
  const r = Math.round(ar + (br-ar)*t), g = Math.round(ag + (bg-ag)*t), bv = Math.round(ab + (bb-ab)*t);
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${bv.toString(16).padStart(2,'0')}`;
}

const STYLE_CFG = {
  Cyberpunk:      { sky: "#04000f", ground: "#2a0050", road: "#0d0d2e", park: "#0d1a0d", stars: true,  ambI: 0.9, dirI: 1.0, winEmI: 0.5 },
  "Eco-Futurism": { sky: "#001a05", ground: "#44aa44", road: "#3a4a3a", park: "#33aa33", stars: false, ambI: 1.1, dirI: 1.3, winEmI: 0.1 },
  Medieval:       { sky: "#180a00", ground: "#7a5000", road: "#2a1a00", park: "#3a6a00", stars: true,  ambI: 1.0, dirI: 1.0, winEmI: 0.4 },
  Brutalist:      { sky: "#111",    ground: "#3a3a3a", road: "#1a1a1a", park: "#2a3a2a", stars: false, ambI: 1.0, dirI: 1.0, winEmI: 0.1 },
  Minimalist:     { sky: "#e0e8f0", ground: "#c0ccd8", road: "#8899aa", park: "#88aa88", stars: false, ambI: 1.2, dirI: 1.1, winEmI: 0.05 },
  Baroque:        { sky: "#080010", ground: "#500070", road: "#18002a", park: "#200040", stars: true,  ambI: 0.9, dirI: 1.0, winEmI: 0.4 },
  "Bio-Punk":     { sky: "#000d03", ground: "#3a7a28", road: "#1a2a1a", park: "#2a6a20", stars: true,  ambI: 1.0, dirI: 0.9, winEmI: 0.3 },
};

const BLOCK = 16;   // city block size
const ROAD  = 4;    // road width
const STEP  = BLOCK + ROAD;

// Ground plane
function Ground({ size, color }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
      <planeGeometry args={[size, size]} />
      <meshStandardMaterial color={color} roughness={0.9} />
    </mesh>
  );
}

// Road strip
function Road({ x, z, len, horiz, color }) {
  return (
    <mesh position={[x, 0.01, z]} rotation={[-Math.PI / 2, 0, horiz ? 0 : Math.PI / 2]}>
      <planeGeometry args={[len, ROAD]} />
      <meshStandardMaterial color={color} roughness={1} />
    </mesh>
  );
}

// Building with window strips — proper skyscraper look
function Building({ pos, w, d, h, color, winColor, accent, winEmI, style, prestige = 0.25 }) {
  const floors = Math.max(2, Math.floor(h / 2.2));
  const floorH = h / floors;

  return (
    <group position={[pos[0], 0, pos[1]]}>
      {/* Main body */}
      <mesh position={[0, h / 2, 0]}>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={color} roughness={0.55} metalness={prestige} />
      </mesh>
      {/* Window bands every floor */}
      {Array.from({ length: floors - 1 }, (_, i) => {
        const y = floorH * (i + 1);
        return (
          <mesh key={i} position={[0, y, 0]}>
            <boxGeometry args={[w + 0.04, 0.18, d + 0.04]} />
            <meshStandardMaterial color={winColor} emissive={accent} emissiveIntensity={winEmI} roughness={0.3} metalness={0.5} transparent opacity={0.85} />
          </mesh>
        );
      })}
      {/* Crown */}
      <mesh position={[0, h + 0.6, 0]}>
        <boxGeometry args={[w * 0.65, 1.2, d * 0.65]} />
        <meshStandardMaterial color={winColor} roughness={0.4} metalness={0.4} />
      </mesh>
    </group>
  );
}

// Round eco-tower with dome
function EcoTower({ pos, r, h, color, accent }) {
  const floors = Math.max(2, Math.floor(h / 2));
  return (
    <group position={[pos[0], 0, pos[1]]}>
      <mesh position={[0, h / 2, 0]}>
        <cylinderGeometry args={[r * 0.88, r, h, 10]} />
        <meshStandardMaterial color={color} roughness={0.5} />
      </mesh>
      {Array.from({ length: floors - 1 }, (_, i) => (
        <mesh key={i} position={[0, (h / floors) * (i + 1), 0]}>
          <cylinderGeometry args={[r * 0.9, r * 0.9, 0.35, 10]} />
          <meshStandardMaterial color="#88cc88" emissive={accent} emissiveIntensity={0.08} transparent opacity={0.8} />
        </mesh>
      ))}
      <mesh position={[0, h, 0]}>
        <sphereGeometry args={[r * 0.88, 9, 7, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={accent} roughness={0.35} metalness={0.3} />
      </mesh>
    </group>
  );
}

// Medieval stone tower + conical roof
function MedTower({ pos, w, h, color, accent }) {
  return (
    <group position={[pos[0], 0, pos[1]]}>
      <mesh position={[0, h / 2, 0]}>
        <boxGeometry args={[w, h, w]} />
        <meshStandardMaterial color={color} roughness={0.95} />
      </mesh>
      {/* Battlements */}
      {[[-w*0.3, -w*0.3],[w*0.3,-w*0.3],[-w*0.3,w*0.3],[w*0.3,w*0.3]].map(([bx,bz], i) => (
        <mesh key={i} position={[bx, h + 0.4, bz]}>
          <boxGeometry args={[w * 0.28, 0.8, w * 0.28]} />
          <meshStandardMaterial color={color} roughness={0.95} />
        </mesh>
      ))}
      <mesh position={[0, h + 1.2, 0]}>
        <coneGeometry args={[w * 0.65, w * 1.1, 4]} />
        <meshStandardMaterial color={accent} roughness={0.8} />
      </mesh>
    </group>
  );
}

// Park tile (flat green)
function ParkTile({ cx, cz, size, color }) {
  return (
    <mesh position={[cx, 0.02, cz]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[size, size]} />
      <meshStandardMaterial color={color} roughness={0.9} />
    </mesh>
  );
}

// Fountain
function Fountain({ pos }) {
  return (
    <group position={pos}>
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[2.2, 2.5, 0.4, 16]} />
        <meshStandardMaterial color="#aabbcc" roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.7, 0]}>
        <cylinderGeometry args={[0.2, 0.3, 1.0, 8]} />
        <meshStandardMaterial color="#ccddee" roughness={0.4} />
      </mesh>
      <mesh position={[0, 1.4, 0]}>
        <sphereGeometry args={[0.55, 8, 8]} />
        <meshStandardMaterial color="#aaccee" emissive="#6699bb" emissiveIntensity={0.4} roughness={0.2} />
      </mesh>
    </group>
  );
}

// Tree
function Tree({ pos, s = 1 }) {
  return (
    <group position={pos} scale={s}>
      <mesh position={[0, 0.8, 0]}>
        <cylinderGeometry args={[0.15, 0.22, 1.6, 6]} />
        <meshStandardMaterial color="#5a3800" roughness={1} />
      </mesh>
      <mesh position={[0, 2.4, 0]}>
        <sphereGeometry args={[0.85, 7, 6]} />
        <meshStandardMaterial color="#2d8a2d" roughness={0.9} />
      </mesh>
    </group>
  );
}

// Street lantern
function Lantern({ pos }) {
  return (
    <group position={pos}>
      <mesh position={[0, 2.2, 0]}>
        <cylinderGeometry args={[0.07, 0.07, 4.4, 5]} />
        <meshStandardMaterial color="#555" roughness={0.8} />
      </mesh>
      <mesh position={[0, 4.5, 0]}>
        <sphereGeometry args={[0.25, 6, 6]} />
        <meshStandardMaterial color="#ffffdd" emissive="#ffeeaa" emissiveIntensity={2.5} />
      </mesh>
    </group>
  );
}

function CityScene({ metrics, style, colorPalette, level, tokenId }) {
  const { followers = 0, tweetCount = 0, engagement = 0, following = 0 } = metrics;
  const cfg = STYLE_CFG[style] || STYLE_CFG.Cyberpunk;
  const { primary, secondary, accent } = colorPalette;

  const groundColor = "#3a8a30";
  const parkColor   = "#4aaa3a";
  const roadColor   = "#1e1e1e"; // asphalt — always dark gray, never invisible

  const isEco  = style === "Eco-Futurism";
  const isBio  = style === "Bio-Punk";
  const isMed  = style === "Medieval";

  // Window color: lighter tint of primary
  const winColor = style === "Minimalist" ? "#aaddff"
    : style === "Cyberpunk" ? "#002244"
    : style === "Medieval"  ? "#3a2800"
    : style === "Baroque"   ? "#1a0030"
    : "#223344";

  const data = useMemo(() => {
    const seed = (((tokenId | 0) * 9973) + (followers | 0)) >>> 0;
    const rng  = mkRng(seed);

    // --- FOLLOWERS → city grid size ---
    // <1k → tiny 2×2 blocks, 1k-20k → 3×3, >20k → 5×5
    const gridR = followers >= 20000 ? 2 : followers >= 1000 ? 1 : 0;

    // --- TWEET COUNT → buildings per block ---
    const perBlockBase = tweetCount >= 10000 ? 6 : tweetCount >= 1000 ? 4 : tweetCount >= 100 ? 3 : 2;

    // --- ENGAGEMENT → building height (skyscraper vs shack) ---
    const minH = 3;
    const maxH = engagement >= 3 ? 30 : engagement >= 1 ? 18 : engagement >= 0.3 ? 10 : 5;

    // --- FOLLOWERS/FOLLOWING ratio → material prestige (metalness) ---
    const ratio = following > 0 ? followers / following : followers > 0 ? 5 : 1;
    const prestige = Math.min(Math.max(ratio / 20, 0.08), 0.8);

    // Block offsets — always use STEP-aligned centers so buildings never land on roads.
    // Roads are at ±(i+0.5)*STEP, blocks are at ±STEP, ±2*STEP etc — always clear.
    const blockOffsets = [];
    if (gridR === 0) {
      // Tiny city: just 4 corner blocks (same positions as gridR=1 corners)
      for (const row of [-1, 1])
        for (const col of [-1, 1])
          blockOffsets.push({ bx: col * STEP, bz: row * STEP });
    } else {
      for (let row = -gridR; row <= gridR; row++)
        for (let col = -gridR; col <= gridR; col++)
          if (!(row === 0 && col === 0))
            blockOffsets.push({ bx: col * STEP, bz: row * STEP });
    }

    // Safe zone inside each block: shrink by 4 units on each side so buildings
    // never spill onto adjacent roads (rule: buildings don't stand on roads).
    const safeHalf = (BLOCK - 6) / 2; // = 5 units from block center

    // Building width inversely proportional to density
    const maxBW = perBlockBase <= 2 ? 3.8 : perBlockBase <= 4 ? 2.8 : 2.0;

    // Buildings placed randomly inside safe zone with minimum spacing enforced
    const buildings = [];
    blockOffsets.forEach(({ bx, bz }) => {
      const count = perBlockBase + (rng() > 0.7 ? 1 : 0);
      const placed = [];
      for (let attempt = 0; placed.length < count && attempt < count * 15; attempt++) {
        const px = bx + (rng() - 0.5) * 2 * safeHalf;
        const pz = bz + (rng() - 0.5) * 2 * safeHalf;
        const minDist = maxBW * 1.1;
        if (placed.every(p => Math.hypot(p[0] - px, p[1] - pz) >= minDist)) {
          placed.push([px, pz]);
          const h = minH + rng() * (maxH - minH);
          const w = maxBW * 0.55 + rng() * maxBW * 0.45;
          const d = maxBW * 0.55 + rng() * maxBW * 0.45;
          const color = rng() > 0.45 ? primary : secondary;
          buildings.push({ pos: [px, pz], w, d, h, color, accent, prestige });
        }
      }
    });

    // Roads between blocks
    const totalSize = (2 * Math.max(gridR, 1) + 1) * BLOCK + 2 * Math.max(gridR, 1) * ROAD + 10;
    const roadCenters = []; // track road center coords for collision checks
    const roads = [];
    for (let i = -Math.max(gridR, 1); i < Math.max(gridR, 1); i++) {
      const t = (i + 0.5) * STEP;
      roadCenters.push(t);
      roads.push({ x: t, z: 0, len: totalSize, horiz: false });
      roads.push({ x: 0, z: t, len: totalSize, horiz: true });
    }

    // Rule: nothing stands on roads. A point is on a road if it falls within
    // ROAD/2 of any road center on either axis.
    const isOnRoad = (x, z) =>
      roadCenters.some(rc => Math.abs(x - rc) <= ROAD / 2 + 0.3) ||
      roadCenters.some(rc => Math.abs(z - rc) <= ROAD / 2 + 0.3);

    // --- FOLLOWING → trees (more social = greener city) ---
    const treeRng = mkRng(seed + 1);
    const trees = [];
    const numParkTrees = Math.min(8 + Math.floor(following / 30), 60);
    for (let i = 0; i < numParkTrees; i++) {
      const angle = (i / numParkTrees) * Math.PI * 2 + treeRng() * 0.4;
      const r = 5 + treeRng() * 2.5;
      trees.push({ pos: [Math.cos(angle) * r, 0, Math.sin(angle) * r], s: 0.7 + treeRng() * 0.5 });
    }
    if (isEco || isBio) {
      for (let i = 0; i < 30; i++) {
        const tx = (treeRng() - 0.5) * totalSize * 0.85;
        const tz = (treeRng() - 0.5) * totalSize * 0.85;
        trees.push({ pos: [tx, 0, tz], s: 0.5 + treeRng() * 0.6 });
      }
    }

    // --- TWEET COUNT → lanterns on sidewalk, never on roads ---
    const lanternRng = mkRng(seed + 2);
    const lanterns = [];
    const lCount = Math.min(4 + Math.floor(tweetCount / 200), 24);
    for (let attempt = 0; lanterns.length < lCount && attempt < 400; attempt++) {
      // Pick a road, stand on its sidewalk (ROAD/2 + 1.5 units from center)
      const rc = roadCenters[Math.floor(lanternRng() * roadCenters.length)];
      const sidewalk = ROAD / 2 + 1.5 + lanternRng() * 0.8;
      const along = (lanternRng() - 0.5) * totalSize * 0.7;
      const horiz = lanternRng() > 0.5;
      const lx = horiz ? along : rc + (lanternRng() > 0.5 ? sidewalk : -sidewalk);
      const lz = horiz ? rc + (lanternRng() > 0.5 ? sidewalk : -sidewalk) : along;
      if (!isOnRoad(lx, lz)) lanterns.push([lx, 0, lz]);
    }

    return { buildings, roads, trees, lanterns, totalSize };
  }, [followers, tweetCount, engagement, following, tokenId, style, primary, secondary, accent]);

  return (
    <>
      <color attach="background" args={[cfg.sky]} />
      <fog attach="fog" args={[cfg.sky, 70, 160]} />

      <ambientLight intensity={cfg.ambI} />
      <directionalLight position={[25, 35, 20]} intensity={cfg.dirI} />
      <directionalLight position={[-15, 20, -10]} intensity={cfg.dirI * 0.35} color={accent} />
      <hemisphereLight args={[cfg.sky, groundColor, 0.6]} />
      <pointLight position={[0, 12, 0]} color={accent} intensity={1.5} distance={60} decay={1.5} />

      {cfg.stars && <Stars radius={120} depth={50} count={1200} factor={2} fade />}

      {/* Ground */}
      <Ground size={data.totalSize + 30} color={groundColor} />

      {/* Roads */}
      {data.roads.map((r, i) => <Road key={i} {...r} color={roadColor} />)}

      {/* Central park */}
      <ParkTile cx={0} cz={0} size={BLOCK} color={parkColor} />
      <Fountain pos={[0, 0, 0]} />

      {/* Buildings */}
      {data.buildings.map((b, i) => {
        if (isEco || isBio)
          return <EcoTower key={i} pos={b.pos} r={(b.w / 2)} h={b.h} color={b.color} accent={accent} />;
        if (isMed)
          return <MedTower key={i} pos={b.pos} w={b.w * 0.75} h={b.h} color={b.color} accent={accent} />;
        return (
          <Building key={i} {...b}
            winColor={winColor}
            winEmI={cfg.winEmI}
            style={style}
            prestige={b.prestige}
          />
        );
      })}

      {/* Trees */}
      {data.trees.map((t, i) => <Tree key={i} pos={t.pos} s={t.s} />)}

      {/* Lanterns */}
      {data.lanterns.map((pos, i) => <Lantern key={i} pos={pos} />)}
    </>
  );
}

export default function CityRenderer({ city, tokenId }) {
  const [open, setOpen] = useState(false);

  const {
    level = 1,
    style = "Cyberpunk",
    colorPalette = { primary: "#2255aa", secondary: "#1a3377", accent: "#00ccff" },
    followers = 0, tweetCount = 0, following = 0, engagement = 0,
  } = city || {};

  const metrics = { followers, tweetCount, following, engagement };
  const sceneProps = { metrics, style, colorPalette, level, tokenId: tokenId || 0 };

  return (
    <>
      <div
        style={{ width: 600, height: 320, borderRadius: 12, overflow: "hidden", cursor: "pointer", position: "relative" }}
        onClick={() => setOpen(true)}
      >
        <Canvas camera={{ position: [28, 22, 28], fov: 45 }}>
          <Suspense fallback={null}>
            <CityScene {...sceneProps} />
            <OrbitControls enableZoom={false} enablePan={false} enableRotate={false} autoRotate autoRotateSpeed={0.6} />
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
            onClick={e => e.stopPropagation()}
          >
            <Canvas camera={{ position: [30, 24, 30], fov: 42 }}>
              <Suspense fallback={null}>
                <CityScene {...sceneProps} />
                <OrbitControls enablePan={false} minDistance={8} maxDistance={120} maxPolarAngle={Math.PI / 2 - 0.04} autoRotate autoRotateSpeed={0.35} />
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
