// CityRendererV2 — city built from Kenney GLB models (commercial + industrial + suburban + roads)
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

const ZONE_SCALE = {
  skyscraper: 5.0,
  commercial: 4.0,
  industrial: 2.5,
  suburban:   4.0,
};

const TILE   = 28; // distance between building cell centers
const ROAD_W = 7;  // = TILE/4 → road tiles (1×1 native) at scale 7 tile perfectly: 3 straights between crossroads

// ─── GLB model component ─────────────────────────────────────────────────────

function GlbModel({ url, position, rotY = 0, scale = 1 }) {
  const { scene } = useGLTF(url);
  const clone = useMemo(() => scene.clone(true), [scene]);
  return <primitive object={clone} position={position} rotation={[0, rotY, 0]} scale={scale} />;
}

// ─── Paved blocks (sidewalk between roads) ────────────────────────────────────

function BlockPaving({ gridR }) {
  const size = TILE - ROAD_W; // 21 units — fits exactly between road tile edges
  const blocks = [];
  for (let row = -gridR; row <= gridR; row++) {
    for (let col = -gridR; col <= gridR; col++) {
      blocks.push(
        <mesh key={`p${row}_${col}`} position={[col * TILE, 0.02, row * TILE]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[size, size]} />
          <meshStandardMaterial color="#8a8e98" roughness={0.95} />
        </mesh>
      );
    }
  }
  return <>{blocks}</>;
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

    // Safe jitter: road edge = TILE/2 - ROAD_W/2 = 10.5, minus building half(2.5) and margin(2) = 6.0
    const JITTER = TILE / 2 - ROAD_W / 2 - 4.5; // = 6.0

    // ── Buildings ────────────────────────────────────────────────────────────

    for (let row = -gridR; row <= gridR; row++) {
      for (let col = -gridR; col <= gridR; col++) {
        if (row === 0 && col === 0) continue;
        if (rng() < 0.12) continue; // ~12% empty lots

        const zone = Math.max(Math.abs(row), Math.abs(col));
        const cx   = col * TILE;
        const cz   = row * TILE;

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
          const off  = 3.5 + rng() * 1.5;
          const useX = rng() > 0.5;
          clusterOffsets = useX
            ? [[-off, (rng() - 0.5) * 3], [off, (rng() - 0.5) * 3]]
            : [[(rng() - 0.5) * 3, -off], [(rng() - 0.5) * 3, off]];
          clusterScale = baseScale * (0.85 + rng() * 0.2);
        } else {
          const corners = [[-4, -4], [4, -4], [-4, 4], [4, 4]];
          if (rng() < 0.35) corners.splice(Math.floor(rng() * 4) | 0, 1);
          clusterOffsets = corners.map(([ox, oz]) => [ox + (rng() - 0.5) * 1.5, oz + (rng() - 0.5) * 1.5]);
          clusterScale   = 2.8 + rng() * 0.5;
        }

        for (const [ox, oz] of clusterOffsets) {
          models.push({
            url:  list[Math.floor(rng() * list.length)],
            x: cx + ox, z: cz + oz,
            rotY: Math.floor(rng() * 4) * Math.PI / 2,
            scale: clusterScale * (0.9 + rng() * 0.2),
          });
        }

        if (pack === 'industrial' && rng() < 0.35) {
          models.push({
            url: MODELS.chimneys[Math.floor(rng() * MODELS.chimneys.length)],
            x: cx + (rng() - 0.5) * 6, z: cz + (rng() - 0.5) * 6,
            rotY: rng() * Math.PI * 2, scale: 2.0,
          });
        }

        if (pack === 'suburban') {
          if (rng() < 0.4) models.push({ url: MODELS.driveways[Math.floor(rng() * MODELS.driveways.length)], x: cx + (rng()-0.5)*5, z: cz + (rng()-0.5)*5, rotY: Math.floor(rng()*4)*Math.PI/2, scale: 5.0 });
          if (rng() < 0.25) models.push({ url: '/models/suburban/planter.glb', x: cx+(rng()-0.5)*4, z: cz+(rng()-0.5)*4, rotY: rng()*Math.PI*2, scale: 4.0 });
        }

        if ((pack === 'commercial' || pack === 'skyscraper') && rng() < 0.4) {
          models.push({ url: MODELS.commercialDetails[Math.floor(rng()*MODELS.commercialDetails.length)], x: cx+(rng()-0.5)*5, z: cz+(rng()-0.5)*5, rotY: Math.floor(rng()*4)*Math.PI/2, scale: 3.5 });
        }

        if (rng() < 0.35) {
          models.push({ url: MODELS.trees[rng()>0.5?0:1], x: cx+(rng()>0.5?1:-1)*(JITTER+1+rng()*2), z: cz+(rng()-0.5)*JITTER, rotY: rng()*Math.PI*2, scale: 4.0+rng()*2.0 });
        }
      }
    }

    // Center park trees
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 + treeRng() * 0.8;
      const r     = 5 + treeRng() * 7;
      models.push({ url: MODELS.trees[treeRng()>0.5?0:1], x: Math.cos(angle)*r, z: Math.sin(angle)*r, rotY: treeRng()*Math.PI*2, scale: 4.5+treeRng()*2.0 });
    }

    // ── Road tiles (Kenney road pack) ─────────────────────────────────────────
    // ROAD_W=7 = tile scale. TILE/ROAD_W = 4 → between crossroads: exactly 3 straight tiles.

    const S = ROAD_W; // tile scale
    const span = gr * TILE; // half-span of entire road grid

    // Road strip centers
    const roadPos = [];
    for (let i = -gr; i < gr; i++) roadPos.push((i + 0.5) * TILE);

    // Crossroads at every (rx, rz) intersection
    for (const rx of roadPos) {
      for (const rz of roadPos) {
        models.push({ url: '/models/roads/road-crossroad-path.glb', x: rx, z: rz, rotY: 0, scale: S });
      }
    }

    // Straight tiles between crossroads and along edges
    const tileStart = -span + S / 2;
    const tileEnd   =  span - S / 2;

    for (const rz of roadPos) {
      for (let x = tileStart; x <= tileEnd + 0.001; x += S) {
        if (roadPos.some(rx => Math.abs(rx - x) < 0.1)) continue; // crossroad covers this
        models.push({ url: '/models/roads/road-straight.glb', x, z: rz, rotY: Math.PI / 2, scale: S });
      }
    }

    for (const rx of roadPos) {
      for (let z = tileStart; z <= tileEnd + 0.001; z += S) {
        if (roadPos.some(rz => Math.abs(rz - z) < 0.1)) continue;
        models.push({ url: '/models/roads/road-straight.glb', x: rx, z, rotY: 0, scale: S });
      }
    }

    // Street lights — at every other crossroad, two lamps at opposite corners
    for (let ri = 0; ri < roadPos.length; ri++) {
      for (let rj = 0; rj < roadPos.length; rj++) {
        if ((ri + rj) % 2 !== 0) continue; // every other intersection
        const rx = roadPos[ri], rz = roadPos[rj];
        models.push({ url: '/models/roads/light-square-double.glb', x: rx + S * 0.55, z: rz + S * 0.55, rotY: Math.PI * 1.25, scale: S });
        models.push({ url: '/models/roads/light-square-double.glb', x: rx - S * 0.55, z: rz - S * 0.55, rotY: Math.PI * 0.25, scale: S });
      }
    }

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

      {/* Ground — base asphalt under everything */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]}>
        <planeGeometry args={[data.citySize + 30, data.citySize + 30]} />
        <meshStandardMaterial color="#4a4e5a" roughness={1} />
      </mesh>

      {/* Sidewalk blocks between roads */}
      <BlockPaving gridR={data.gridR} />

      {/* All GLB models: buildings + road tiles + lights */}
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
