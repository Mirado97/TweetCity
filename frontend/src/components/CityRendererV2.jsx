// CityRendererV2 — city built ONLY from Kenney GLB models (no procedural geometry)
import { useMemo, useState, Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import { cityLevel } from "./CityRenderer";

function mkRng(seed) {
  let s = ((seed >>> 0) || 1337);
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 0xffffffff; };
}

const MODELS = {
  skyscraper: ['a','b','c','d','e'].map(l => `/models/commercial/building-skyscraper-${l}.glb`),
  commercial: ['a','b','c','d','e','f','g','h','i','j','k','l','m','n'].map(l => `/models/commercial/building-${l}.glb`),
  industrial: ['a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p','q','r','s','t'].map(l => `/models/industrial/building-${l}.glb`),
  suburban:   ['a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p','q','r','s','t','u'].map(l => `/models/suburban/building-type-${l}.glb`),
  props:      ['chimney-basic','chimney-medium','chimney-small','detail-tank'].map(n => `/models/industrial/${n}.glb`),
  trees:      ['/models/suburban/tree-large.glb', '/models/suburban/tree-small.glb'],
};

const TILE  = 9;   // distance between building centers
const SCALE = 3.0; // uniform building scale

function GlbModel({ url, position, rotY = 0, scale = 1 }) {
  const { scene } = useGLTF(url);
  const clone = useMemo(() => scene.clone(true), [scene]);
  return <primitive object={clone} position={position} rotation={[0, rotY, 0]} scale={scale} />;
}

function V2Scene({ metrics, tokenId }) {
  const { followers = 0 } = metrics;

  const data = useMemo(() => {
    const seed    = (((tokenId | 0) * 9973) + (followers | 0)) >>> 0;
    const rng     = mkRng(seed);
    const treeRng = mkRng(seed + 1);

    const level = cityLevel(followers);
    const gridR = level >= 9 ? 5 : level >= 7 ? 4 : level >= 5 ? 3 : level >= 3 ? 2 : level >= 1 ? 1 : 0;

    const models = [];

    // Tile grid — one building per cell, zone determines model pack
    for (let row = -gridR; row <= gridR; row++) {
      for (let col = -gridR; col <= gridR; col++) {
        if (row === 0 && col === 0) continue; // center reserved for trees

        const zone = Math.max(Math.abs(row), Math.abs(col));
        const x = col * TILE;
        const z = row * TILE;

        const isSky  = zone <= 1 && level >= 6;
        const isHigh = zone <= 2 && level >= 4;
        const isMid  = zone <= gridR - 1;
        const pack   = isSky ? 'skyscraper' : isHigh ? 'commercial' : isMid ? 'industrial' : 'suburban';
        const list   = MODELS[pack];

        models.push({
          url:   list[Math.floor(rng() * list.length)],
          x, z,
          rotY:  Math.floor(rng() * 4) * Math.PI / 2,
          scale: isSky ? 4.5 : SCALE,
        });

        // Industrial zone: 30% chance of a chimney or tank prop nearby
        if (pack === 'industrial' && rng() < 0.3) {
          models.push({
            url:   MODELS.props[Math.floor(rng() * MODELS.props.length)],
            x:     x + (rng() - 0.5) * 5,
            z:     z + (rng() - 0.5) * 5,
            rotY:  rng() * Math.PI * 2,
            scale: 2.0,
          });
        }
      }
    }

    // Trees (GLB) around center park
    const numTrees = 6 + gridR * 4;
    for (let i = 0; i < numTrees; i++) {
      const angle = (i / numTrees) * Math.PI * 2 + treeRng() * 0.5;
      const r = 2.5 + treeRng() * 2;
      models.push({
        url:   MODELS.trees[treeRng() > 0.5 ? 0 : 1],
        x:     Math.cos(angle) * r,
        z:     Math.sin(angle) * r,
        rotY:  treeRng() * Math.PI * 2,
        scale: 1.5 + treeRng() * 1.0,
      });
    }

    const citySize = (2 * Math.max(gridR, 1) + 1) * TILE + 24;
    return { models, citySize, gridR };
  }, [followers, tokenId]);

  return (
    <>
      <color attach="background" args={["#9aaabb"]} />
      <fog attach="fog" args={["#9aaabb", 80, 220]} />
      <ambientLight intensity={1.6} />
      <directionalLight position={[20, 28, 15]} intensity={1.4} />
      <directionalLight position={[-10, 15, -10]} intensity={0.4} color="#aaccff" />
      <hemisphereLight args={["#c8d8f0", "#223311", 0.5]} />

      {/* Simple ground plane — dark asphalt */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]}>
        <planeGeometry args={[data.citySize + 30, data.citySize + 30]} />
        <meshStandardMaterial color="#2a2a2a" roughness={1} />
      </mesh>

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

function camPos(followers) {
  const level = cityLevel(followers);
  const gridR = level >= 9 ? 5 : level >= 7 ? 4 : level >= 5 ? 3 : level >= 3 ? 2 : level >= 1 ? 1 : 0;
  const d = 32 + gridR * 14;
  return [d, d * 0.75, d];
}

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
