import { useMemo, useState, Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";

function mkRng(seed) {
  let s = ((seed >>> 0) || 1337);
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 0xffffffff; };
}

function degreen(hex) {
  if (!hex || hex.length < 7) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  if (g > r * 1.3 && g > b * 1.3 && g > 70) {
    const nr = Math.min(255, r + Math.floor((g - r) * 0.5));
    const ng = Math.floor(g * 0.45);
    const nb = Math.min(255, b + Math.floor((g - b) * 0.5));
    return `#${nr.toString(16).padStart(2, "0")}${ng.toString(16).padStart(2, "0")}${nb.toString(16).padStart(2, "0")}`;
  }
  return hex;
}

const STYLE_CFG = {
  Cyberpunk:      { sky: "#aac0e8", ambI: 1.2, dirI: 1.2 },
  "Eco-Futurism": { sky: "#87ceeb", ambI: 1.3, dirI: 1.4 },
  Medieval:       { sky: "#c8d0b8", ambI: 1.2, dirI: 1.3 },
  Brutalist:      { sky: "#b8c0c8", ambI: 1.2, dirI: 1.2 },
  Minimalist:     { sky: "#e8f0f8", ambI: 1.4, dirI: 1.2 },
  Baroque:        { sky: "#d8c890", ambI: 1.2, dirI: 1.3 },
  "Bio-Punk":     { sky: "#90d8b0", ambI: 1.3, dirI: 1.1 },
};

export const LEVEL_NAMES = [
  "Hamlet", "Village", "Borough", "Town", "Township",
  "City", "Metropolis", "Megalopolis", "Megacity", "World Capital",
];
export const LEVEL_THRESHOLDS = [0, 50, 250, 1000, 3000, 10000, 30000, 100000, 300000, 1000000];
export function cityLevel(followers) {
  let l = 0;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) if (followers >= LEVEL_THRESHOLDS[i]) l = i;
  return l;
}

const GROUND_COLOR = "#3a8a30";
const PARK_COLOR   = "#4aaa3a";
const ROAD_COLOR   = "#1e1e1e";

const BLOCK = 16;
const ROAD  = 4;
const STEP  = BLOCK + ROAD;

// GLB model lists per zone type
const MODELS = {
  skyscraper: ['a','b','c','d','e'].map(l => `/models/commercial/building-skyscraper-${l}.glb`),
  commercial: ['a','b','c','d','e','f','g','h','i','j','k','l','m','n'].map(l => `/models/commercial/building-${l}.glb`),
  industrial: ['a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p','q','r','s','t'].map(l => `/models/industrial/building-${l}.glb`),
  suburban:   ['a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p','q','r','s','t','u'].map(l => `/models/suburban/building-type-${l}.glb`),
  props:      ['chimney-basic','chimney-medium','chimney-small','detail-tank'].map(n => `/models/industrial/${n}.glb`),
};

// All models at the same scale — Kenney tiles are designed to be uniform
const ZONE_SCALE = { sky: 3.5, high: 3.0, mid: 3.0, residential: 3.0 };
// Landmark scale per gridR (0-5) — modest, not crazy tall
const LM_SCALE   = [0, 5, 6, 7, 8, 9];

// ─── Geometry primitives ────────────────────────────────────────────────────

function Ground({ size }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
      <planeGeometry args={[size, size]} />
      <meshStandardMaterial color={GROUND_COLOR} roughness={0.9} />
    </mesh>
  );
}

function RoadStrip({ x, z, len, horiz }) {
  return (
    <mesh position={[x, 0.01, z]} rotation={[-Math.PI / 2, 0, horiz ? 0 : Math.PI / 2]}>
      <planeGeometry args={[len, ROAD]} />
      <meshStandardMaterial color={ROAD_COLOR} roughness={1} />
    </mesh>
  );
}

function ParkTile() {
  return (
    <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[BLOCK, BLOCK]} />
      <meshStandardMaterial color={PARK_COLOR} roughness={0.9} />
    </mesh>
  );
}

// ─── Statues (procedural — unique art, one per gridR level) ─────────────────

function StoneObelisk() {
  const stone = { color: "#999999", roughness: 0.88 };
  return (
    <group>
      <mesh position={[0, 0.15, 0]}>
        <boxGeometry args={[2, 0.3, 2]} />
        <meshStandardMaterial {...stone} />
      </mesh>
      <mesh position={[0, 2.1, 0]}>
        <boxGeometry args={[0.72, 3.7, 0.72]} />
        <meshStandardMaterial {...stone} />
      </mesh>
      <mesh position={[0, 4.35, 0]}>
        <boxGeometry args={[0.46, 1.2, 0.46]} />
        <meshStandardMaterial {...stone} />
      </mesh>
      <mesh position={[0, 5.2, 0]}>
        <coneGeometry args={[0.34, 0.85, 4]} />
        <meshStandardMaterial color="#bbbbbb" roughness={0.65} metalness={0.2} />
      </mesh>
    </group>
  );
}

function TorchColumn() {
  return (
    <group>
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[1.9, 2.1, 0.4, 8]} />
        <meshStandardMaterial color="#aaaaaa" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.55, 0]}>
        <boxGeometry args={[1.4, 0.3, 1.4]} />
        <meshStandardMaterial color="#aaaaaa" roughness={0.9} />
      </mesh>
      <mesh position={[0, 3.5, 0]}>
        <cylinderGeometry args={[0.34, 0.44, 5.4, 8]} />
        <meshStandardMaterial color="#cccccc" roughness={0.8} />
      </mesh>
      <mesh position={[0, 6.5, 0]}>
        <cylinderGeometry args={[0.72, 0.34, 0.4, 8]} />
        <meshStandardMaterial color="#cccccc" roughness={0.75} />
      </mesh>
      <mesh position={[0, 7.0, 0]}>
        <cylinderGeometry args={[0.5, 0.38, 0.55, 8]} />
        <meshStandardMaterial color="#888888" roughness={0.6} />
      </mesh>
      <mesh position={[0, 7.9, 0]}>
        <coneGeometry args={[0.38, 1.6, 6]} />
        <meshStandardMaterial color="#ff8800" emissive="#ff4400" emissiveIntensity={1.8} roughness={0.4} />
      </mesh>
      <pointLight position={[0, 7.8, 0]} color="#ff8800" intensity={4} distance={22} decay={2} />
    </group>
  );
}

function TriumphArch() {
  const stone  = { color: "#c8c4b0", roughness: 0.88, metalness: 0.08 };
  const bright = { color: "#dddacc", roughness: 0.72, metalness: 0.12 };
  return (
    <group scale={1.15}>
      <mesh position={[-2.3, 0.45, 0]}>
        <boxGeometry args={[1.9, 0.9, 1.5]} />
        <meshStandardMaterial {...stone} />
      </mesh>
      <mesh position={[ 2.3, 0.45, 0]}>
        <boxGeometry args={[1.9, 0.9, 1.5]} />
        <meshStandardMaterial {...stone} />
      </mesh>
      <mesh position={[-2.3, 4.2, 0]}>
        <boxGeometry args={[1.6, 6.6, 1.3]} />
        <meshStandardMaterial {...stone} />
      </mesh>
      <mesh position={[ 2.3, 4.2, 0]}>
        <boxGeometry args={[1.6, 6.6, 1.3]} />
        <meshStandardMaterial {...stone} />
      </mesh>
      <mesh position={[-1.2, 8.0, 0]} rotation={[0, 0,  Math.PI / 4.5]}>
        <boxGeometry args={[0.5, 1.8, 1.2]} />
        <meshStandardMaterial {...bright} />
      </mesh>
      <mesh position={[ 1.2, 8.0, 0]} rotation={[0, 0, -Math.PI / 4.5]}>
        <boxGeometry args={[0.5, 1.8, 1.2]} />
        <meshStandardMaterial {...bright} />
      </mesh>
      <mesh position={[0, 8.8, 0]}>
        <boxGeometry args={[0.9, 0.55, 1.2]} />
        <meshStandardMaterial color="#eeead8" roughness={0.65} metalness={0.15} />
      </mesh>
      <mesh position={[0, 9.4, 0]}>
        <boxGeometry args={[6.5, 0.95, 1.4]} />
        <meshStandardMaterial {...stone} />
      </mesh>
      <mesh position={[0, 10.15, 0]}>
        <boxGeometry args={[6.0, 0.6, 1.3]} />
        <meshStandardMaterial {...bright} />
      </mesh>
      <mesh position={[0, 10.65, 0]}>
        <boxGeometry args={[5.5, 0.4, 1.2]} />
        <meshStandardMaterial {...stone} />
      </mesh>
      <mesh position={[0, 11.1, 0]}>
        <sphereGeometry args={[0.62, 9, 9]} />
        <meshStandardMaterial color="#e8d890" emissive="#aa9900" emissiveIntensity={0.7} roughness={0.35} metalness={0.65} />
      </mesh>
      <pointLight position={[0, 11.2, 0]} color="#ffdd44" intensity={3} distance={24} decay={2} />
    </group>
  );
}

function Colossus() {
  const metal = { color: "#aaaaaa", roughness: 0.55, metalness: 0.45 };
  const RA = (11 * Math.PI) / 12;
  const LA = -Math.PI / 8;
  return (
    <group scale={1.3}>
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[4.2, 1.0, 4.2]} />
        <meshStandardMaterial color="#888" roughness={0.92} />
      </mesh>
      <mesh position={[0, 1.1, 0]}>
        <boxGeometry args={[2.8, 0.2, 2.8]} />
        <meshStandardMaterial color="#999" roughness={0.88} />
      </mesh>
      <mesh position={[-0.52, 2.8, 0]}>
        <boxGeometry args={[0.78, 3.2, 0.72]} />
        <meshStandardMaterial {...metal} />
      </mesh>
      <mesh position={[ 0.52, 2.8, 0]}>
        <boxGeometry args={[0.78, 3.2, 0.72]} />
        <meshStandardMaterial {...metal} />
      </mesh>
      <mesh position={[0, 4.25, 0]}>
        <boxGeometry args={[1.45, 0.5, 0.72]} />
        <meshStandardMaterial {...metal} />
      </mesh>
      <mesh position={[0, 5.7, 0]}>
        <boxGeometry args={[1.6, 3.0, 0.82]} />
        <meshStandardMaterial {...metal} />
      </mesh>
      <mesh position={[0, 7.1, 0]}>
        <boxGeometry args={[2.1, 0.6, 0.85]} />
        <meshStandardMaterial {...metal} />
      </mesh>
      <mesh position={[0, 7.7, 0]}>
        <boxGeometry args={[0.5, 0.6, 0.46]} />
        <meshStandardMaterial {...metal} />
      </mesh>
      <mesh position={[0, 8.5, 0]}>
        <sphereGeometry args={[0.68, 10, 10]} />
        <meshStandardMaterial color="#c0bba8" roughness={0.6} metalness={0.25} />
      </mesh>
      <group position={[-1.0, 7.1, 0]} rotation={[0, 0, LA]}>
        <mesh position={[0, -1.2, 0]}>
          <boxGeometry args={[0.62, 2.4, 0.58]} />
          <meshStandardMaterial {...metal} />
        </mesh>
      </group>
      <group position={[1.0, 7.1, 0]} rotation={[0, 0, RA]}>
        <mesh position={[0, -1.2, 0]}>
          <boxGeometry args={[0.62, 2.4, 0.58]} />
          <meshStandardMaterial {...metal} />
        </mesh>
        <mesh position={[0, -2.8, 0]}>
          <sphereGeometry args={[0.52, 12, 12]} />
          <meshStandardMaterial color="#88ccff" emissive="#4499ff" emissiveIntensity={3.0} roughness={0.1} metalness={0.9} />
        </mesh>
        <pointLight position={[0, -2.8, 0]} color="#4499ff" intensity={8} distance={38} decay={2} />
      </group>
      {Array.from({ length: 7 }, (_, i) => {
        const a = (i / 7) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(a) * 0.5, 9.0, Math.sin(a) * 0.5]}>
            <boxGeometry args={[0.14, 0.58, 0.14]} />
            <meshStandardMaterial color="#ffdd44" emissive="#ffaa00" emissiveIntensity={1.5} roughness={0.3} metalness={0.8} />
          </mesh>
        );
      })}
      <pointLight position={[0, 9.5, 0]} color="#ffdd44" intensity={4} distance={26} decay={2} />
    </group>
  );
}

function Statue({ gridR }) {
  if (gridR === 0) return <StoneObelisk />;
  if (gridR === 1) return <TorchColumn />;
  if (gridR === 2) return <TriumphArch />;
  return <Colossus />;
}

// ─── GLB building component ─────────────────────────────────────────────────

function GlbBuilding({ url, position, rotY = 0, scale = 1 }) {
  const { scene } = useGLTF(url);
  const clone = useMemo(() => scene.clone(true), [scene]);
  return (
    <primitive
      object={clone}
      position={[position[0], 0, position[1]]}
      rotation={[0, rotY, 0]}
      scale={scale}
    />
  );
}

// ─── Park vegetation & lighting ──────────────────────────────────────────────

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

// ─── POI Components ──────────────────────────────────────────────────────────

function Pond() {
  const sw = BLOCK - 3, sd = BLOCK - 4;
  return (
    <group>
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[sw, sd]} />
        <meshStandardMaterial color="#b8a060" roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.09, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[sw - 3, sd - 3]} />
        <meshStandardMaterial color="#1a6090" roughness={0.06} metalness={0.35} />
      </mesh>
      {[[-3.5, -3.5], [3.5, 3.5], [-3.5, 3.5], [3.5, -3.5]].map(([rx, rz], i) => (
        <mesh key={i} position={[rx, 0.8 + i * 0.15, rz]}>
          <cylinderGeometry args={[0.08, 0.13, 1.6 + i * 0.25, 5]} />
          <meshStandardMaterial color="#5a8a30" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

function Cinema({ accent }) {
  const cw = BLOCK - 2, cd = BLOCK * 0.55;
  return (
    <group>
      <mesh position={[0, 3.5, 0]}>
        <boxGeometry args={[cw, 7, cd]} />
        <meshStandardMaterial color="#252535" roughness={0.7} />
      </mesh>
      <mesh position={[0, 7.5, cd / 2 + 0.12]}>
        <boxGeometry args={[cw - 1.5, 1.8, 0.18]} />
        <meshStandardMaterial color="#060608" emissive={accent} emissiveIntensity={5} roughness={0.05} />
      </mesh>
      {[-3, 0, 3].map((ox, i) => (
        <mesh key={i} position={[ox, 1.5, cd / 2 + 0.12]}>
          <boxGeometry args={[1.2, 3, 0.14]} />
          <meshStandardMaterial color="#0a0a14" emissive={accent} emissiveIntensity={1.2} roughness={0.2} />
        </mesh>
      ))}
      <mesh position={[0, 2.4, cd / 2 + 1.3]}>
        <boxGeometry args={[6, 0.2, 2.6]} />
        <meshStandardMaterial color="#1a1a28" roughness={0.5} metalness={0.55} />
      </mesh>
      <pointLight position={[0, 7.6, cd / 2 + 0.6]} color={accent} intensity={4} distance={22} decay={2} />
    </group>
  );
}

function Market({ primary }) {
  const spots = [[-4, -4], [-4, 0], [-4, 4], [0, -4], [0, 4], [4, -4], [4, 0], [4, 4]];
  return (
    <group>
      {spots.map(([sx, sz], i) => (
        <group key={i} position={[sx, 0, sz]}>
          <mesh position={[0, 0.75, 0]}>
            <cylinderGeometry args={[0.1, 0.1, 1.5, 5]} />
            <meshStandardMaterial color="#666" roughness={0.6} metalness={0.4} />
          </mesh>
          <mesh position={[0, 2.15, 0]} rotation={[-0.12, 0, 0]}>
            <boxGeometry args={[3.0, 0.14, 3.0]} />
            <meshStandardMaterial color={i % 2 === 0 ? primary : "#cc3322"} roughness={0.6} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[3, BLOCK - 2]} />
        <meshStandardMaterial color="#c0aa80" roughness={0.9} />
      </mesh>
    </group>
  );
}

// ─── Gift visual objects ──────────────────────────────────────────────────────

function GiftWallArt({ pos, seed, large = false }) {
  const COLORS = ["#ff00cc", "#00ffee", "#ff8800", "#44ff22", "#ff2266", "#aa44ff"];
  const color  = COLORS[seed % COLORS.length];
  const w = large ? 3.2 : 1.8;
  const h = large ? 1.6 : 0.9;
  return (
    <group position={pos}>
      <mesh>
        <boxGeometry args={[w, h, 0.12]} />
        <meshStandardMaterial color="#0a0a0a" emissive={color} emissiveIntensity={4} roughness={0.08} />
      </mesh>
      <mesh position={[0, 0, -0.04]}>
        <boxGeometry args={[w + 0.18, h + 0.18, 0.08]} />
        <meshStandardMaterial color="#222" roughness={0.5} metalness={0.6} />
      </mesh>
    </group>
  );
}

function GiftFlag({ pos, seed }) {
  const COLORS = ["#dd2200", "#0055dd", "#ffaa00", "#00cc55", "#aa00dd"];
  const color  = COLORS[seed % COLORS.length];
  return (
    <group position={pos}>
      <mesh position={[0, 4.5, 0]}>
        <cylinderGeometry args={[0.07, 0.07, 9, 5]} />
        <meshStandardMaterial color="#999" roughness={0.5} metalness={0.7} />
      </mesh>
      <mesh position={[1.0, 8.0, 0]}>
        <boxGeometry args={[2.0, 0.85, 0.07]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
    </group>
  );
}

function GiftBillboard({ pos, seed }) {
  const COLORS = ["#ff00cc", "#00ffee", "#ffaa00", "#ff2266", "#44aaff"];
  const color  = COLORS[seed % COLORS.length];
  return (
    <group position={pos}>
      <mesh position={[0, 4, 0]}>
        <cylinderGeometry args={[0.12, 0.12, 8, 6]} />
        <meshStandardMaterial color="#555" roughness={0.6} metalness={0.8} />
      </mesh>
      <mesh position={[0, 8.2, 0]}>
        <boxGeometry args={[4.0, 1.8, 0.22]} />
        <meshStandardMaterial color="#0a0a0a" emissive={color} emissiveIntensity={5} roughness={0.05} />
      </mesh>
      <pointLight position={[0, 8.2, 0.5]} color={color} intensity={4} distance={18} decay={2} />
    </group>
  );
}

function GiftMonument({ pos, seed }) {
  const t = seed % 3;
  const mat = { roughness: 0.05, metalness: 0.9 };
  if (t === 0) {
    return (
      <group position={pos}>
        <mesh position={[0, 0.6, 0]}><boxGeometry args={[1.6, 1.2, 1.6]} /><meshStandardMaterial color="#888" roughness={0.9} /></mesh>
        <mesh position={[0, 1.7, 0]}><boxGeometry args={[0.1, 0.6, 0.1]} /><meshStandardMaterial color="#aaa" roughness={0.5} /></mesh>
        <mesh position={[0, 2.2, 0]}>
          <sphereGeometry args={[0.75, 12, 12]} />
          <meshStandardMaterial color="#ffcc44" emissive="#aa8800" emissiveIntensity={1.2} {...mat} />
        </mesh>
        <pointLight position={[0, 2.2, 0]} color="#ffcc44" intensity={5} distance={14} decay={2} />
      </group>
    );
  }
  if (t === 1) {
    return (
      <group position={pos}>
        <mesh position={[0, 0.6, 0]}><boxGeometry args={[1.4, 1.2, 1.4]} /><meshStandardMaterial color="#888" roughness={0.9} /></mesh>
        <mesh position={[0, 2.1, 0]} rotation={[0, Math.PI / 4, 0]}>
          <octahedronGeometry args={[0.88]} />
          <meshStandardMaterial color="#44ccff" emissive="#0077ff" emissiveIntensity={2} {...mat} />
        </mesh>
        <pointLight position={[0, 2.1, 0]} color="#44ccff" intensity={5} distance={16} decay={2} />
      </group>
    );
  }
  return (
    <group position={pos}>
      <mesh position={[0, 0.6, 0]}><boxGeometry args={[1.5, 1.2, 1.5]} /><meshStandardMaterial color="#888" roughness={0.9} /></mesh>
      {[0, Math.PI / 3, (2 * Math.PI) / 3].map((rot, i) => (
        <mesh key={i} position={[0, 2.1, 0]} rotation={[0, rot, 0]}>
          <boxGeometry args={[1.6, 0.28, 0.28]} />
          <meshStandardMaterial color="#ff8800" emissive="#ff4400" emissiveIntensity={2.5} roughness={0.1} metalness={0.8} />
        </mesh>
      ))}
      <pointLight position={[0, 2.1, 0]} color="#ff8800" intensity={4} distance={14} decay={2} />
    </group>
  );
}

const GIFT_SLOTS = {
  0: [[-7.5, 0.45, 0], [7.5, 0.45, 0], [0, 0.45, -7.5], [0, 0.45, 7.5]],
  1: [[-7.5, 1.2, 0], [7.5, 1.2, 0], [0, 1.2, -7.5], [0, 1.2, 7.5]],
  2: [[6, 0, 6], [-6, 0, 6], [6, 0, -6], [-6, 0, -6]],
  3: [[5, 0, -5], [-5, 0, -5], [5, 0, 5], [-5, 0, 5]],
  4: [[3.5, 0, 0], [-3.5, 0, 0], [0, 0, 3.5], [0, 0, -3.5]],
};

function GiftObjects({ gifts }) {
  if (!gifts || gifts.length === 0) return null;
  const typeCount = [0, 0, 0, 0, 0, 0];
  return gifts.map((gift) => {
    const t   = Number(gift.giftType);
    const idx = typeCount[t] % 4;
    typeCount[t]++;
    const slots = GIFT_SLOTS[t];
    if (!slots) return null;
    const pos  = slots[idx];
    const seed = Number(gift.id ?? 0);
    if (t === 0) return <GiftWallArt  key={gift.id} pos={pos} seed={seed} large={false} />;
    if (t === 1) return <GiftWallArt  key={gift.id} pos={pos} seed={seed} large={true}  />;
    if (t === 2) return <GiftFlag     key={gift.id} pos={pos} seed={seed} />;
    if (t === 3) return <GiftBillboard key={gift.id} pos={pos} seed={seed} />;
    if (t === 4) return <GiftMonument  key={gift.id} pos={pos} seed={seed} />;
    return null;
  });
}

// ─── City scene ──────────────────────────────────────────────────────────────

function CityScene({ metrics, style, colorPalette, tokenId, gifts = [] }) {
  const { followers = 0, tweetCount = 0, following = 0 } = metrics;
  const cfg    = STYLE_CFG[style] || STYLE_CFG.Cyberpunk;
  const accent = colorPalette?.accent || "#00ccff";

  const data = useMemo(() => {
    const seed     = (((tokenId | 0) * 9973) + (followers | 0)) >>> 0;
    const rng      = mkRng(seed);
    const buildRng = mkRng(seed + 11111);  // model & rotation selection
    const lmRng    = mkRng(seed + 33333);  // landmark selection
    const poiRng   = mkRng(seed + 55555);
    const treeRng  = mkRng(seed + 1);

    const level = cityLevel(followers);
    const gridR = level >= 9 ? 5 : level >= 7 ? 4 : level >= 5 ? 3 : level >= 3 ? 2 : level >= 1 ? 1 : 0;

    const blockOffsets = [];
    if (gridR === 0) {
      for (const row of [-1, 1])
        for (const col of [-1, 1])
          blockOffsets.push({ bx: col * STEP, bz: row * STEP, zone: 1 });
    } else {
      for (let row = -gridR; row <= gridR; row++)
        for (let col = -gridR; col <= gridR; col++)
          if (!(row === 0 && col === 0))
            blockOffsets.push({ bx: col * STEP, bz: row * STEP, zone: Math.max(Math.abs(row), Math.abs(col)) });
    }

    const poiChance  = [0, 0, 0.06, 0.08, 0.10, 0.12, 0.14, 0.16, 0.18, 0.22][level];
    const poiBlocks  = new Set(
      blockOffsets.map((_, i) => (level >= 2 && poiRng() < poiChance ? i : -1)).filter(i => i >= 0)
    );
    const poiTypeRng = mkRng(seed + 66666);

    const buildings = [];
    const pois      = [];

    // Tile-based: one Kenney model centered per block, no collision logic
    blockOffsets.forEach(({ bx, bz, zone }, idx) => {
      if (poiBlocks.has(idx)) {
        const pt = poiTypeRng();
        pois.push({ bx, bz, type: pt < 0.35 ? "pond" : pt < 0.65 ? "cinema" : "market" });
        return;
      }

      const isSkyZone  = zone <= 1 && level >= 6;
      const isHighZone = zone <= 2 && level >= 4;
      const isMidZone  = zone <= gridR - 1;
      const category   = isSkyZone ? 'sky' : isHighZone ? 'high' : isMidZone ? 'mid' : 'residential';
      const modelKey   = category === 'sky' ? 'skyscraper' : category === 'high' ? 'commercial' : category === 'mid' ? 'industrial' : 'suburban';

      const url  = MODELS[modelKey][Math.floor(buildRng() * MODELS[modelKey].length)];
      const rotY = Math.floor(buildRng() * 4) * Math.PI / 2;
      buildings.push({ pos: [bx, bz], url, rotY, scale: ZONE_SCALE[category] });

      // Industrial zone: add a random prop (chimney/tank) nearby at 30% chance
      if (category === 'mid' && buildRng() < 0.3) {
        const propUrl = MODELS.props[Math.floor(buildRng() * MODELS.props.length)];
        const offX = (buildRng() - 0.5) * BLOCK * 0.6;
        const offZ = (buildRng() - 0.5) * BLOCK * 0.6;
        buildings.push({ pos: [bx + offX, bz + offZ], url: propUrl, rotY: buildRng() * Math.PI * 2, scale: 2.5 });
      }
    });

    // Landmark: tallest skyscraper near center — at gridR 1+ only
    const landmarks = [];
    if (gridR >= 1) {
      const lmScale = LM_SCALE[gridR];
      const lmUrl   = MODELS.skyscraper[Math.floor(lmRng() * MODELS.skyscraper.length)];
      landmarks.push({ pos: [STEP, STEP], url: lmUrl, rotY: Math.floor(lmRng() * 4) * Math.PI / 2, scale: lmScale });
      if (gridR >= 3) {
        [[-STEP, STEP], [STEP, -STEP], [-STEP, -STEP]].forEach(p => {
          const url = MODELS.skyscraper[Math.floor(lmRng() * MODELS.skyscraper.length)];
          landmarks.push({ pos: p, url, rotY: Math.floor(lmRng() * 4) * Math.PI / 2, scale: lmScale * 0.72 });
        });
      }
    }

    const gr = Math.max(gridR, 1);
    const totalSize = (2 * gr + 1) * BLOCK + 2 * gr * ROAD + 10;
    const roadCenters = [];
    const roads = [];
    for (let i = -gr; i < gr; i++) {
      const t = (i + 0.5) * STEP;
      roadCenters.push(t);
      roads.push({ x: t, z: 0, len: totalSize, horiz: false });
      roads.push({ x: 0, z: t, len: totalSize, horiz: true });
    }
    const isOnRoad = (x, z) =>
      roadCenters.some(rc => Math.abs(x - rc) <= ROAD / 2 + 0.3) ||
      roadCenters.some(rc => Math.abs(z - rc) <= ROAD / 2 + 0.3);

    const numParkTrees = Math.min(8 + Math.floor(following / 30), 60);
    const trees = [];
    for (let i = 0; i < numParkTrees; i++) {
      const angle = (i / numParkTrees) * Math.PI * 2 + treeRng() * 0.4;
      const r     = 5 + treeRng() * 2.5;
      trees.push({ pos: [Math.cos(angle) * r, 0, Math.sin(angle) * r], s: 0.7 + treeRng() * 0.5 });
    }

    const sidewalk = ROAD / 2 + 1.8;
    const spacing  = tweetCount >= 1000 ? 9 : tweetCount >= 100 ? 12 : 16;
    const halfLen  = totalSize / 2;
    const lanterns = [];
    roadCenters.forEach(rc => {
      let side = 1;
      for (let z = -halfLen + spacing / 2; z <= halfLen; z += spacing, side *= -1) {
        const lx = rc + sidewalk * side;
        if (!isOnRoad(lx, z)) lanterns.push([lx, 0, z]);
      }
      side = 1;
      for (let x = -halfLen + spacing / 2; x <= halfLen; x += spacing, side *= -1) {
        const lz = rc + sidewalk * side;
        if (!isOnRoad(x, lz)) lanterns.push([x, 0, lz]);
      }
    });

    return { buildings, landmarks, roads, trees, lanterns, totalSize, gridR, pois };
  }, [followers, tweetCount, following, tokenId]);

  return (
    <>
      <color attach="background" args={[cfg.sky]} />
      <fog attach="fog" args={[cfg.sky, 80, 240]} />

      <ambientLight intensity={cfg.ambI} />
      <directionalLight position={[25, 35, 20]} intensity={cfg.dirI} />
      <directionalLight position={[-15, 20, -10]} intensity={cfg.dirI * 0.3} color={accent} />
      <hemisphereLight args={[cfg.sky, GROUND_COLOR, 0.5]} />

      <Ground size={data.totalSize + 40} />
      {data.roads.map((r, i) => <RoadStrip key={i} {...r} />)}

      <ParkTile />
      <Statue gridR={data.gridR} />

      {data.buildings.map((b, i) => (
        <GlbBuilding key={`b${i}`} url={b.url} position={b.pos} rotY={b.rotY} scale={b.scale} />
      ))}
      {data.landmarks.map((b, i) => (
        <GlbBuilding key={`lm${i}`} url={b.url} position={b.pos} rotY={b.rotY} scale={b.scale} />
      ))}

      {data.trees.map((t, i) => <Tree key={i} pos={t.pos} s={t.s} />)}
      {data.lanterns.map((p, i) => <Lantern key={i} pos={p} />)}

      {data.pois.map(({ bx, bz, type }, i) => (
        <group key={`poi${i}`} position={[bx, 0, bz]}>
          {type === "pond"   && <Pond />}
          {type === "cinema" && <Cinema accent={accent} />}
          {type === "market" && <Market primary={degreen(colorPalette?.primary || "#2255aa")} />}
        </group>
      ))}

      <GiftObjects gifts={gifts} />
    </>
  );
}

function camPos(followers) {
  const level = cityLevel(followers);
  const gridR = level >= 9 ? 5 : level >= 7 ? 4 : level >= 5 ? 3 : level >= 3 ? 2 : level >= 1 ? 1 : 0;
  const d = 28 + gridR * 18;
  return [d, d * 0.72, d];
}

// ─── Public component ────────────────────────────────────────────────────────

export default function CityRenderer({ city, tokenId, gifts = [] }) {
  const [open, setOpen] = useState(false);

  const {
    style        = "Cyberpunk",
    colorPalette = { primary: "#2255aa", secondary: "#1a3377", accent: "#00ccff" },
    followers = 0, tweetCount = 0, following = 0, engagement = 0,
  } = city || {};

  const metrics    = { followers, tweetCount, following, engagement };
  const sceneProps = { metrics, style, colorPalette, tokenId: tokenId || 0, gifts };
  const cp         = camPos(followers);

  return (
    <>
      <div
        style={{ width: 600, height: 320, borderRadius: 12, overflow: "hidden", cursor: "pointer", position: "relative" }}
        onClick={() => setOpen(true)}
      >
        <Canvas camera={{ position: cp, fov: 45 }}>
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
            <Canvas camera={{ position: [cp[0] * 1.1, cp[1] * 1.1, cp[2] * 1.1], fov: 42 }}>
              <Suspense fallback={null}>
                <CityScene {...sceneProps} />
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
