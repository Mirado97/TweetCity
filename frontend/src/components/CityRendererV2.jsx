// CityRendererV2 — city built from Kenney GLB models (commercial + industrial + suburban)
import { useMemo, useState, Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import { cityLevel } from "./CityRenderer";

function mkRng(seed) {
  let s = ((seed >>> 0) || 1337);
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 0xffffffff; };
}

// ─── Model lists ─────────────────────────────────────────────────────────────

const MODELS = {
  // native ~1.36×1.36 → scale 4.0 → ~5.4 footprint
  skyscraper: ['a','b','c','d','e'].map(l => `/models/commercial/building-skyscraper-${l}.glb`),
  // native ~1.36×1.0 → scale 4.0 → ~5.4 footprint
  commercial: ['a','b','c','d','e','f','g','h','i','j','k','l','m','n'].map(l => `/models/commercial/building-${l}.glb`),
  // native ~2.1×1.2 → scale 2.5 → ~5.2 footprint
  industrial: ['a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p','q','r','s','t'].map(l => `/models/industrial/building-${l}.glb`),
  // native ~1.3×1.0 → scale 4.0 → ~5.2 footprint
  suburban:   ['a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p','q','r','s','t','u'].map(l => `/models/suburban/building-type-${l}.glb`),
  // industrial props
  chimneys:   ['chimney-basic','chimney-medium','chimney-small','detail-tank'].map(n => `/models/industrial/${n}.glb`),
  // suburban details — placed near houses
  driveways:  ['driveway-long','driveway-short'].map(n => `/models/suburban/${n}.glb`),
  planters:   ['/models/suburban/planter.glb'],
  // park trees
  trees:      ['/models/suburban/tree-large.glb', '/models/suburban/tree-small.glb'],
  // commercial street details
  commercialDetails: ['detail-awning','detail-awning-wide','detail-overhang','detail-overhang-wide','detail-parasol-a','detail-parasol-b'].map(n => `/models/commercial/${n}.glb`),
  // suburban path/sidewalk tiles
  paths:      ['path-short','path-long','path-stones-short','path-stones-long','path-stones-messy'].map(n => `/models/suburban/${n}.glb`),
};

// Scale per zone so all packs have similar real-world footprint (~5 units)
const ZONE_SCALE = {
  skyscraper: 5.0,
  commercial: 4.0,
  industrial: 2.5,
  suburban:   4.0,
};

const TILE    = 28;  // distance between building centers
const ROAD_W  = 6.0; // road strip width between tile rows/cols

// ─── GLB model component ─────────────────────────────────────────────────────

function GlbModel({ url, position, rotY = 0, scale = 1 }) {
  const { scene } = useGLTF(url);
  const clone = useMemo(() => scene.clone(true), [scene]);
  return <primitive object={clone} position={position} rotation={[0, rotY, 0]} scale={scale} />;
}

// ─── Road strip (procedural plane — no road pack available) ──────────────────

function RoadGrid({ gridR }) {
  const gr   = Math.max(gridR, 1);
  const span = (2 * gr + 1) * TILE;
  const strips = [];
  for (let i = -gr; i < gr; i++) {
    const t = (i + 0.5) * TILE;
    // horizontal strip (along X)
    strips.push(
      <mesh key={`h${i}`} position={[0, 0.01, t]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[span, ROAD_W]} />
        <meshStandardMaterial color="#404552" roughness={1} />
      </mesh>
    );
    // vertical strip (along Z)
    strips.push(
      <mesh key={`v${i}`} position={[t, 0.01, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 2]}>
        <planeGeometry args={[span, ROAD_W]} />
        <meshStandardMaterial color="#404552" roughness={1} />
      </mesh>
    );
  }
  return <>{strips}</>;
}

// ─── City scene ──────────────────────────────────────────────────────────────

function V2Scene({ metrics, tokenId }) {
  const { followers = 0 } = metrics;

  const data = useMemo(() => {
    const seed    = (((tokenId | 0) * 9973) + (followers | 0)) >>> 0;
    const rng     = mkRng(seed);
    const treeRng = mkRng(seed + 1);

    const level = cityLevel(followers);
    const gridR = level >= 9 ? 5 : level >= 7 ? 4 : level >= 5 ? 3 : level >= 3 ? 2 : level >= 1 ? 1 : 0;

    const models = [];

    // Max safe jitter: road edge at TILE/2 - ROAD_W/2 = 11, minus building half-footprint(2.5) and margin(2) = 6.5
    const JITTER = TILE / 2 - ROAD_W / 2 - 4.5; // = 6.5

    for (let row = -gridR; row <= gridR; row++) {
      for (let col = -gridR; col <= gridR; col++) {
        if (row === 0 && col === 0) continue; // center = park/trees

        // Skip ~12% of cells → open lots / breathing room
        if (rng() < 0.12) continue;

        const zone = Math.max(Math.abs(row), Math.abs(col));
        const cx   = col * TILE;
        const cz   = row * TILE;

        // Zone → model pack
        const isSky  = zone <= 1 && level >= 6;
        const isHigh = zone <= 2 && level >= 4;
        const isMid  = zone <= gridR - 1;
        const pack   = isSky ? 'skyscraper' : isHigh ? 'commercial' : isMid ? 'industrial' : 'suburban';
        const list   = MODELS[pack];
        const baseScale = ZONE_SCALE[pack];

        // Suburban split: 25% chance → 2 smaller houses offset to opposite corners
        if (pack === 'suburban' && rng() < 0.25) {
          const offsets = [
            [JITTER * 0.5, JITTER * 0.5],
            [-JITTER * 0.5, -JITTER * 0.5],
          ];
          for (const [ox, oz] of offsets) {
            const sx = baseScale * (0.75 + rng() * 0.15);
            models.push({
              url:  list[Math.floor(rng() * list.length)],
              x:    cx + ox + (rng() - 0.5) * 4,
              z:    cz + oz + (rng() - 0.5) * 4,
              rotY: Math.floor(rng() * 4) * Math.PI / 2,
              scale: sx,
            });
          }
          continue;
        }

        // Normal placement: jitter within cell + slight scale variation
        const x     = cx + (rng() - 0.5) * JITTER * 2;
        const z     = cz + (rng() - 0.5) * JITTER * 2;
        const scale = baseScale * (0.85 + rng() * 0.3);

        models.push({
          url:  list[Math.floor(rng() * list.length)],
          x, z,
          rotY: Math.floor(rng() * 4) * Math.PI / 2,
          scale,
        });

        // Industrial: chimney or tank prop nearby at 30%
        if (pack === 'industrial' && rng() < 0.3) {
          models.push({
            url:   MODELS.chimneys[Math.floor(rng() * MODELS.chimneys.length)],
            x:     x + (rng() - 0.5) * 6,
            z:     z + (rng() - 0.5) * 6,
            rotY:  rng() * Math.PI * 2,
            scale: 2.0,
          });
        }

        // Suburban: driveway at 40%
        if (pack === 'suburban' && rng() < 0.4) {
          models.push({
            url:   MODELS.driveways[Math.floor(rng() * MODELS.driveways.length)],
            x:     x + (rng() - 0.5) * 2,
            z:     z + (rng() - 0.5) * 2,
            rotY:  Math.floor(rng() * 4) * Math.PI / 2,
            scale: 5.0,
          });
        }

        // Suburban: planter at 25%
        if (pack === 'suburban' && rng() < 0.25) {
          models.push({
            url:   '/models/suburban/planter.glb',
            x:     x + (rng() - 0.5) * 3,
            z:     z + (rng() - 0.5) * 3,
            rotY:  rng() * Math.PI * 2,
            scale: 4.0,
          });
        }

        // Suburban: path/sidewalk tile at 30%
        if (pack === 'suburban' && rng() < 0.3) {
          models.push({
            url:   MODELS.paths[Math.floor(rng() * MODELS.paths.length)],
            x:     x + (rng() - 0.5) * 5,
            z:     z + (rng() - 0.5) * 5,
            rotY:  Math.floor(rng() * 4) * Math.PI / 2,
            scale: 4.0,
          });
        }

        // Commercial: awning or parasol at 35%
        if ((pack === 'commercial' || pack === 'skyscraper') && rng() < 0.35) {
          models.push({
            url:   MODELS.commercialDetails[Math.floor(rng() * MODELS.commercialDetails.length)],
            x:     x + (rng() - 0.5) * 4,
            z:     z + (rng() - 0.5) * 4,
            rotY:  Math.floor(rng() * 4) * Math.PI / 2,
            scale: 3.5,
          });
        }

        // Scattered trees throughout city at 15%
        if (rng() < 0.15) {
          models.push({
            url:   MODELS.trees[rng() > 0.5 ? 0 : 1],
            x:     x + (rng() - 0.5) * TILE * 0.4,
            z:     z + (rng() - 0.5) * TILE * 0.4,
            rotY:  rng() * Math.PI * 2,
            scale: 2.0 + rng() * 1.5,
          });
        }
      }
    }

    // GLB trees around center park
    const numTrees = 6 + gridR * 4;
    for (let i = 0; i < numTrees; i++) {
      const angle = (i / numTrees) * Math.PI * 2 + treeRng() * 0.5;
      const r     = 2 + treeRng() * 2;
      models.push({
        url:   MODELS.trees[treeRng() > 0.5 ? 0 : 1],
        x:     Math.cos(angle) * r,
        z:     Math.sin(angle) * r,
        rotY:  treeRng() * Math.PI * 2,
        scale: 2.5 + treeRng() * 1.5,
      });
    }

    const gr       = Math.max(gridR, 1);
    const citySize = (2 * gr + 1) * TILE + 24;
    return { models, citySize, gridR };
  }, [followers, tokenId]);

  return (
    <>
      <color attach="background" args={["#8899aa"]} />
      <ambientLight intensity={1.8} />
      <directionalLight position={[20, 28, 15]} intensity={1.4} />
      <directionalLight position={[-10, 15, -10]} intensity={0.4} color="#bbccff" />
      <hemisphereLight args={["#c8d8f0", "#223311", 0.5]} />

      {/* Ground — asphalt grey */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]}>
        <planeGeometry args={[data.citySize + 30, data.citySize + 30]} />
        <meshStandardMaterial color="#4a4e5a" roughness={1} />
      </mesh>

      {/* Road grid between building rows/cols */}
      <RoadGrid gridR={data.gridR} />

      {/* All GLB models */}
      {data.models.map((m, i) => (
        <GlbModel
          key={i}
          url={m.url}
          position={[m.x, 0, m.z]}
          rotY={m.rotY}
          scale={m.scale}
        />
      ))}
    </>
  );
}

// ─── Camera ──────────────────────────────────────────────────────────────────

function camPos(followers) {
  const level = cityLevel(followers);
  const gridR = level >= 9 ? 5 : level >= 7 ? 4 : level >= 5 ? 3 : level >= 3 ? 2 : level >= 1 ? 1 : 0;
  const d = 40 + gridR * TILE * 1.4;
  return [d, d * 0.75, d];
}

// ─── Public component ─────────────────────────────────────────────────────────

export default function CityRendererV2({ city, tokenId }) {
  const [open, setOpen] = useState(false);
  const { followers = 0, tweetCount = 0, following = 0, engagement = 0 } = city || {};
  const metrics = { followers, tweetCount, following, engagement };
  const cp = camPos(followers);

  return (
    <>
      <div
        style={{ width: 600, height: 320, borderRadius: 12, overflow: "hidden", cursor: "pointer", position: "relative" }}
        onClick={() => setOpen(true)}
      >
        <Canvas camera={{ position: cp, fov: 45 }}>
          <Suspense fallback={null}>
            <V2Scene metrics={metrics} tokenId={tokenId || 0} />
            <OrbitControls enableZoom={false} enablePan={false} enableRotate={false} autoRotate autoRotateSpeed={0.6} />
          </Suspense>
        </Canvas>
        <div style={{ position: "absolute", bottom: 10, right: 12, color: "rgba(255,255,255,0.55)", fontSize: 11, fontFamily: "monospace", pointerEvents: "none" }}>
          V2 · Click to explore ↗
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
            <Canvas camera={{ position: [cp[0] * 1.1, cp[1] * 1.1, cp[2] * 1.1], fov: 42 }}>
              <Suspense fallback={null}>
                <V2Scene metrics={metrics} tokenId={tokenId || 0} />
                <OrbitControls enablePan={false} minDistance={8} maxDistance={250} maxPolarAngle={Math.PI / 2 - 0.04} autoRotate autoRotateSpeed={0.35} />
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
