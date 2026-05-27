import { useMemo, useState, Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";

function mkRng(seed) {
  let s = ((seed >>> 0) || 1337);
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 0xffffffff; };
}

// Rule: green is reserved for ground and vegetation. Building colors must not be green.
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

// Contrasting window color vs building
function windowContrast(hex) {
  if (!hex || hex.length < 7) return "#e8d890";
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) < 140 ? "#e8d890" : "#1a2a44";
}

const STYLE_CFG = {
  Cyberpunk:      { sky: "#aac0e8", ambI: 1.2, dirI: 1.2, winEmI: 0.35 },
  "Eco-Futurism": { sky: "#87ceeb", ambI: 1.3, dirI: 1.4, winEmI: 0.05 },
  Medieval:       { sky: "#c8d0b8", ambI: 1.2, dirI: 1.3, winEmI: 0.2  },
  Brutalist:      { sky: "#b8c0c8", ambI: 1.2, dirI: 1.2, winEmI: 0.05 },
  Minimalist:     { sky: "#e8f0f8", ambI: 1.4, dirI: 1.2, winEmI: 0.02 },
  Baroque:        { sky: "#d8c890", ambI: 1.2, dirI: 1.3, winEmI: 0.2  },
  "Bio-Punk":     { sky: "#90d8b0", ambI: 1.3, dirI: 1.1, winEmI: 0.15 },
};

// Roof decoration per style (Medieval skipped — MedTower has its own cone)
const ROOF_DECOR = {
  Cyberpunk:      "antenna",
  "Eco-Futurism": "panel",
  Baroque:        "finial",
  "Bio-Punk":     "blob",
};
const NEON_COLORS = ["#ff00cc", "#00ffee", "#ff8800", "#ff2266"];

// Ground always green. Roads always asphalt. Park always bright green.
const GROUND_COLOR = "#3a8a30";
const PARK_COLOR   = "#4aaa3a";
const ROAD_COLOR   = "#1e1e1e";

const BLOCK = 16;
const ROAD  = 4;
const STEP  = BLOCK + ROAD;

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

// ─── Statues (one per gridR level, placed in park center) ───────────────────

// gridR 0 — tiny city: plain stone obelisk
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

// gridR 1 — small city: column with eternal flame
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

// gridR 2 — large city: triumphal arch (architecturally distinct from all other levels)
function TriumphArch() {
  const stone  = { color: "#c8c4b0", roughness: 0.88, metalness: 0.08 };
  const bright = { color: "#dddacc", roughness: 0.72, metalness: 0.12 };
  return (
    <group scale={1.15}>
      {/* Base pedestals */}
      <mesh position={[-2.3, 0.45, 0]}>
        <boxGeometry args={[1.9, 0.9, 1.5]} />
        <meshStandardMaterial {...stone} />
      </mesh>
      <mesh position={[ 2.3, 0.45, 0]}>
        <boxGeometry args={[1.9, 0.9, 1.5]} />
        <meshStandardMaterial {...stone} />
      </mesh>

      {/* Pillars: y 0.9→7.5 */}
      <mesh position={[-2.3, 4.2, 0]}>
        <boxGeometry args={[1.6, 6.6, 1.3]} />
        <meshStandardMaterial {...stone} />
      </mesh>
      <mesh position={[ 2.3, 4.2, 0]}>
        <boxGeometry args={[1.6, 6.6, 1.3]} />
        <meshStandardMaterial {...stone} />
      </mesh>

      {/* Arch over opening (3-piece approximation) */}
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

      {/* Entablature */}
      <mesh position={[0, 9.4, 0]}>
        <boxGeometry args={[6.5, 0.95, 1.4]} />
        <meshStandardMaterial {...stone} />
      </mesh>

      {/* Attic */}
      <mesh position={[0, 10.15, 0]}>
        <boxGeometry args={[6.0, 0.6, 1.3]} />
        <meshStandardMaterial {...bright} />
      </mesh>
      <mesh position={[0, 10.65, 0]}>
        <boxGeometry args={[5.5, 0.4, 1.2]} />
        <meshStandardMaterial {...stone} />
      </mesh>

      {/* Top medallion */}
      <mesh position={[0, 11.1, 0]}>
        <sphereGeometry args={[0.62, 9, 9]} />
        <meshStandardMaterial color="#e8d890" emissive="#aa9900" emissiveIntensity={0.7} roughness={0.35} metalness={0.65} />
      </mesh>
      <pointLight position={[0, 11.2, 0]} color="#ffdd44" intensity={3} distance={24} decay={2} />
    </group>
  );
}

// gridR 3 — mega city: the Colossus (humanoid figure, one arm raised)
// Geometry verified analytically (pre-scale=1.3):
//   legs   y 1.2→4.4  (center 2.8)
//   torso  y 4.2→7.2  (center 5.7, w 1.6)
//   chest  y 6.8→7.4  (center 7.1, w 2.1) — wider shoulder zone
//   head   center 8.5, r 0.68, top 9.18
//   L arm  pivot [-1.0, 7.1], rot −22.5° → local [0,-1.2] → world [-1.459, 5.991] (down-left) ✓
//   R arm  pivot [+1.0, 7.1], rot +165° → local [0,-2.8] (orb) → world [1.725, 9.805] > head top ✓
function Colossus() {
  const metal = { color: "#aaaaaa", roughness: 0.55, metalness: 0.45 };
  const RA = (11 * Math.PI) / 12;  // 165° — right arm raised up-right
  const LA = -Math.PI / 8;          // −22.5° — left arm hanging outward-down

  return (
    <group scale={1.3}>
      {/* Base */}
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[4.2, 1.0, 4.2]} />
        <meshStandardMaterial color="#888" roughness={0.92} />
      </mesh>
      <mesh position={[0, 1.1, 0]}>
        <boxGeometry args={[2.8, 0.2, 2.8]} />
        <meshStandardMaterial color="#999" roughness={0.88} />
      </mesh>

      {/* Legs: y 1.2→4.4 */}
      <mesh position={[-0.52, 2.8, 0]}>
        <boxGeometry args={[0.78, 3.2, 0.72]} />
        <meshStandardMaterial {...metal} />
      </mesh>
      <mesh position={[ 0.52, 2.8, 0]}>
        <boxGeometry args={[0.78, 3.2, 0.72]} />
        <meshStandardMaterial {...metal} />
      </mesh>

      {/* Hip connector */}
      <mesh position={[0, 4.25, 0]}>
        <boxGeometry args={[1.45, 0.5, 0.72]} />
        <meshStandardMaterial {...metal} />
      </mesh>

      {/* Torso: y 4.2→7.2 */}
      <mesh position={[0, 5.7, 0]}>
        <boxGeometry args={[1.6, 3.0, 0.82]} />
        <meshStandardMaterial {...metal} />
      </mesh>

      {/* Chest — wider shoulder zone: y 6.8→7.4 */}
      <mesh position={[0, 7.1, 0]}>
        <boxGeometry args={[2.1, 0.6, 0.85]} />
        <meshStandardMaterial {...metal} />
      </mesh>

      {/* Neck */}
      <mesh position={[0, 7.7, 0]}>
        <boxGeometry args={[0.5, 0.6, 0.46]} />
        <meshStandardMaterial {...metal} />
      </mesh>

      {/* Head */}
      <mesh position={[0, 8.5, 0]}>
        <sphereGeometry args={[0.68, 10, 10]} />
        <meshStandardMaterial color="#c0bba8" roughness={0.6} metalness={0.25} />
      </mesh>

      {/* Left arm: pivot [-1.0, 7.1], rot −22.5° → hangs down-left */}
      <group position={[-1.0, 7.1, 0]} rotation={[0, 0, LA]}>
        <mesh position={[0, -1.2, 0]}>
          <boxGeometry args={[0.62, 2.4, 0.58]} />
          <meshStandardMaterial {...metal} />
        </mesh>
      </group>

      {/* Right arm: pivot [+1.0, 7.1], rot 165° → raised up-right, orb above head */}
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

      {/* Crown: 7 spikes at head top */}
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

// ─── Buildings ───────────────────────────────────────────────────────────────

// Rule: buildings are always box-shaped (no cylinders — they look like poles).
// detailed=true  (gridR 0-1, small cities):  individual window squares per floor — full detail.
// detailed=false (gridR 2-3, large cities):  thin horizontal strip per floor — 1 mesh instead of ~40,
//   keeps the city smooth to rotate and zoom.
function Building({ pos, w, d, h, color, accent, winEmI, prestige = 0.25, detailed = true, roofStyle = null, neonColor = null }) {
  const winColor = windowContrast(color);
  const floors   = Math.min(12, Math.max(2, Math.floor(h / 2.2)));
  const floorH   = h / floors;

  let windowEls;
  if (detailed) {
    const nWinX = Math.max(1, Math.min(4, Math.round(w / 1.1)));
    const nWinZ = Math.max(1, Math.min(4, Math.round(d / 1.1)));
    const wW = 0.30, wH = 0.25, wD = 0.06;
    windowEls = [];
    for (let f = 0; f < floors; f++) {
      const wy = floorH * (f + 0.5);
      for (let j = 0; j < nWinX; j++) {
        const wx = -w / 2 + (j + 0.5) * (w / nWinX);
        windowEls.push(<mesh key={`ff${f}-${j}`} position={[wx, wy,  d / 2 + 0.02]}><boxGeometry args={[wW, wH, wD]} /><meshStandardMaterial color={winColor} emissive={accent} emissiveIntensity={winEmI * 0.5} roughness={0.15} /></mesh>);
        windowEls.push(<mesh key={`fb${f}-${j}`} position={[wx, wy, -d / 2 - 0.02]}><boxGeometry args={[wW, wH, wD]} /><meshStandardMaterial color={winColor} emissive={accent} emissiveIntensity={winEmI * 0.5} roughness={0.15} /></mesh>);
      }
      for (let j = 0; j < nWinZ; j++) {
        const wz = -d / 2 + (j + 0.5) * (d / nWinZ);
        windowEls.push(<mesh key={`fl${f}-${j}`} position={[ w / 2 + 0.02, wy, wz]}><boxGeometry args={[wD, wH, wW]} /><meshStandardMaterial color={winColor} emissive={accent} emissiveIntensity={winEmI * 0.5} roughness={0.15} /></mesh>);
        windowEls.push(<mesh key={`fr${f}-${j}`} position={[-w / 2 - 0.02, wy, wz]}><boxGeometry args={[wD, wH, wW]} /><meshStandardMaterial color={winColor} emissive={accent} emissiveIntensity={winEmI * 0.5} roughness={0.15} /></mesh>);
      }
    }
  } else {
    // Low-detail: one thin strip per floor — 1 mesh total per floor (vs ~40)
    windowEls = Array.from({ length: floors - 1 }, (_, i) => (
      <mesh key={i} position={[0, floorH * (i + 1), 0]}>
        <boxGeometry args={[w + 0.04, 0.18, d + 0.04]} />
        <meshStandardMaterial color={winColor} emissive={accent} emissiveIntensity={winEmI * 0.6} roughness={0.3} metalness={0.4} />
      </mesh>
    ));
  }

  return (
    <group position={[pos[0], 0, pos[1]]}>
      <mesh position={[0, h / 2, 0]}>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={color} roughness={0.6} metalness={prestige} />
      </mesh>
      {windowEls}
      <mesh position={[0, h + 0.4, 0]}>
        <boxGeometry args={[w * 0.7, 0.7, d * 0.7]} />
        <meshStandardMaterial color={winColor} roughness={0.5} metalness={0.4} />
      </mesh>
      {roofStyle && (
        <group position={[0, h + 0.76, 0]}>
          <RoofDecor style={roofStyle} w={w} d={d} accent={accent} />
        </group>
      )}
      {/* Neon band: all 4 sides — visible from any camera angle (Cyberpunk only) */}
      {neonColor && (
        <>
          <mesh position={[0, h * 0.45,  d / 2 + 0.07]}>
            <boxGeometry args={[w + 0.14, 0.6, 0.09]} />
            <meshStandardMaterial color="#0a0a0a" emissive={neonColor} emissiveIntensity={6} roughness={0.05} />
          </mesh>
          <mesh position={[0, h * 0.45, -d / 2 - 0.07]}>
            <boxGeometry args={[w + 0.14, 0.6, 0.09]} />
            <meshStandardMaterial color="#0a0a0a" emissive={neonColor} emissiveIntensity={6} roughness={0.05} />
          </mesh>
          <mesh position={[ w / 2 + 0.07, h * 0.45, 0]}>
            <boxGeometry args={[0.09, 0.6, d + 0.14]} />
            <meshStandardMaterial color="#0a0a0a" emissive={neonColor} emissiveIntensity={6} roughness={0.05} />
          </mesh>
          <mesh position={[-w / 2 - 0.07, h * 0.45, 0]}>
            <boxGeometry args={[0.09, 0.6, d + 0.14]} />
            <meshStandardMaterial color="#0a0a0a" emissive={neonColor} emissiveIntensity={6} roughness={0.05} />
          </mesh>
        </>
      )}
    </group>
  );
}

// Medieval tower — box + arrow slits + battlements + cone roof
function MedTower({ pos, w, h, color, accent }) {
  const slitFloors = Math.max(2, Math.floor(h / 3));
  return (
    <group position={[pos[0], 0, pos[1]]}>
      <mesh position={[0, h / 2, 0]}>
        <boxGeometry args={[w, h, w]} />
        <meshStandardMaterial color={color} roughness={0.95} />
      </mesh>
      {/* Arrow slits on all 4 faces per floor */}
      {Array.from({ length: slitFloors }, (_, f) => {
        const sy = h * ((f + 1) / (slitFloors + 1));
        return [
          <mesh key={`f${f}`} position={[0,      sy,  w / 2 + 0.02]}><boxGeometry args={[0.19, 0.58, 0.07]} /><meshStandardMaterial color="#1a1028" roughness={0.95} /></mesh>,
          <mesh key={`b${f}`} position={[0,      sy, -w / 2 - 0.02]}><boxGeometry args={[0.19, 0.58, 0.07]} /><meshStandardMaterial color="#1a1028" roughness={0.95} /></mesh>,
          <mesh key={`l${f}`} position={[-w / 2 - 0.02, sy, 0]}><boxGeometry args={[0.07, 0.58, 0.19]} /><meshStandardMaterial color="#1a1028" roughness={0.95} /></mesh>,
          <mesh key={`r${f}`} position={[ w / 2 + 0.02, sy, 0]}><boxGeometry args={[0.07, 0.58, 0.19]} /><meshStandardMaterial color="#1a1028" roughness={0.95} /></mesh>,
        ];
      })}
      {/* Battlements */}
      {[[-w*0.3,-w*0.3],[w*0.3,-w*0.3],[-w*0.3,w*0.3],[w*0.3,w*0.3]].map(([bx,bz],i) => (
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

function RoofDecor({ style, w, d, accent }) {
  if (style === "antenna") {
    return (
      <group>
        <mesh position={[0, 0.75, 0]}>
          <boxGeometry args={[0.07, 1.5, 0.07]} />
          <meshStandardMaterial color="#444" roughness={0.5} metalness={0.8} />
        </mesh>
        <mesh position={[0, 0.38, 0]} rotation={[0, 0, Math.PI / 2]}>
          <boxGeometry args={[0.55, 0.05, 0.05]} />
          <meshStandardMaterial color="#555" roughness={0.5} metalness={0.8} />
        </mesh>
        <mesh position={[0, 1.5, 0]}>
          <sphereGeometry args={[0.055, 5, 5]} />
          <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={2.5} roughness={0.1} />
        </mesh>
      </group>
    );
  }
  if (style === "finial") {
    return (
      <group>
        <mesh position={[0, 0.5, 0]}>
          <boxGeometry args={[0.08, 1.0, 0.08]} />
          <meshStandardMaterial color={accent} roughness={0.3} metalness={0.75} />
        </mesh>
        <mesh position={[0, 1.1, 0]}>
          <sphereGeometry args={[0.13, 7, 7]} />
          <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.6} roughness={0.2} metalness={0.85} />
        </mesh>
      </group>
    );
  }
  if (style === "blob") {
    return (
      <mesh position={[0, 0.28, 0]}>
        <sphereGeometry args={[0.28, 6, 5]} />
        <meshStandardMaterial color="#44cc66" emissive="#22aa44" emissiveIntensity={1.0} roughness={0.4} />
      </mesh>
    );
  }
  if (style === "panel") {
    return (
      <mesh position={[0, 0.04, 0]}>
        <boxGeometry args={[w * 0.5, 0.05, d * 0.5]} />
        <meshStandardMaterial color="#1a4a7a" roughness={0.25} metalness={0.7} />
      </mesh>
    );
  }
  return null;
}

// ─── Gift visual objects ──────────────────────────────────────────────────────

// Graffiti / StreetArt — emissive panel on a "wall" at park edge
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
      {/* Frame */}
      <mesh position={[0, 0, -0.04]}>
        <boxGeometry args={[w + 0.18, h + 0.18, 0.08]} />
        <meshStandardMaterial color="#222" roughness={0.5} metalness={0.6} />
      </mesh>
    </group>
  );
}

// Flag — pole + coloured banner
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

// Billboard — tall pole + glowing sign board
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

// Monument — unique shape per seed (3 variants)
function GiftMonument({ pos, seed }) {
  const t = seed % 3;
  const mat = { roughness: 0.05, metalness: 0.9 };

  if (t === 0) {
    // Golden orb on pedestal
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
    // Crystal diamond
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
  // Star / burst
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

// Dispatches to the right component based on giftType
// Positions are deterministic: gifts spread around the park, max 4 per slot
const GIFT_SLOTS = {
  0: [[-7.5, 0.45, 0], [7.5, 0.45, 0], [0, 0.45, -7.5], [0, 0.45, 7.5]],   // Graffiti — wall panels at park edge
  1: [[-7.5, 1.2, 0], [7.5, 1.2, 0], [0, 1.2, -7.5], [0, 1.2, 7.5]],        // StreetArt — larger panels
  2: [[6, 0, 6], [-6, 0, 6], [6, 0, -6], [-6, 0, -6]],                       // Flag — park corners
  3: [[5, 0, -5], [-5, 0, -5], [5, 0, 5], [-5, 0, 5]],                       // Billboard — park quadrants
  4: [[3.5, 0, 0], [-3.5, 0, 0], [0, 0, 3.5], [0, 0, -3.5]],                 // Monument — near statue
};

function GiftObjects({ gifts }) {
  if (!gifts || gifts.length === 0) return null;
  // Count per type to pick slot index
  const typeCount = [0, 0, 0, 0, 0, 0];
  return gifts.map((gift) => {
    const t   = Number(gift.giftType);
    const idx = typeCount[t] % 4;
    typeCount[t]++;
    const slots = GIFT_SLOTS[t];
    if (!slots) return null;
    const pos = slots[idx];
    const seed = Number(gift.id ?? 0);
    if (t === 0) return <GiftWallArt key={gift.id} pos={pos} seed={seed} large={false} />;
    if (t === 1) return <GiftWallArt key={gift.id} pos={pos} seed={seed} large={true}  />;
    if (t === 2) return <GiftFlag     key={gift.id} pos={pos} seed={seed} />;
    if (t === 3) return <GiftBillboard key={gift.id} pos={pos} seed={seed} />;
    if (t === 4) return <GiftMonument  key={gift.id} pos={pos} seed={seed} />;
    return null; // District (type 5) — visual TBD
  });
}

// ─── City scene ──────────────────────────────────────────────────────────────

function CityScene({ metrics, style, colorPalette, tokenId, gifts = [] }) {
  const { followers = 0, tweetCount = 0, engagement = 0, following = 0 } = metrics;
  const cfg = STYLE_CFG[style] || STYLE_CFG.Cyberpunk;
  const { primary, secondary, accent } = colorPalette;
  const isMed    = style === "Medieval";
  const isCyber  = style === "Cyberpunk";
  const roofDeco = isMed ? null : (ROOF_DECOR[style] || null);

  const data = useMemo(() => {
    const seed     = (((tokenId | 0) * 9973) + (followers | 0)) >>> 0;
    const rng      = mkRng(seed);
    const decorRng = mkRng(seed + 77777); // separate — doesn't shift building positions

    // FOLLOWERS → city grid size. Each level visually distinct.
    const gridR = followers >= 50000 ? 3 : followers >= 5000 ? 2 : followers >= 500 ? 1 : 0;

    // Max 2 buildings per block — keeps city readable and uncluttered
    const perBlockBase = 2;

    // ENGAGEMENT → building height range.
    // minH also grows with gridR so every level has a taller skyline floor.
    const minH = [3, 5, 8, 12][gridR];
    const engBoost = engagement >= 3 ? [20, 24, 28, 32][gridR]
                   : engagement >= 1 ? [12, 15, 18, 22][gridR]
                   : engagement >= 0.3 ? [6, 8, 11, 15][gridR]
                   : [3, 5, 7, 10][gridR];
    const maxH = minH + engBoost;

    // FOLLOWERS/FOLLOWING ratio → prestige (metalness)
    const ratio   = following > 0 ? followers / following : followers > 0 ? 5 : 1;
    const prestige = Math.min(Math.max(ratio / 20, 0.08), 0.8);

    // Building width also scales with city level — bigger cities, bigger buildings
    const maxBW = [3.2, 3.8, 4.4, 5.2][gridR];

    // Block offsets — STEP-aligned so blocks never overlap roads.
    // Roads at ±(i+0.5)*STEP; blocks at ±STEP, ±2STEP, ±3STEP — always clear.
    const blockOffsets = [];
    if (gridR === 0) {
      for (const row of [-1, 1])
        for (const col of [-1, 1])
          blockOffsets.push({ bx: col * STEP, bz: row * STEP });
    } else {
      for (let row = -gridR; row <= gridR; row++)
        for (let col = -gridR; col <= gridR; col++)
          if (!(row === 0 && col === 0))
            blockOffsets.push({ bx: col * STEP, bz: row * STEP });
    }

    // Safe zone — buildings stay inside block, never spill onto roads.
    const safeHalf = (BLOCK - 6) / 2;

    // Regular buildings: 1–2 per block, proper rectangular footprint, tall enough
    const buildings = [];
    blockOffsets.forEach(({ bx, bz }) => {
      const count = 1 + (rng() > 0.45 ? 1 : 0); // 1 or 2 per block
      const placed = [];
      for (let attempt = 0; placed.length < count && attempt < 30; attempt++) {
        const px = bx + (rng() - 0.5) * 2 * safeHalf;
        const pz = bz + (rng() - 0.5) * 2 * safeHalf;
        // Footprint: 45–90% of maxBW, rectangular (not square)
        const bw = maxBW * 0.45 + rng() * maxBW * 0.45;
        const bd = bw * (0.5 + rng() * 0.9); // depth 50–140% of width
        if (placed.every(p => Math.hypot(p[0] - px, p[1] - pz) >= Math.max(bw, bd) * 2.4)) {
          placed.push([px, pz]);
          const w = bw;
          const d = bd;
          // Height: engagement-driven floor, but always >= 2× largest footprint dim
          const rawH = minH + rng() * (maxH - minH);
          const h = Math.max(rawH, Math.max(w, d) * 2.0);
          const color = degreen(rng() > 0.45 ? primary : secondary);
          buildings.push({ pos: [px, pz], w, d, h, color, accent, prestige });
        }
      }
    });

    // Assign roof decor and neon signs using decorRng (independent — doesn't shift main rng)
    buildings.forEach(b => {
      b.roofStyle = roofDeco && decorRng() > 0.38 ? roofDeco : null;
      b.neonColor = decorRng() < 0.38
        ? (isCyber ? NEON_COLORS[Math.floor(decorRng() * NEON_COLORS.length)] : accent)
        : null;
    });

    // Central landmark tower — the taller the city level, the more dominant.
    // Placed at the block nearest to center (e.g. STEP, STEP corner).
    // gridR 0 = no landmark, 1+ = one or more signature towers.
    const landmarks = [];
    if (gridR >= 1) {
      const lmPos = [STEP, STEP]; // closest block to center
      const lmH   = maxH * [0, 1.8, 2.2, 2.8][gridR];
      const lmW   = maxBW * 0.9;
      const lmColor = degreen(primary);
      landmarks.push({ pos: lmPos, w: lmW, d: lmW, h: lmH, color: lmColor, accent, prestige: Math.min(prestige + 0.2, 0.9), roofStyle: roofDeco, neonColor: isCyber ? NEON_COLORS[0] : accent });

      // For gridR 3 — additional landmark towers at the other 3 nearest blocks
      if (gridR === 3) {
        [[-STEP, STEP], [STEP, -STEP], [-STEP, -STEP]].forEach(p => {
          landmarks.push({ pos: p, w: lmW * 0.8, d: lmW * 0.8, h: lmH * 0.75, color: lmColor, accent, prestige: Math.min(prestige + 0.15, 0.85), roofStyle: roofDeco, neonColor: isCyber ? NEON_COLORS[2] : accent });
        });
      }
    }

    // Roads and centers (for collision checks)
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

    // Rule: nothing stands on roads
    const isOnRoad = (x, z) =>
      roadCenters.some(rc => Math.abs(x - rc) <= ROAD / 2 + 0.3) ||
      roadCenters.some(rc => Math.abs(z - rc) <= ROAD / 2 + 0.3);

    // FOLLOWING → trees in park
    const treeRng      = mkRng(seed + 1);
    const trees        = [];
    const numParkTrees = Math.min(8 + Math.floor(following / 30), 60);
    for (let i = 0; i < numParkTrees; i++) {
      const angle = (i / numParkTrees) * Math.PI * 2 + treeRng() * 0.4;
      const r     = 5 + treeRng() * 2.5;
      trees.push({ pos: [Math.cos(angle) * r, 0, Math.sin(angle) * r], s: 0.7 + treeRng() * 0.5 });
    }

    // TWEET COUNT → lantern density along roads.
    // Rule: lanterns evenly spaced on sidewalk, alternating sides, never on road surface.
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

    return { buildings, landmarks, roads, trees, lanterns, totalSize, gridR };
  }, [followers, tweetCount, engagement, following, tokenId, primary, secondary, accent, roofDeco, isCyber]);

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

      {/* Park with statue — statue changes every city level */}
      <ParkTile />
      <Statue gridR={data.gridR} />

      {/* Regular buildings — detailed windows only for small cities (gridR ≤ 1) */}
      {data.buildings.map((b, i) =>
        isMed
          ? <MedTower key={i} pos={b.pos} w={b.w * 0.75} h={b.h} color={b.color} accent={accent} />
          : <Building key={`b${i}`} {...b} winEmI={cfg.winEmI} detailed={data.gridR <= 1} />
      )}

      {/* Landmark towers */}
      {data.landmarks.map((b, i) =>
        <Building key={`lm${i}`} {...b} winEmI={cfg.winEmI * 1.4} detailed={data.gridR <= 1} />
      )}

      {data.trees.map((t, i)   => <Tree    key={i} pos={t.pos} s={t.s} />)}
      {data.lanterns.map((p,i) => <Lantern key={i} pos={p} />)}

      {/* Gift objects placed in city by other users */}
      <GiftObjects gifts={gifts} />
    </>
  );
}

// Camera pulls back as city grows
function camPos(followers) {
  const gridR = followers >= 50000 ? 3 : followers >= 5000 ? 2 : followers >= 500 ? 1 : 0;
  const d = 28 + gridR * 20;
  return [d, d * 0.8, d];
}

// ─── Public component ────────────────────────────────────────────────────────

// gifts: array of active gift objects from CityGifts contract (Accepted + Verified)
// Shape: [{ id, giftType, tweetUrl, buyer, status }, ...]
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
