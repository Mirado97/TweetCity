import { useEffect, useRef, useState, Suspense } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { V2Scene, cityLevel } from "./CityRendererV2";

const S = 8;
const PERIOD = 32;

function camPos(followers) {
  const level = cityLevel(followers);
  const gridR = level >= 9 ? 5 : level >= 7 ? 4 : level >= 5 ? 3 : level >= 3 ? 2 : level >= 1 ? 1 : 0;
  const d = 40 + gridR * PERIOD * 1.4;
  return [d, d * 0.75, d];
}

// Fires after scene renders, captures canvas to data URL
function Capture({ onCapture }) {
  const { gl, scene, camera } = useThree();
  const fired = useRef(false);
  useEffect(() => {
    const id = setTimeout(() => {
      if (fired.current) return;
      fired.current = true;
      gl.render(scene, camera);
      onCapture(gl.domElement.toDataURL("image/jpeg", 0.82));
    }, 1800);
    return () => clearTimeout(id);
  }, [gl, scene, camera, onCapture]);
  return null;
}

export default function CityThumbnail({ city, tokenId, width = 240, height = 140, onClick }) {
  const { followers = 0, tweetCount = 0, following = 0, engagement = 0 } = city || {};
  const metrics = { followers, tweetCount, following, engagement };
  const cacheKey = `thumb_${tokenId}_${followers}`;

  const [imgUrl, setImgUrl] = useState(() => sessionStorage.getItem(cacheKey));
  const cp = camPos(followers);

  function handleCapture(url) {
    sessionStorage.setItem(cacheKey, url);
    setImgUrl(url);
  }

  if (imgUrl) {
    return (
      <img
        src={imgUrl}
        width={width}
        height={height}
        onClick={onClick}
        style={{ borderRadius: 8, cursor: "pointer", display: "block", objectFit: "cover" }}
      />
    );
  }

  return (
    <div style={{ width, height, position: "relative", borderRadius: 8, overflow: "hidden", background: "#1a2030" }}>
      <Canvas
        gl={{ preserveDrawingBuffer: true, antialias: false, powerPreference: "low-power" }}
        camera={{ position: cp, fov: 45 }}
        style={{ width, height }}
      >
        <Suspense fallback={null}>
          <V2Scene metrics={metrics} tokenId={tokenId || 0} />
          <Capture onCapture={handleCapture} />
        </Suspense>
      </Canvas>
      <div style={{
        position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
        color: "rgba(255,255,255,0.4)", fontSize: 11, fontFamily: "monospace", pointerEvents: "none",
      }}>
        rendering…
      </div>
    </div>
  );
}
