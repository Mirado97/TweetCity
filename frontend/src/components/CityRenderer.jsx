import React, { useMemo } from "react";

// Seeded pseudo-random number generator (LCG)
function mkRng(seed) {
  let s = (seed >>> 0) || 1337;
  return () => {
    s = Math.imul(s, 1664525) + 1013904223 >>> 0;
    return s / 0xFFFFFFFF;
  };
}

const STYLE_PALETTES = {
  Cyberpunk:      { sky: ["#0a0010", "#1a0030"], ground: "#110022", glow: "#ff00ff" },
  "Eco-Futurism": { sky: ["#00260d", "#004d1a"], ground: "#001a08", glow: "#00ff88" },
  Medieval:       { sky: ["#1a0d00", "#3d1f00"], ground: "#0d0800", glow: "#ffaa00" },
  Brutalist:      { sky: ["#1a1a1a", "#2d2d2d"], ground: "#111", glow: "#cccccc" },
  Minimalist:     { sky: ["#f5f5f5", "#e0e0e0"], ground: "#ccc", glow: "#555" },
  Baroque:        { sky: ["#120020", "#2d0040"], ground: "#0a0010", glow: "#cc88ff" },
  "Bio-Punk":     { sky: ["#001a0a", "#003314"], ground: "#000d05", glow: "#44ff44" },
};

function buildingShape(rng, style, x, w, h, baseY, primary, secondary, accent) {
  const shapes = [];

  if (style === "Cyberpunk") {
    // Tall rectangular tower with horizontal bands
    shapes.push(
      <rect key="body" x={x} y={baseY - h} width={w} height={h} fill={primary} />
    );
    // Neon bands
    const bands = Math.floor(rng() * 3) + 2;
    for (let b = 0; b < bands; b++) {
      const by = baseY - h + (h / (bands + 1)) * (b + 1);
      shapes.push(<rect key={`band${b}`} x={x} y={by} width={w} height={1.5} fill={accent} opacity="0.9" />);
    }
    // Antenna
    if (rng() > 0.4) {
      shapes.push(<line key="ant" x1={x + w / 2} y1={baseY - h} x2={x + w / 2} y2={baseY - h - 10 - rng() * 20} stroke={accent} strokeWidth="1.5" />);
    }
  } else if (style === "Eco-Futurism") {
    // Rounded tower with green roof garden
    const rx = w * 0.3;
    shapes.push(
      <rect key="body" x={x} y={baseY - h} width={w} height={h} rx={rx} fill={primary} />
    );
    // Rooftop garden
    shapes.push(
      <ellipse key="garden" cx={x + w / 2} cy={baseY - h} rx={w * 0.4} ry={4} fill={accent} />
    );
  } else if (style === "Medieval") {
    // Tower with battlements
    shapes.push(
      <rect key="body" x={x} y={baseY - h} width={w} height={h} fill={primary} />
    );
    const merlons = Math.floor(w / 6);
    const mw = w / (merlons * 2 - 1);
    for (let m = 0; m < merlons; m++) {
      shapes.push(
        <rect key={`m${m}`} x={x + m * mw * 2} y={baseY - h - 8} width={mw} height={8} fill={secondary} />
      );
    }
    // Arrow slit
    shapes.push(<rect key="slit" x={x + w / 2 - 1} y={baseY - h + h * 0.3} width={2} height={h * 0.2} fill={accent} />);
  } else if (style === "Brutalist") {
    // Wide blocky structure with few windows
    shapes.push(
      <rect key="body" x={x} y={baseY - h} width={w} height={h} fill={primary} />
    );
    // Grid windows, sparse
    const cols = Math.max(1, Math.floor(w / 10));
    const rows = Math.max(1, Math.floor(h / 14));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (rng() > 0.6) {
          shapes.push(
            <rect key={`w${r}${c}`} x={x + 3 + c * (w / cols)} y={baseY - h + 5 + r * (h / rows)}
              width={5} height={7} fill={accent} opacity="0.5" />
          );
        }
      }
    }
  } else if (style === "Minimalist") {
    // Clean rectangle, monochrome
    shapes.push(
      <rect key="body" x={x} y={baseY - h} width={w} height={h} fill={primary} />
    );
    shapes.push(
      <rect key="top" x={x + w * 0.2} y={baseY - h - 3} width={w * 0.6} height={3} fill={secondary} />
    );
  } else if (style === "Baroque") {
    // Tapered tower with ornate top
    const pts = `${x},${baseY} ${x + w * 0.1},${baseY - h} ${x + w * 0.9},${baseY - h} ${x + w},${baseY}`;
    shapes.push(<polygon key="body" points={pts} fill={primary} />);
    // Dome
    shapes.push(
      <ellipse key="dome" cx={x + w / 2} cy={baseY - h} rx={w * 0.35} ry={w * 0.3} fill={secondary} />
    );
    // Spire
    shapes.push(
      <line key="spire" x1={x + w / 2} y1={baseY - h - w * 0.3} x2={x + w / 2} y2={baseY - h - w * 0.3 - 15}
        stroke={accent} strokeWidth="1.5" />
    );
  } else {
    // Bio-Punk: organic, irregular blob
    const bx = x + w / 2;
    const by = baseY - h / 2;
    shapes.push(
      <ellipse key="body" cx={bx} cy={by} rx={w / 2} ry={h / 2} fill={primary} />
    );
    // Tendrils
    shapes.push(<line key="t1" x1={bx} y1={baseY - h} x2={bx - 5} y2={baseY - h - 12} stroke={accent} strokeWidth="2" strokeLinecap="round" />);
    shapes.push(<line key="t2" x1={bx + 3} y1={baseY - h} x2={bx + 8} y2={baseY - h - 8} stroke={accent} strokeWidth="2" strokeLinecap="round" />);
  }

  return shapes;
}

export default function CityRenderer({ city, width = 600, height = 320 }) {
  const {
    level = 1,
    style = "Cyberpunk",
    colorPalette = { primary: "#334", secondary: "#556", accent: "#f0f" },
    followers = 0,
    cityName = "Unknown City",
  } = city || {};

  const palette = STYLE_PALETTES[style] || STYLE_PALETTES.Cyberpunk;
  const { primary, secondary, accent } = colorPalette;

  const buildings = useMemo(() => {
    const rng = mkRng(followers || 1337);
    const baseY = height * 0.78;
    const numBuildings = Math.min(5 + level * 6, 35);
    const result = [];

    for (let i = 0; i < numBuildings; i++) {
      const w = 12 + rng() * (40 - level * 2);
      const h = 20 + rng() * (30 + level * 18);
      const x = (width / numBuildings) * i + rng() * 8 - 4;
      result.push({ x, w, h, baseY, z: rng() });
    }
    // Sort by Z for depth effect
    result.sort((a, b) => a.z - b.z);
    return result;
  }, [level, followers, width, height]);

  const groundY = height * 0.78;
  const isMegacity = level >= 5;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ borderRadius: 12, display: "block" }}
    >
      <defs>
        <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={palette.sky[0]} />
          <stop offset="100%" stopColor={palette.sky[1]} />
        </linearGradient>
        {isMegacity && (
          <radialGradient id="aura" cx="50%" cy="80%" r="60%">
            <stop offset="0%" stopColor={accent} stopOpacity="0.3" />
            <stop offset="100%" stopColor={accent} stopOpacity="0" />
          </radialGradient>
        )}
        <filter id="glow">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Sky */}
      <rect width={width} height={height} fill="url(#skyGrad)" />

      {/* Stars for dark styles */}
      {["Cyberpunk", "Medieval", "Baroque", "Bio-Punk"].includes(style) &&
        Array.from({ length: 40 }, (_, i) => {
          const sr = mkRng(i * 17 + 3);
          return (
            <circle key={i} cx={sr() * width} cy={sr() * groundY * 0.7}
              r={sr() * 1.5} fill="white" opacity={0.3 + sr() * 0.7} />
          );
        })
      }

      {/* Moon / Sun */}
      {style === "Cyberpunk" && (
        <circle cx={width * 0.8} cy={height * 0.15} r={18} fill="#cc00ff" opacity="0.7" filter="url(#glow)" />
      )}
      {style === "Eco-Futurism" && (
        <circle cx={width * 0.15} cy={height * 0.15} r={22} fill="#ffee00" opacity="0.8" />
      )}
      {style === "Medieval" && (
        <circle cx={width * 0.75} cy={height * 0.12} r={15} fill="#ffe8a0" opacity="0.9" />
      )}

      {/* Buildings (back to front) */}
      {buildings.map((b, i) => (
        <g key={i} opacity={0.6 + b.z * 0.4}>
          {buildingShape(
            mkRng(b.x * 100 + i),
            style, b.x, b.w, b.h, b.baseY,
            secondary, primary, accent
          )}
        </g>
      ))}

      {/* Front buildings (larger) */}
      {buildings.slice(-Math.ceil(buildings.length * 0.3)).map((b, i) => (
        <g key={`f${i}`}>
          {buildingShape(
            mkRng(b.x * 50 + i + 9999),
            style, b.x - 3, b.w * 1.3, b.h * 1.2, b.baseY,
            primary, secondary, accent
          )}
        </g>
      ))}

      {/* Ground */}
      <rect x={0} y={groundY} width={width} height={height - groundY} fill={palette.ground} />

      {/* Ground line glow */}
      <line x1={0} y1={groundY} x2={width} y2={groundY} stroke={accent} strokeWidth="1.5" opacity="0.7" />

      {/* Megacity aura overlay */}
      {isMegacity && <rect width={width} height={height} fill="url(#aura)" />}

      {/* City name label */}
      <text
        x={width / 2}
        y={height - 10}
        textAnchor="middle"
        fill={accent}
        fontSize="11"
        fontFamily="monospace"
        opacity="0.8"
        filter={isMegacity ? "url(#glow)" : undefined}
      >
        {cityName}
      </text>
    </svg>
  );
}
