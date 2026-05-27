// CityRendererV2 — tile-grid city: tile-low blocks + road tiles + buildings
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
  skyscraper: ['a','b','c','d','e'].map(l => `/models/commercial/building-skyscraper-${l}.glb`),
  commercial: ['a','b','c','d','e','f','g','h','i','j','k','l','m','n'].map(l => `/models/commercial/building-${l}.glb`),
  industrial: ['a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p','q','r','s','t'].map(l => `/models/industrial/building-${l}.glb`),
  suburban:   ['a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p','q','r','s','t','u'].map(l => `/models/suburban/building-type-${l}.glb`),
  chimneys:   ['chimney-basic','chimney-medium','chimney-small','detail-tank'].map(n => `/models/industrial/${n}.glb`),
  driveways:  ['driveway-long','driveway-short'].map(n => `/models/suburban/${n}.glb`),
  trees:      ['/models/suburban/tree-large.glb', '/models/suburban/tree-small.glb'],
  commercialDetails: ['detail-awning','detail-awning-wide','detail-overhang','detail-overhang-wide','detail-parasol-a','detail-parasol-b'].map(n => `/models/commercial/${n}.glb`),
};

const ZONE_SCALE = { skyscraper: 5.0, commercial: 4.0, industrial: 2.5, suburban: 3.2 };

// ─── Tile grid constants ──────────────────────────────────────────────────────
// All Kenney road/sidewalk tiles: native 1×1 → scale S → S×S world units
const S       = 8;               // tile scale
const BLOCK_N = 3;               // tiles per building-block side (3×3 = 9 tiles)
const PERIOD  = (BLOCK_N + 1) * S;  // = 32 — block center spacing
const HALF_B  = (BLOCK_N / 2) * S; // = 12 — half block size

// ─── GLB model component ─────────────────────────────────────────────────────

function GlbModel({ url, position, rotY = 0, scale = 1 }) {
  const { scene } = useGLTF(url);
  const clone = useMemo(() => scene.clone(true), [scene]);
  return <primitive object={clone} position={position} rotation={[0, rotY, 0]} scale={scale} />;
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
    const gr    = Math.max(gridR, 1);

    const models = [];

    // Block center positions (multiples of PERIOD)
    const blockPos = [];
    for (let bc = -gridR; bc <= gridR; bc++) blockPos.push(bc * PERIOD);

    // Road strip center positions (between each pair of blocks)
    const roadPos = [];
    for (let bc = -gridR; bc < gridR; bc++) roadPos.push(bc * PERIOD + PERIOD / 2);

    // ── Sidewalk tiles (tile-low) under every building block ─────────────────
    for (const bx of blockPos) {
      for (const bz of blockPos) {
        for (let tx = -1; tx <= 1; tx++) {
          for (let tz = -1; tz <= 1; tz++) {
            models.push({
              url: '/models/roads/tile-low.glb',
              x: bx + tx * S,
              z: bz + tz * S,
              rotY: 0, scale: S,
            });
          }
        }
      }
    }

    // ── Road tiles ────────────────────────────────────────────────────────────
    // Crossroads at every (rx, rz) intersection
    for (const rx of roadPos) {
      for (const rz of roadPos) {
        models.push({ url: '/models/roads/road-crossroad-path.glb', x: rx, z: rz, rotY: 0, scale: S });
      }
    }

    // Tile x/z range: from outer edge of leftmost block to outer edge of rightmost
    const tileHalfSpan = gr * PERIOD + HALF_B - S / 2; // = gr*32 + 8

    // Horizontal straights (along X axis → rotY = 0, tile natively runs along X)
    for (const rz of roadPos) {
      for (let x = -tileHalfSpan; x <= tileHalfSpan + 0.001; x += S) {
        if (roadPos.some(rx => Math.abs(rx - x) < 0.1)) continue;
        models.push({ url: '/models/roads/road-straight.glb', x, z: rz, rotY: 0, scale: S });
      }
    }

    // Vertical straights (along Z axis → rotY = π/2)
    for (const rx of roadPos) {
      for (let z = -tileHalfSpan; z <= tileHalfSpan + 0.001; z += S) {
        if (roadPos.some(rz => Math.abs(rz - z) < 0.1)) continue;
        models.push({ url: '/models/roads/road-straight.glb', x: rx, z, rotY: Math.PI / 2, scale: S });
      }
    }

    // Street lights at every other intersection
    for (let ri = 0; ri < roadPos.length; ri++) {
      for (let rj = 0; rj < roadPos.length; rj++) {
        if ((ri + rj) % 2 !== 0) continue;
        const rx = roadPos[ri], rz = roadPos[rj];
        models.push({ url: '/models/roads/light-square-double.glb', x: rx + S * 0.55, z: rz + S * 0.55, rotY: Math.PI * 1.25, scale: S });
        models.push({ url: '/models/roads/light-square-double.glb', x: rx - S * 0.55, z: rz - S * 0.55, rotY: Math.PI * 0.25, scale: S });
      }
    }

    // ── Buildings ─────────────────────────────────────────────────────────────
    // Buildings are placed on top of tile-low blocks.
    // Max safe offset from block center: HALF_B - building_half_footprint ≈ 12 - 3 = 9
    const JITTER = 7;

    for (let bc_row = -gridR; bc_row <= gridR; bc_row++) {
      for (let bc_col = -gridR; bc_col <= gridR; bc_col++) {
        if (bc_row === 0 && bc_col === 0) continue; // center = park
        if (rng() < 0.1) continue; // 10% empty blocks

        const cx   = bc_col * PERIOD;
        const cz   = bc_row * PERIOD;
        const zone = Math.max(Math.abs(bc_row), Math.abs(bc_col));

        const isSky  = zone === 1 && level >= 6;
        const isComm = zone <= 1 || (zone === 2 && gridR >= 4);
        const isInd  = zone >= 2 && zone <= gridR - 1;
        const pack   = isSky ? 'skyscraper' : isComm ? 'commercial' : isInd ? 'industrial' : 'suburban';
        const list   = MODELS[pack];
        const baseScale = ZONE_SCALE[pack];

        let clusterOffsets, clusterScale;

        if (pack === 'commercial' || pack === 'skyscraper') {
          clusterOffsets = [[(rng() - 0.5) * JITTER, (rng() - 0.5) * JITTER]];
          clusterScale   = baseScale * (0.9 + rng() * 0.2);
        } else if (pack === 'industrial') {
          const off  = 4 + rng() * 2;
          const useX = rng() > 0.5;
          clusterOffsets = useX
            ? [[-off, (rng() - 0.5) * 3], [off, (rng() - 0.5) * 3]]
            : [[(rng() - 0.5) * 3, -off], [(rng() - 0.5) * 3, off]];
          clusterScale = baseScale * (0.85 + rng() * 0.2);
        } else {
          // suburban: 3-4 small houses in block corners
          const corners = [[-5, -5], [5, -5], [-5, 5], [5, 5]];
          if (rng() < 0.35) corners.splice(Math.floor(rng() * 4) | 0, 1);
          clusterOffsets = corners.map(([ox, oz]) => [ox + (rng() - 0.5) * 1.5, oz + (rng() - 0.5) * 1.5]);
          clusterScale   = baseScale * (0.9 + rng() * 0.2);
        }

        for (const [ox, oz] of clusterOffsets) {
          models.push({
            url:   list[Math.floor(rng() * list.length)],
            x: cx + ox, z: cz + oz,
            rotY:  Math.floor(rng() * 4) * Math.PI / 2,
            scale: clusterScale * (0.9 + rng() * 0.2),
          });
        }

        // Props
        if (pack === 'industrial' && rng() < 0.35) {
          models.push({ url: MODELS.chimneys[Math.floor(rng() * MODELS.chimneys.length)], x: cx + (rng()-0.5)*8, z: cz + (rng()-0.5)*8, rotY: rng()*Math.PI*2, scale: 2.0 });
        }
        if (pack === 'suburban' && rng() < 0.35) {
          models.push({ url: MODELS.driveways[Math.floor(rng() * MODELS.driveways.length)], x: cx+(rng()-0.5)*6, z: cz+(rng()-0.5)*6, rotY: Math.floor(rng()*4)*Math.PI/2, scale: 5.0 });
        }
        if ((pack === 'commercial' || pack === 'skyscraper') && rng() < 0.4) {
          models.push({ url: MODELS.commercialDetails[Math.floor(rng()*MODELS.commercialDetails.length)], x: cx+(rng()-0.5)*6, z: cz+(rng()-0.5)*6, rotY: Math.floor(rng()*4)*Math.PI/2, scale: 3.5 });
        }
        // Scattered trees
        if (rng() < 0.3) {
          models.push({ url: MODELS.trees[rng()>0.5?0:1], x: cx+(rng()-0.5)*HALF_B, z: cz+(rng()-0.5)*HALF_B, rotY: rng()*Math.PI*2, scale: 4.0+rng()*2.0 });
        }
      }
    }

    // Center park trees
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 + treeRng() * 0.8;
      const r     = 4 + treeRng() * 6;
      models.push({ url: MODELS.trees[treeRng()>0.5?0:1], x: Math.cos(angle)*r, z: Math.sin(angle)*r, rotY: treeRng()*Math.PI*2, scale: 4.5+treeRng()*2.0 });
    }

    const citySize = (2 * gr + 1) * PERIOD + 24;
    return { models, citySize, gridR };
  }, [followers, tokenId]);

  return (
    <>
      <color attach="background" args={["#8899aa"]} />
      <ambientLight intensity={1.8} />
      <directionalLight position={[20, 28, 15]} intensity={1.4} />
      <directionalLight position={[-10, 15, -10]} intensity={0.4} color="#bbccff" />
      <hemisphereLight args={["#c8d8f0", "#223311", 0.5]} />

      {/* Base ground (shows at city edges) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
        <planeGeometry args={[data.citySize + 40, data.citySize + 40]} />
        <meshStandardMaterial color="#4a4e5a" roughness={1} />
      </mesh>

      {/* All GLB: tile-low blocks + road tiles + lights + buildings */}
      {data.models.map((m, i) => (
        <GlbModel key={i} url={m.url} position={[m.x, 0, m.z]} rotY={m.rotY} scale={m.scale} />
      ))}
    </>
  );
}

// ─── Camera ──────────────────────────────────────────────────────────────────

function camPos(followers) {
  const level = cityLevel(followers);
  const gridR = level >= 9 ? 5 : level >= 7 ? 4 : level >= 5 ? 3 : level >= 3 ? 2 : level >= 1 ? 1 : 0;
  const d = 40 + gridR * PERIOD * 1.4;
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
                <OrbitControls enablePan={false} minDistance={8} maxDistance={300} maxPolarAngle={Math.PI / 2 - 0.04} autoRotate autoRotateSpeed={0.35} />
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
