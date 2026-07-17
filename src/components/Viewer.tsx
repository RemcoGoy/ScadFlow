import { useRef, useState, useEffect, Suspense, useMemo, useCallback } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment, useGLTF, Bounds, Center, useBounds } from "@react-three/drei";
import { useScadStore } from "../store/scadStore";

function Model({
  url,
  viewMode,
  onLoaded,
}: {
  url: string;
  viewMode: string;
  onLoaded?: () => void;
}) {
  const { scene } = useGLTF(url);

  const clonedScene = useMemo(() => {
    if (!scene) return null;

    // Clone the scene to avoid mutating useGLTF's cached instance
    const cloned = scene.clone();

    cloned.traverse((child: any) => {
      if (child.isMesh && child.geometry) {
        // Clone material so we don't mutate a potentially shared material
        if (child.material) {
          child.material = child.material.clone();
        }

        if (viewMode === "shaded") {
          if (child.material) {
            child.material.wireframe = false;
            child.material.visible = true;
          }
        } else if (viewMode === "wireframe") {
          if (child.material) {
            child.material.wireframe = true;
            child.material.visible = true;
          }
        } else if (viewMode === "shaded-wireframe") {
          if (child.material) {
            child.material.wireframe = false;
            child.material.visible = true;
          }

          const geometry = child.geometry;
          // Ensure geometry has position attributes before creating edges
          // This prevents "x2 is undefined" or similar errors from internal ThreeJS
          if (geometry && geometry.attributes && geometry.attributes.position) {
            try {
              const edgesGeo = new THREE.EdgesGeometry(geometry, 20);
              const lineMat = new THREE.LineBasicMaterial({
                color: 0x111111,
              });
              const lineSegments = new THREE.LineSegments(edgesGeo, lineMat);
              lineSegments.userData = { isScadEdges: true };
              child.add(lineSegments);
            } catch (err) {
              console.warn("Could not create EdgesGeometry for mesh", err);
            }
          }
        }
      }
    });

    return cloned;
  }, [scene, viewMode]);

  useEffect(() => {
    if (scene && onLoaded) {
      // Use a slight timeout to ensure the scene has been added to the parent
      // and layout has occurred, so bounds calculation is accurate.
      const timer = setTimeout(() => {
        onLoaded();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [scene, onLoaded]);

  return clonedScene ? <primitive object={clonedScene} /> : null;
}

function BoundsFit({ boundsApiRef }: { boundsApiRef: React.MutableRefObject<any> }) {
  const api = useBounds();
  useEffect(() => {
    boundsApiRef.current = api;
  }, [api, boundsApiRef]);
  return null;
}

export function Viewer() {
  const { modelUrl, viewMode, setViewMode } = useScadStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<any>(null);
  const boundsApiRef = useRef<any>(null);

  const [autoRotate, setAutoRotate] = useState(false);
  const [exposure, setExposure] = useState(0.5);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  const handleResetCamera = useCallback(() => {
    if (controlsRef.current && boundsApiRef.current) {
      boundsApiRef.current.refresh();
      const { center, distance } = boundsApiRef.current.getSize();

      // Create a spherical coordinate matching our desired angles
      // Multiply distance by 1.6 to zoom out a bit more
      const spherical = new THREE.Spherical(
        distance * 1.6,
        55 * (Math.PI / 180), // polar angle
        Math.PI / 4, // azimuthal angle
      );

      // Convert to Cartesian and set position
      const offset = new THREE.Vector3().setFromSpherical(spherical);

      controlsRef.current.object.position.copy(center).add(offset);
      controlsRef.current.target.copy(center);
      controlsRef.current.update();

      // Update clipping planes
      boundsApiRef.current.clip();
    }
  }, []);

  const handleToggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch((err) => {
        console.error("Error enabling fullscreen:", err);
      });
    } else {
      document.exitFullscreen().catch((err) => {
        console.error("Error exiting fullscreen:", err);
      });
    }
  };

  const handleRotateExposure = () => {
    setExposure((prev) => {
      if (prev === 1.0) return 1.6;
      if (prev === 1.6) return 0.5;
      return 1.0;
    });
  };

  const handleRotateViewMode = () => {
    if (viewMode === "shaded") setViewMode("shaded-wireframe");
    else if (viewMode === "shaded-wireframe") setViewMode("wireframe");
    else setViewMode("shaded");
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-[#0f131a] flex items-center justify-center"
    >
      {/* 3D Canvas Coordinate Grid Background (Amber/Teal colored lines coordinate look) */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:20px_20px] pointer-events-none" />

      {/* Floating Top-Left Interaction Help watermark */}
      <div className="absolute top-3 left-3 bg-[#131924]/75 border border-border-figma/40 px-2 py-0.5 rounded text-[10px] text-zinc-500 font-sans tracking-wide select-none z-20 pointer-events-none">
        drag · rotate · scroll · zoom
      </div>

      <div className="w-full h-full z-10">
        <Canvas
          shadows
          camera={{ position: [20, 20, 20], fov: 50 }}
          gl={{ toneMappingExposure: exposure }}
        >
          <Suspense fallback={null}>
            <Environment preset="city" />
            <ambientLight intensity={0.5} />
            <directionalLight position={[10, 10, 10]} intensity={1} castShadow />
            {modelUrl && (
              <Bounds clip observe>
                <BoundsFit boundsApiRef={boundsApiRef} />
                <Center>
                  <Model url={modelUrl} viewMode={viewMode} onLoaded={handleResetCamera} />
                </Center>
              </Bounds>
            )}
            <OrbitControls
              ref={controlsRef}
              makeDefault
              autoRotate={autoRotate}
              minPolarAngle={0}
              maxPolarAngle={Math.PI}
            />
          </Suspense>
        </Canvas>
      </div>

      {/* Minimal Floating Canvas Settings Toolbar (Bottom-Right) */}
      <div className="absolute bottom-3 right-3 flex items-center space-x-1.5 bg-[#131924]/85 border border-[#1e293b] p-1 rounded-lg shadow-xl z-20 transition-all select-none">
        {/* Reset Camera */}
        <button
          onClick={handleResetCamera}
          className="p-1 text-zinc-400 hover:text-white rounded hover:bg-[#1d2737] transition-colors"
          title="Reset View"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-3.5 w-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
            />
          </svg>
        </button>

        {/* Auto Rotate Toggle */}
        <button
          onClick={() => setAutoRotate(!autoRotate)}
          className={`p-1 rounded transition-colors ${
            autoRotate
              ? "text-scad-amber bg-scad-amber-bg border border-scad-amber/20"
              : "text-zinc-400 hover:text-white hover:bg-[#1d2737]"
          }`}
          title="Toggle Auto Rotation"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-3.5 w-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </button>

        {/* Exposure Adjust */}
        <button
          onClick={handleRotateExposure}
          className="px-2 py-1 text-zinc-400 hover:text-white rounded hover:bg-[#1d2737] transition-colors font-mono font-bold text-[9px] uppercase tracking-wider"
          title="Change View Exposure"
        >
          EXP: {exposure.toFixed(1)}x
        </button>

        {/* View Mode Toggle */}
        <button
          onClick={handleRotateViewMode}
          className="px-2 py-1 text-zinc-400 hover:text-white rounded hover:bg-[#1d2737] transition-colors font-mono font-bold text-[9px] uppercase tracking-wider"
          title="Change View Mode"
        >
          MODE: {viewMode === "shaded-wireframe" ? "EDGES" : viewMode.toUpperCase()}
        </button>

        <div className="w-[1px] h-3.5 bg-zinc-800 mx-1" />

        {/* Fullscreen Toggle */}
        <button
          onClick={handleToggleFullscreen}
          className="p-1 text-zinc-400 hover:text-white rounded hover:bg-[#1d2737] transition-colors"
          title="Toggle Fullscreen"
        >
          {isFullscreen ? (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l5-5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5"
              />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
