import { useRef, useState, useEffect, Suspense, useMemo, useCallback } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Environment, useGLTF, Bounds, Center, useBounds } from "@react-three/drei";
import { Ruler, Scissors } from "lucide-react";
import { useScadStore } from "../store/scadStore";
import {
  findCircles,
  findSnap,
  MeasureMarkers,
  MeasurePanel,
  type Section,
  SECTION_COLOR,
  type Snap,
  SectionPanel,
  sectionPlane,
} from "@/components/ViewerTools";

function Model({
  url,
  viewMode,
  onLoaded,
  section,
  onBounds,
  onPick,
  onHover,
}: {
  url: string;
  viewMode: string;
  onLoaded?: () => void;
  section: Section | null;
  onBounds: (bounds: THREE.Box3) => void;
  onPick?: (snap: Snap) => void;
  onHover?: (snap: Snap | null) => void;
}) {
  const { scene } = useGLTF(url);
  const rootRef = useRef<THREE.Group>(null);
  const gl = useThree((state) => state.gl);
  const camera = useThree((state) => state.camera);

  // Each render produces a new model URL; drop old models from useGLTF's cache
  useEffect(() => () => useGLTF.clear(url), [url]);

  // Bounds in model (OpenSCAD) coordinates; the cached scene isn't moved by <Center>
  useEffect(() => {
    onBounds(new THREE.Box3().setFromObject(scene));
  }, [scene, onBounds]);

  // Shared by every material: empty without a section, one world-space plane with one
  const clippingPlanes = useMemo<THREE.Plane[]>(() => [], []);
  const worldPlane = useMemo(() => new THREE.Plane(), []);
  const capMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: SECTION_COLOR,
        side: THREE.BackSide,
        clippingPlanes,
      }),
    [clippingPlanes],
  );

  // Keep the plane in world space; <Center> may move the model after it loads
  useFrame(() => {
    const root = rootRef.current;
    if (!section || !root) {
      clippingPlanes.length = 0;
      capMaterial.visible = false;
      return;
    }
    sectionPlane(section, worldPlane).applyMatrix4(root.matrixWorld);
    clippingPlanes[0] = worldPlane;
    capMaterial.visible = true;
  });

  const { clonedScene, circleCenters } = useMemo(() => {
    if (!scene) return { clonedScene: null, circleCenters: [] };

    // Clone the scene to avoid mutating useGLTF's cached instance
    const cloned = scene.clone();

    // Collect the meshes first: the caps and edges added below are children that
    // traverse() would otherwise visit too (and cap again, forever)
    const meshes: any[] = [];
    cloned.traverse((child: any) => {
      if (child.isMesh && child.geometry) meshes.push(child);
    });

    // Circle centers for snapping, relative to the model root
    const circleCenters: THREE.Vector3[] = [];
    cloned.updateMatrixWorld(true);

    for (const child of meshes) {
      // Clone material so we don't mutate a potentially shared material
      if (child.material) {
        child.material = child.material.clone();
        child.material.clippingPlanes = clippingPlanes;
      }

      // Inside faces show through a section cut; color them so the cut reads as solid
      const cap = new THREE.Mesh(child.geometry, capMaterial);
      cap.userData = { isSectionCap: true };
      child.add(cap);

      if (child.material) {
        child.material.wireframe = viewMode === "wireframe";
        child.material.visible = true;
      }

      // Sharp edges (over 20° between faces): drawn in EDGES mode, snapped to when measuring.
      // Guard against geometry without positions, which makes EdgesGeometry throw.
      if (child.geometry.attributes?.position) {
        try {
          const edgesGeo = new THREE.EdgesGeometry(child.geometry, 20);
          child.userData.snapEdges = edgesGeo.attributes.position.array;
          for (const { center } of findCircles(child.userData.snapEdges)) {
            circleCenters.push(center.applyMatrix4(child.matrixWorld));
          }
          if (viewMode === "shaded-wireframe") {
            const lineMat = new THREE.LineBasicMaterial({ color: 0x111111, clippingPlanes });
            const lineSegments = new THREE.LineSegments(edgesGeo, lineMat);
            lineSegments.userData = { isScadEdges: true };
            child.add(lineSegments);
          }
        } catch (err) {
          console.warn("Could not create EdgesGeometry for mesh", err);
        }
      }
    }

    return { clonedScene: cloned, circleCenters };
  }, [scene, viewMode, clippingPlanes, capMaterial]);

  const markerRadius = useMemo(
    () =>
      Math.max(
        new THREE.Box3().setFromObject(scene).getSize(new THREE.Vector3()).length() * 0.003,
        0.03,
      ),
    [scene],
  );

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

  // Measuring listens on the canvas itself rather than on the model, so circle centers
  // can be picked over empty space too (e.g. the middle of a through-hole)
  useEffect(() => {
    const model = clonedScene;
    if (!model || (!onHover && !onPick)) return;
    const canvas = gl.domElement;
    const raycaster = new THREE.Raycaster();

    // The point to measure under the cursor: snapped to a corner, circle center or edge
    // unless Alt is held, or null when there is nothing to measure there
    const snapAt = (event: MouseEvent): Snap | null => {
      const rect = canvas.getBoundingClientRect();
      const cursor = new THREE.Vector2(event.clientX - rect.left, event.clientY - rect.top);
      const size = { width: rect.width, height: rect.height };
      raycaster.setFromCamera(
        new THREE.Vector2((cursor.x / size.width) * 2 - 1, -(cursor.y / size.height) * 2 + 1),
        camera,
      );
      const clip = clippingPlanes.length > 0 ? worldPlane : null;

      let hit: THREE.Intersection | null = null;
      for (const candidate of raycaster.intersectObject(model, true)) {
        if (candidate.object.userData.isScadEdges) continue;
        // Raycasting ignores clipping, so skip hits on the removed side of the section
        if (clip && clip.distanceToPoint(candidate.point) < -1e-6) continue;
        hit = candidate;
        break;
      }

      if (hit?.object.userData.isSectionCap) {
        // The colored cut is drawn on the far inner wall; the visible spot is on the plane
        hit = {
          ...hit,
          point: raycaster.ray.intersectPlane(worldPlane, new THREE.Vector3()) ?? hit.point,
          face: null,
        };
      }
      if (event.altKey) return hit ? { point: hit.point.clone(), type: "surface" } : null;

      const rootMatrix = rootRef.current?.matrixWorld ?? new THREE.Matrix4();
      return (
        findSnap({
          hit: hit && !hit.object.userData.isSectionCap ? hit : null,
          centers: circleCenters.map((center) => center.clone().applyMatrix4(rootMatrix)),
          cursor,
          camera,
          size,
          clip,
        }) ?? (hit ? { point: hit.point.clone(), type: "surface" } : null)
      );
    };

    let frame: number | null = null;
    let lastMove: PointerEvent | null = null;
    let down: { x: number; y: number } | null = null;

    const onPointerMove = (event: PointerEvent) => {
      if (!onHover) return;
      // No previews while orbiting
      if (event.buttons !== 0) {
        lastMove = null;
        return;
      }
      lastMove = event;
      frame ??= requestAnimationFrame(() => {
        frame = null;
        if (lastMove) onHover(snapAt(lastMove));
      });
    };
    const onPointerDown = (event: PointerEvent) => {
      down = { x: event.clientX, y: event.clientY };
    };
    const onPointerUp = (event: PointerEvent) => {
      if (!down || !onPick || event.button !== 0) return;
      // Ignore clicks that ended an orbit drag
      const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y);
      down = null;
      if (moved > 4) return;
      const snap = snapAt(event);
      if (snap) onPick(snap);
    };
    const onPointerLeave = () => {
      lastMove = null;
      onHover?.(null);
    };

    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointerleave", onPointerLeave);
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointerleave", onPointerLeave);
    };
  }, [clonedScene, circleCenters, gl, camera, onHover, onPick, clippingPlanes, worldPlane]);

  return clonedScene ? (
    <group ref={rootRef}>
      <primitive object={clonedScene} />
      {/* While measuring, show where circle centers can be picked */}
      {onHover &&
        circleCenters.slice(0, 500).map((center, i) => (
          <mesh key={i} position={center} renderOrder={999}>
            <sphereGeometry args={[markerRadius, 8, 8]} />
            <meshBasicMaterial color={0xffffff} opacity={0.35} transparent depthTest={false} />
          </mesh>
        ))}
    </group>
  ) : null;
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

  // Viewer tools
  const [bounds, setBounds] = useState<THREE.Box3 | null>(null);
  const [section, setSection] = useState<Section | null>(null);
  const [measuring, setMeasuring] = useState(false);
  const [measurePoints, setMeasurePoints] = useState<THREE.Vector3[]>([]);
  const modelSize = bounds ? bounds.getSize(new THREE.Vector3()).length() : 1;

  // A new render can move the model, so earlier measurement points no longer apply
  useEffect(() => setMeasurePoints([]), [modelUrl]);

  // Keep the section plane inside the (new) model bounds
  useEffect(() => {
    if (!bounds) return;
    setSection((prev) => {
      if (!prev) return prev;
      const min = bounds.min.getComponent(prev.axis);
      const max = bounds.max.getComponent(prev.axis);
      return { ...prev, offset: THREE.MathUtils.clamp(prev.offset, min, max) };
    });
  }, [bounds]);

  const toggleSection = () => {
    setSection((prev) => {
      if (prev) return null;
      const center = bounds ? bounds.getCenter(new THREE.Vector3()).z : 0;
      return { axis: 2, offset: center, flipped: false };
    });
  };

  const toggleMeasuring = () => {
    setMeasuring((prev) => !prev);
    setMeasurePoints([]);
  };

  const handlePick = useCallback((snap: Snap) => {
    // A third click starts a new measurement
    setMeasurePoints((prev) => (prev.length >= 2 ? [snap.point] : [...prev, snap.point]));
  }, []);

  // Snap preview under the cursor, updated at most once per frame
  const [hoverSnap, setHoverSnap] = useState<Snap | null>(null);
  const hoverFrame = useRef<number | null>(null);
  const pendingHover = useRef<Snap | null>(null);
  const handleHover = useCallback((snap: Snap | null) => {
    pendingHover.current = snap;
    hoverFrame.current ??= requestAnimationFrame(() => {
      hoverFrame.current = null;
      const next = pendingHover.current;
      // Skip re-rendering while the snapped point stays the same
      setHoverSnap((prev) =>
        prev && next && prev.type === next.type && prev.point.equals(next.point) ? prev : next,
      );
    });
  }, []);
  useEffect(() => {
    if (measuring) return;
    // Drop a preview that is still waiting for its frame
    if (hoverFrame.current !== null) cancelAnimationFrame(hoverFrame.current);
    hoverFrame.current = null;
    setHoverSnap(null);
  }, [measuring]);

  useEffect(() => {
    if (!measuring) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMeasurePoints([]);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [measuring]);

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

      {/* Tool panels (top-right) */}
      {(section || measuring) && (
        <div className="absolute top-3 right-3 z-20 flex flex-col space-y-2">
          {section && (
            <SectionPanel
              section={section}
              bounds={bounds}
              onChange={setSection}
              onClose={() => setSection(null)}
            />
          )}
          {measuring && (
            <MeasurePanel
              points={measurePoints}
              onClear={() => setMeasurePoints([])}
              onClose={toggleMeasuring}
            />
          )}
        </div>
      )}

      <div className={`w-full h-full z-10 ${measuring ? "cursor-crosshair" : ""}`}>
        <Canvas
          shadows
          camera={{ position: [20, 20, 20], fov: 50 }}
          gl={{ toneMappingExposure: exposure, localClippingEnabled: true }}
        >
          <Suspense fallback={null}>
            <Environment preset="city" />
            <ambientLight intensity={0.5} />
            <directionalLight position={[10, 10, 10]} intensity={1} castShadow />
            {modelUrl && (
              <Bounds clip observe>
                <BoundsFit boundsApiRef={boundsApiRef} />
                <Center>
                  <Model
                    url={modelUrl}
                    viewMode={viewMode}
                    onLoaded={handleResetCamera}
                    section={section}
                    onBounds={setBounds}
                    onPick={measuring ? handlePick : undefined}
                    onHover={measuring ? handleHover : undefined}
                  />
                </Center>
              </Bounds>
            )}
            {measuring && (
              <MeasureMarkers points={measurePoints} hover={hoverSnap} size={modelSize} />
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

        {/* Section Plane */}
        <button
          onClick={toggleSection}
          className={`p-1 rounded transition-colors ${
            section
              ? "text-scad-amber bg-scad-amber-bg border border-scad-amber/20"
              : "text-zinc-400 hover:text-white hover:bg-[#1d2737]"
          }`}
          title="Section Plane"
        >
          <Scissors className="h-3.5 w-3.5" />
        </button>

        {/* Measure */}
        <button
          onClick={toggleMeasuring}
          className={`p-1 rounded transition-colors ${
            measuring
              ? "text-scad-amber bg-scad-amber-bg border border-scad-amber/20"
              : "text-zinc-400 hover:text-white hover:bg-[#1d2737]"
          }`}
          title="Measure Distance"
        >
          <Ruler className="h-3.5 w-3.5" />
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
