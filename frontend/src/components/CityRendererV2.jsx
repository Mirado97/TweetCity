// CityRendererV2 — tile-grid city: tile-low blocks + road tiles + buildings
import { useMemo, useState, Suspense, useRef, useEffect } from "react";
import { CanvasTexture, MOUSE } from "three";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, useGLTF, useTexture } from "@react-three/drei";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";

// OrbitControls wrapper: RMB pan is gated by holding Ctrl.
// Without Ctrl, RMB does nothing — the camera keeps auto-rotating around the
// city center. Hold Ctrl + drag RMB to move the orbit target across the map.
function CtrlPanOrbitControls(props) {
  const ref = useRef();
  useEffect(() => {
    const ctrl = ref.current;
    if (!ctrl) return;
    // -1 disables a mouse button in three.js OrbitControls.
    const update = (ctrlKey) => {
      ctrl.mouseButtons = {
        LEFT:   MOUSE.ROTATE,
        MIDDLE: MOUSE.DOLLY,
        RIGHT:  ctrlKey ? MOUSE.PAN : -1,
      };
    };
    update(false);
    const down = (e) => { if (e.key === "Control") update(true); };
    const up   = (e) => { if (e.key === "Control") update(false); };
    // Window may lose focus while Ctrl is held → reset.
    const blur = () => update(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup",   up);
    window.addEventListener("blur",    blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup",   up);
      window.removeEventListener("blur",    blur);
    };
  }, []);
  return <OrbitControls ref={ref} enablePan {...props} />;
}

// Module-scoped cache of suburban palettes (CanvasTextures) so we don't
// re-upload to the GPU on every render. We always go through canvas so the
// shared saturate/contrast boost is applied — base variation PNGs come out
// too pale otherwise (especially noticeable next to vivid industrial/commercial).
const _suburbanPaletteCache = new Map();
// CSS-style filter applied to every suburban palette texture.
const SUBURBAN_FILTER_BOOST = "saturate(160%) contrast(115%)";

function getSuburbanTexture(colorIdx, sourceImages) {
  if (_suburbanPaletteCache.has(colorIdx)) return _suburbanPaletteCache.get(colorIdx);
  let fromIdx, hueDeg = 0;
  if (colorIdx < SUBURBAN_COLORMAPS.length) {
    fromIdx = colorIdx;            // base variation, only saturation boost
  } else {
    const d = HUE_DERIVATIVES[colorIdx - SUBURBAN_COLORMAPS.length];
    if (!d) return null;
    fromIdx = d.from;
    hueDeg  = d.deg;
  }
  const img = sourceImages[fromIdx];
  if (!img) return null;
  const canvas = document.createElement('canvas');
  canvas.width  = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  ctx.filter = `hue-rotate(${hueDeg}deg) ${SUBURBAN_FILTER_BOOST}`;
  ctx.drawImage(img, 0, 0);
  const tex = new CanvasTexture(canvas);
  tex.flipY = false;
  _suburbanPaletteCache.set(colorIdx, tex);
  return tex;
}
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
  characters: ['male-a','male-b','male-c','male-d','male-e','male-f','female-a','female-b','female-c','female-d','female-e','female-f']
                .map(n => `/models/characters/character-${n}.glb`),
  // Vehicles bucketed by zone so each district gets fitting traffic:
  //   suburban   → regular passenger cars
  //   commercial → trucks & delivery vans
  //   industrial → tractors
  //   skyscraper → premium cars + emergency services
  carsSuburban:   ['sedan','sedan-sports','suv','suv-luxury','taxi','van','hatchback-sports']
                    .map(n => `/models/cars/${n}.glb`),
  carsCommercial: ['truck','truck-flat','delivery','delivery-flat','garbage-truck','van']
                    .map(n => `/models/cars/${n}.glb`),
  carsIndustrial: ['tractor','tractor-shovel','tractor-police','truck','truck-flat']
                    .map(n => `/models/cars/${n}.glb`),
  carsSkyscraper: ['suv-luxury','sedan-sports','sedan','police','ambulance','firetruck']
                    .map(n => `/models/cars/${n}.glb`),
};
const CARS_BY_PACK = {
  suburban:   MODELS.carsSuburban,
  commercial: MODELS.carsCommercial,
  industrial: MODELS.carsIndustrial,
  skyscraper: MODELS.carsSkyscraper,
};

// Baseline: pedestrian scale 3.5 ≈ a ~2 m human in world units.
// All other props scaled relative to that so the city reads at consistent scale.
const ZONE_SCALE = { skyscraper: 8.0, commercial: 7.5, industrial: 11.0, suburban: 7.5 };

// ─── Tile grid constants ──────────────────────────────────────────────────────
// All Kenney road/sidewalk tiles: native 1×1 → scale S → S×S world units
const S       = 10;              // tile scale → road width = 10 units (fits a car + lane)
const BLOCK_N = 3;               // tiles per building-block side (3×3 = 9 tiles)
const PERIOD  = (BLOCK_N + 1) * S;  // = 40 — block center spacing
const HALF_B  = (BLOCK_N / 2) * S; // = 15 — half block size

const SUBURBAN_COLORMAPS = [
  '/models/suburban/variation-a.png',
  '/models/suburban/variation-b.png',
  '/models/suburban/variation-c.png',
];

// Kenney suburban kit ships only 3 palette PNGs (blue/orange/grey roofs).
// To get more variety (including green/purple/yellow) we derive extra textures
// at runtime by applying hue-rotate to variation-a via a 2D canvas filter.
// Index 0..2 = original PNGs, 3..7 = hue-shifted derivatives.
const HUE_DERIVATIVES = [
  { from: 0, deg:  90 },   // greenish
  { from: 0, deg: 140 },   // teal
  { from: 0, deg: 220 },   // purple
  { from: 0, deg: 320 },   // pink
  { from: 1, deg:  60 },   // lime from orange
];
const SUBURBAN_PALETTE_COUNT = SUBURBAN_COLORMAPS.length + HUE_DERIVATIVES.length;

// ─── GLB model components ─────────────────────────────────────────────────────

function GlbModel({ url, position, rotY = 0, scale = 1 }) {
  const { scene } = useGLTF(url);
  const clone = useMemo(() => scene.clone(true), [scene]);
  return <primitive object={clone} position={position} rotation={[0, rotY, 0]} scale={scale} />;
}

// Kenney character GLBs have skins + bones — plain scene.clone() breaks the
// skeleton binding and the mesh becomes invisible. SkeletonUtils.clone keeps
// each instance's skeleton intact. Also re-binds the colormap texture so the
// figure isn't grey.
function SkinnedGlbModel({ url, position, rotY = 0, scale = 1 }) {
  const { scene } = useGLTF(url);
  const texture = useTexture('/models/characters/Textures/colormap.png');
  const clone = useMemo(() => {
    const c = cloneSkinned(scene);
    c.traverse((node) => {
      if (node.isMesh && node.material) {
        const mat = node.material.clone();
        mat.map = texture;
        mat.map.flipY = false;
        mat.transparent = false;
        mat.needsUpdate = true;
        node.material = mat;
      }
    });
    return c;
  }, [scene, texture]);
  return <primitive object={clone} position={position} rotation={[0, rotY, 0]} scale={scale} />;
}

// Suburban variant — swaps colormap texture so each house gets its own color.
// All palettes go through canvas to apply saturate/contrast boost (base PNGs
// look washed-out next to the vivid industrial/commercial models otherwise).
// colorIdx 0..2 → variation-a/b/c boosted; 3..7 → hue-shifted + boosted.
function SuburbanGlbModel({ url, position, rotY = 0, scale = 1, colorIdx = 0 }) {
  const { scene } = useGLTF(url);
  const baseTextures = useTexture(SUBURBAN_COLORMAPS);
  const texture = useMemo(() => {
    const images = baseTextures.map((t) => t.image);
    return getSuburbanTexture(colorIdx, images) || baseTextures[0];
  }, [baseTextures, colorIdx]);
  const clone = useMemo(() => {
    const cloned = scene.clone(true);
    cloned.traverse(node => {
      if (node.isMesh && node.material) {
        const mat = node.material.clone();
        mat.map = texture;
        mat.map.flipY = false; // glTF UV convention
        mat.needsUpdate = true;
        node.material = mat;
      }
    });
    return cloned;
  }, [scene, texture]);
  return <primitive object={clone} position={position} rotation={[0, rotY, 0]} scale={scale} />;
}

// ─── Procedural monument (center landmark, scales with city level) ────────────

function Monument({ level }) {
  const gold   = <meshStandardMaterial color="#d4a017" metalness={0.8} roughness={0.25} />;
  const stone  = <meshStandardMaterial color="#8a8a7a" metalness={0.1} roughness={0.8} />;
  const bronze = <meshStandardMaterial color="#7c5a2a" metalness={0.6} roughness={0.4} />;
  const chrome = <meshStandardMaterial color="#c8d8e8" metalness={0.95} roughness={0.05} />;

  if (level <= 2) {
    // Simple obelisk
    return (
      <group position={[0, 0, 0]}>
        <mesh position={[0, 0.6, 0]}><boxGeometry args={[1.4, 1.2, 1.4]} />{stone}</mesh>
        <mesh position={[0, 3.0, 0]}><boxGeometry args={[0.7, 4.0, 0.7]} />{stone}</mesh>
        <mesh position={[0, 5.2, 0]}><coneGeometry args={[0.45, 1.0, 4]} />{gold}</mesh>
      </group>
    );
  }
  if (level <= 4) {
    // Pillar with statue on top
    return (
      <group>
        <mesh position={[0, 0.5, 0]}><boxGeometry args={[3, 1, 3]} />{stone}</mesh>
        <mesh position={[0, 1.8, 0]}><boxGeometry args={[1.8, 1.6, 1.8]} />{stone}</mesh>
        <mesh position={[0, 4.8, 0]}><cylinderGeometry args={[0.5, 0.6, 5, 8]} />{stone}</mesh>
        <mesh position={[0, 7.8, 0]}><sphereGeometry args={[0.8, 12, 8]} />{bronze}</mesh>
        <mesh position={[0, 9.0, 0]}><coneGeometry args={[0.4, 1.2, 8]} />{bronze}</mesh>
      </group>
    );
  }
  if (level <= 6) {
    // Tiered tower with golden top
    return (
      <group>
        <mesh position={[0, 0.6, 0]}><cylinderGeometry args={[4.0, 4.5, 1.2, 8]} />{stone}</mesh>
        <mesh position={[0, 2.5, 0]}><cylinderGeometry args={[2.5, 3.5, 2.5, 8]} />{stone}</mesh>
        <mesh position={[0, 5.5, 0]}><cylinderGeometry args={[1.5, 2.2, 3.5, 8]} />{stone}</mesh>
        <mesh position={[0, 8.5, 0]}><cylinderGeometry args={[0.7, 1.2, 3.0, 8]} />{bronze}</mesh>
        <mesh position={[0, 10.5, 0]}><sphereGeometry args={[1.0, 12, 8]} />{gold}</mesh>
        <mesh position={[0, 12.0, 0]}><coneGeometry args={[0.5, 2.0, 8]} />{gold}</mesh>
      </group>
    );
  }
  if (level <= 8) {
    // Arch monument
    return (
      <group>
        <mesh position={[0, 0.5, 0]}><boxGeometry args={[14, 1, 5]} />{stone}</mesh>
        <mesh position={[-5.5, 6.5, 0]}><boxGeometry args={[2.5, 12, 4]} />{stone}</mesh>
        <mesh position={[5.5, 6.5, 0]}><boxGeometry args={[2.5, 12, 4]} />{stone}</mesh>
        <mesh position={[0, 13.5, 0]}><boxGeometry args={[15, 2.5, 4.5]} />{stone}</mesh>
        <mesh position={[0, 15.5, 0]}><boxGeometry args={[10, 1.0, 3.5]} />{bronze}</mesh>
        <mesh position={[0, 7.0, 0]}><boxGeometry args={[1.2, 10, 1.2]} />{bronze}</mesh>
        <mesh position={[0, 12.6, 0]}><sphereGeometry args={[0.9, 12, 8]} />{gold}</mesh>
      </group>
    );
  }
  // Level 9-10: Epic multi-spire tower
  return (
    <group>
      <mesh position={[0, 0.8, 0]}><cylinderGeometry args={[7, 8, 1.5, 12]} />{stone}</mesh>
      <mesh position={[0, 3.0, 0]}><cylinderGeometry args={[5, 6.5, 3, 12]} />{stone}</mesh>
      <mesh position={[0, 7.0, 0]}><cylinderGeometry args={[3.5, 4.5, 6, 12]} />{stone}</mesh>
      <mesh position={[0, 13.0, 0]}><cylinderGeometry args={[2, 3, 8, 12]} />{bronze}</mesh>
      <mesh position={[0, 19.5, 0]}><cylinderGeometry args={[1.0, 1.8, 5, 12]} />{chrome}</mesh>
      <mesh position={[0, 23.0, 0]}><sphereGeometry args={[1.4, 16, 10]} />{gold}</mesh>
      <mesh position={[0, 25.5, 0]}><coneGeometry args={[0.6, 4.0, 8]} />{gold}</mesh>
      {/* Side spires */}
      {[0,1,2,3].map(i => {
        const a = i * Math.PI / 2;
        return (
          <group key={i} position={[Math.cos(a)*5, 0, Math.sin(a)*5]}>
            <mesh position={[0, 2.5, 0]}><cylinderGeometry args={[0.5, 0.8, 5, 8]} />{stone}</mesh>
            <mesh position={[0, 6.0, 0]}><coneGeometry args={[0.5, 3.0, 8]} />{chrome}</mesh>
          </group>
        );
      })}
    </group>
  );
}

// ─── City scene ──────────────────────────────────────────────────────────────

// ─── Gift visuals ────────────────────────────────────────────────────────────
// Renders Accepted/Verified gifts around the city perimeter. Position is deterministic
// from giftId via golden-angle distribution. Each type is a small procedural artifact.
function GiftItem({ gift, cityRadius }) {
  // Golden-angle spread → even distribution around the city for any number of gifts
  const id      = Number(gift.id) || 0;
  const angle   = id * 2.39996;          // golden angle in radians
  const radius  = cityRadius * 0.95 + ((id * 7) % 8);
  const x       = Math.cos(angle) * radius;
  const z       = Math.sin(angle) * radius;
  const facing  = Math.atan2(-x, -z);    // face the city center
  const type    = Number(gift.giftType);
  const palette = [
    "#00d4ff", // graffiti — cyan
    "#a855f7", // street art — purple
    "#ef4444", // flag — red
    "#facc15", // billboard — yellow
    "#10b981", // monument — emerald
    "#ec4899", // district — pink
  ];
  const color = palette[type] || "#ffffff";

  switch (type) {
    case 0: { // Graffiti — colored wall plate facing the city
      return (
        <group position={[x, 0, z]} rotation={[0, facing, 0]}>
          <mesh position={[0, 1.5, 0]}>
            <boxGeometry args={[3, 3, 0.2]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} />
          </mesh>
          <pointLight position={[0, 2, 1]} color={color} intensity={0.6} distance={6} />
        </group>
      );
    }
    case 1: { // Street Art — wide ground mural
      return (
        <group position={[x, 0, z]} rotation={[0, facing, 0]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
            <planeGeometry args={[6, 4]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.3} />
          </mesh>
        </group>
      );
    }
    case 2: { // Flag — pole + waving banner
      return (
        <group position={[x, 0, z]}>
          <mesh position={[0, 4, 0]}>
            <cylinderGeometry args={[0.1, 0.1, 8, 8]} />
            <meshStandardMaterial color="#444" />
          </mesh>
          <mesh position={[1.2, 6.5, 0]} rotation={[0, facing, 0]}>
            <planeGeometry args={[2.5, 1.6]} />
            <meshStandardMaterial color={color} side={2} emissive={color} emissiveIntensity={0.3} />
          </mesh>
          <mesh position={[0, 8, 0]}>
            <sphereGeometry args={[0.2, 8, 8]} />
            <meshStandardMaterial color="#ddd" metalness={0.6} roughness={0.3} />
          </mesh>
        </group>
      );
    }
    case 3: { // Billboard — two posts + glowing screen
      return (
        <group position={[x, 0, z]} rotation={[0, facing, 0]}>
          <mesh position={[-1.8, 2, 0]}>
            <boxGeometry args={[0.3, 4, 0.3]} />
            <meshStandardMaterial color="#333" />
          </mesh>
          <mesh position={[1.8, 2, 0]}>
            <boxGeometry args={[0.3, 4, 0.3]} />
            <meshStandardMaterial color="#333" />
          </mesh>
          <mesh position={[0, 4.5, 0]}>
            <boxGeometry args={[5, 2.5, 0.3]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.7} />
          </mesh>
          <pointLight position={[0, 5, 1.5]} color={color} intensity={1.2} distance={10} />
        </group>
      );
    }
    case 4: { // Monument — column with floating glowing sphere
      return (
        <group position={[x, 0, z]}>
          <mesh position={[0, 1.5, 0]}>
            <boxGeometry args={[2, 0.5, 2]} />
            <meshStandardMaterial color="#666" metalness={0.5} roughness={0.4} />
          </mesh>
          <mesh position={[0, 3.5, 0]}>
            <cylinderGeometry args={[0.6, 0.8, 3.5, 12]} />
            <meshStandardMaterial color="#999" metalness={0.4} roughness={0.5} />
          </mesh>
          <mesh position={[0, 6, 0]}>
            <sphereGeometry args={[0.8, 16, 16]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.0} />
          </mesh>
          <pointLight position={[0, 6, 0]} color={color} intensity={1.5} distance={12} />
        </group>
      );
    }
    case 5: { // District — large neon-lit ring on the ground (lights up the whole area)
      return (
        <group position={[x, 0, z]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
            <ringGeometry args={[3.5, 4.5, 32]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.0} side={2} />
          </mesh>
          <pointLight position={[0, 3, 0]} color={color} intensity={2.0} distance={18} />
        </group>
      );
    }
    default:
      return null;
  }
}

function Gifts({ gifts, citySize }) {
  if (!gifts || gifts.length === 0) return null;
  const radius = citySize / 2;
  return (
    <>
      {gifts.map((g) => (
        <GiftItem key={String(g.id)} gift={g} cityRadius={radius} />
      ))}
    </>
  );
}

export function V2Scene({ metrics, tokenId, gifts = [] }) {
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
    // Counter across ALL suburban houses placed (not blocks). Every 2nd house
    // gets a neighbouring pedestrian.
    let suburbanHouseIdx = 0;
    // Rule: cars must never overlap. Each car claims a segment of road and we
    // refuse to place another within MIN_CAR_GAP units of an existing one on
    // the same road centerline.
    const occupiedCarSegments = []; // { axis: 'h'|'v', along: number, perp: number }
    const MIN_CAR_GAP = 12; // bigger cars (scale 2.5) need wider parking gaps
    // Rule: pedestrians must never overlap each other. Track placed (x, z)
    // positions globally and skip a person if they'd land within MIN_PERSON_GAP
    // of an already-placed one.
    const occupiedPersonPositions = []; // { x, z }
    const MIN_PERSON_GAP = 2.2;

    for (let bc_row = -gridR; bc_row <= gridR; bc_row++) {
      for (let bc_col = -gridR; bc_col <= gridR; bc_col++) {
        if (bc_row === 0 && bc_col === 0) continue; // center = park
        if (rng() < 0.1) continue; // 10% empty blocks

        const cx   = bc_col * PERIOD;
        const cz   = bc_row * PERIOD;
        const zone = Math.max(Math.abs(bc_row), Math.abs(bc_col));

        // Zone assignment by level:
        // lv 1-2 → all suburban
        // lv 3   → center ring = 1 industrial, rest suburban
        // lv 4+  → full commercial/industrial/suburban logic
        const isSky  = zone === 1 && level >= 6;
        const isComm = level >= 4 && (zone <= 1 || (zone === 2 && gridR >= 4));
        const isInd  = level >= 3 && (
          level === 3 ? (zone === 1 && bc_row === 0 && bc_col === 1) // one industrial at lv3
                     : (zone >= 2 && zone <= gridR - 1)
        );
        const pack   = isSky ? 'skyscraper' : isComm ? 'commercial' : isInd ? 'industrial' : 'suburban';
        const list   = MODELS[pack];
        const baseScale = ZONE_SCALE[pack];

        let clusterOffsets, clusterScale;

        if (pack === 'commercial' || pack === 'skyscraper') {
          clusterOffsets = [[(rng() - 0.5) * JITTER, (rng() - 0.5) * JITTER]];
          clusterScale   = baseScale * (0.9 + rng() * 0.2);
        } else if (pack === 'industrial') {
          // one large factory fills the whole 24×24 block
          clusterOffsets = [[(rng() - 0.5) * 2, (rng() - 0.5) * 2]];
          clusterScale = baseScale * (0.9 + rng() * 0.1);
        } else {
          // Suburban: 2-3 bigger houses. Block half-size grew to 15 (was 12)
          // since S = 10, so push corners further out (±8) to fill the space.
          const corners = [[-8, -8], [8, -8], [-8, 8], [8, 8]];
          corners.splice(Math.floor(rng() * 4), 1);
          if (rng() < 0.4) corners.splice(Math.floor(rng() * corners.length), 1);
          clusterOffsets = corners.map(([ox, oz]) => [ox + (rng() - 0.5) * 1.2, oz + (rng() - 0.5) * 1.2]);
          clusterScale   = baseScale * (0.9 + rng() * 0.2);
        }

        for (const [ox, oz] of clusterOffsets) {
          models.push({
            url:      list[Math.floor(rng() * list.length)],
            x: cx + ox, z: cz + oz,
            rotY:     Math.floor(rng() * 4) * Math.PI / 2,
            scale:    clusterScale * (0.9 + rng() * 0.2),
            colorIdx: pack === 'suburban' ? Math.floor(rng() * SUBURBAN_PALETTE_COUNT) : undefined,
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
        // Trees by zone: suburban 2-3 (bigger houses leave less room),
        // industrial 2-3, commercial/skyscraper 0.
        const numTrees = pack === 'suburban'  ? 2 + Math.floor(rng() * 2)
                       : pack === 'industrial' ? 2 + Math.floor(rng() * 2)
                       : 0;
        if (numTrees > 0) {
          // Spots pushed to the block edge so they don't clip the larger houses.
          const spots = pack === 'suburban'
            ? [ [0,-13],[0,13],[-13,0],[13,0] ]
            : [ [-12,-12],[12,-12],[-12,12],[12,12] ];
          // Shuffle via rng
          for (let i = spots.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [spots[i], spots[j]] = [spots[j], spots[i]];
          }
          for (let t = 0; t < Math.min(numTrees, spots.length); t++) {
            const [ox, oz] = spots[t];
            models.push({
              url:   MODELS.trees[rng() > 0.5 ? 0 : 1],
              x:     cx + ox + (rng() - 0.5) * 1.5,
              z:     cz + oz + (rng() - 0.5) * 1.5,
              rotY:  rng() * Math.PI * 2,
              scale: 8.0 + rng() * 6.0,
            });
          }
        }

        // People — only around suburban "domiki". A pedestrian next to every
        // 2nd HOUSE (not block). Counter is global so cadence stays consistent.
        if (pack === 'suburban') {
          for (const [hx, hz] of clusterOffsets) {
            suburbanHouseIdx++;
            if (suburbanHouseIdx % 2 !== 0) continue;
            // Stand on the side of the house facing the nearest block edge.
            // House footprint ≈ 7-9 units, so offset needs to clear that.
            const towardX = hx >= 0 ?  5.0 : -5.0;
            const towardZ = hz >= 0 ?  5.0 : -5.0;
            for (let attempt = 0; attempt < 6; attempt++) {
              const wx = cx + hx + towardX + (rng() - 0.5) * 1.2;
              const wz = cz + hz + towardZ + (rng() - 0.5) * 1.2;
              const tooClose = occupiedPersonPositions.some(
                (q) => Math.hypot(q.x - wx, q.z - wz) < MIN_PERSON_GAP
              );
              if (tooClose) continue;
              models.push({
                url:   MODELS.characters[Math.floor(rng() * MODELS.characters.length)],
                x:     wx, z: wz,
                rotY:  rng() * Math.PI * 2,
                scale: 3.5,
              });
              occupiedPersonPositions.push({ x: wx, z: wz });
              break;
            }
          }
        }

        // Cars — on EVERY block, not just suburban (otherwise the inner
        // commercial/industrial/skyscraper streets stay empty). Vehicle type
        // matches the zone: passenger cars for suburban, trucks for commercial,
        // tractors for industrial, premium + emergency for skyscraper.
        // Rules: on road tiles only, oriented along the road, no overlap.
        const carList = CARS_BY_PACK[pack] || MODELS.carsSuburban;
        const numCars = 1 + (rng() < 0.5 ? 1 : 0);
        for (let cIdx = 0; cIdx < numCars; cIdx++) {
          const candidates = [];
          if (bc_row > -gridR) candidates.push({ axis: 'h', perp: cz - PERIOD / 2 });
          if (bc_row <  gridR) candidates.push({ axis: 'h', perp: cz + PERIOD / 2 });
          if (bc_col > -gridR) candidates.push({ axis: 'v', perp: cx - PERIOD / 2 });
          if (bc_col <  gridR) candidates.push({ axis: 'v', perp: cx + PERIOD / 2 });
          let placed = false;
          for (let attempt = 0; attempt < 6 && !placed && candidates.length > 0; attempt++) {
            const r = candidates[Math.floor(rng() * candidates.length)];
            const along = (r.axis === 'h' ? cx : cz) + (rng() - 0.5) * (PERIOD * 0.4);
            const conflict = occupiedCarSegments.some(
              (s) => s.axis === r.axis && s.perp === r.perp && Math.abs(s.along - along) < MIN_CAR_GAP
            );
            if (conflict) continue;
            const laneOffset = (rng() < 0.5 ? -1 : 1) * (S * 0.18);
            const url = carList[Math.floor(rng() * carList.length)];
            if (r.axis === 'h') {
              models.push({ url, x: along, z: r.perp + laneOffset,
                rotY: rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2, scale: 2.5 });
            } else {
              models.push({ url, x: r.perp + laneOffset, z: along,
                rotY: rng() < 0.5 ? 0 : Math.PI, scale: 2.5 });
            }
            occupiedCarSegments.push({ axis: r.axis, perp: r.perp, along });
            placed = true;
          }
        }
      }
    }

    // Center park: ring of trees around monument
    const parkTrees = 4 + Math.min(level, 6);
    for (let i = 0; i < parkTrees; i++) {
      const angle = (i / parkTrees) * Math.PI * 2 + treeRng() * 0.3;
      const r     = 8 + treeRng() * 3;
      models.push({ url: MODELS.trees[treeRng()>0.5?0:1], x: Math.cos(angle)*r, z: Math.sin(angle)*r, rotY: treeRng()*Math.PI*2, scale: 9.0+treeRng()*6.0 });
    }

    const citySize = (2 * gr + 1) * PERIOD + 24;
    return { models, citySize, gridR, level };
  }, [followers, tokenId]);

  return (
    <>
      <color attach="background" args={["#8899aa"]} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[20, 28, 15]} intensity={2.8} />
      <directionalLight position={[-10, 15, -10]} intensity={0.6} color="#cce0ff" />
      <hemisphereLight args={["#d0e8ff", "#334400", 0.4]} />

      {/* Base ground (shows at city edges) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
        <planeGeometry args={[data.citySize + 40, data.citySize + 40]} />
        <meshStandardMaterial color="#4a4e5a" roughness={1} />
      </mesh>

      {/* All GLB: tile-low blocks + road tiles + lights + buildings */}
      {data.models.map((m, i) =>
        m.url?.includes('/characters/')
          ? <SkinnedGlbModel  key={i} url={m.url} position={[m.x, 0, m.z]} rotY={m.rotY} scale={m.scale} />
          : m.colorIdx !== undefined
            ? <SuburbanGlbModel key={i} url={m.url} position={[m.x, 0, m.z]} rotY={m.rotY} scale={m.scale} colorIdx={m.colorIdx} />
            : <GlbModel        key={i} url={m.url} position={[m.x, 0, m.z]} rotY={m.rotY} scale={m.scale} />
      )}

      {/* Central monument */}
      <Monument level={data.level} />

      {/* Active gifts (Accepted + Verified) around the city perimeter */}
      <Gifts gifts={gifts} citySize={data.citySize} />
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

export default function CityRendererV2({ city, tokenId, gifts = [] }) {
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
            <V2Scene metrics={metrics} tokenId={tokenId || 0} gifts={gifts} />
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
                <V2Scene metrics={metrics} tokenId={tokenId || 0} gifts={gifts} />
                <CtrlPanOrbitControls minDistance={8} maxDistance={300} maxPolarAngle={Math.PI / 2 - 0.04} autoRotate autoRotateSpeed={0.35} />
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
