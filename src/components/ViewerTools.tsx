import { useMemo } from "react";
import * as THREE from "three";
import { Html, Line } from "@react-three/drei";
import { ArrowLeftRight, X } from "lucide-react";

// Section plane and measuring tools for the 3D viewer. The GLB keeps OpenSCAD's
// coordinates, so model space here is the same as the coordinates in the .scad file.

export const AXES = ["X", "Y", "Z"] as const;

export interface Section {
  axis: 0 | 1 | 2;
  // Position of the plane along the axis, in model coordinates
  offset: number;
  // false keeps the part below the plane, true the part above it
  flipped: boolean;
}

export const SECTION_COLOR = 0xe2a04e;

/** The section plane in model space. Three.js clips the side the normal points away from. */
export function sectionPlane({ axis, offset, flipped }: Section, target = new THREE.Plane()) {
  const normal = new THREE.Vector3().setComponent(axis, flipped ? 1 : -1);
  return target.set(normal, flipped ? -offset : offset);
}

// ---- Snapping for the measure tool ----

export type SnapType = "vertex" | "center" | "midpoint" | "edge" | "surface";

export interface Snap {
  point: THREE.Vector3;
  type: SnapType;
}

// How close (in screen pixels) the cursor must be to a snap target
export const SNAP_PX = 10;

const SNAP_PRIORITY: SnapType[] = ["vertex", "center", "midpoint", "edge"];

function toScreen(
  point: THREE.Vector3,
  camera: THREE.Camera,
  size: { width: number; height: number },
) {
  const ndc = point.clone().project(camera);
  return new THREE.Vector2(((ndc.x + 1) / 2) * size.width, ((1 - ndc.y) / 2) * size.height);
}

// World units covered by one screen pixel at the given point
function worldPerPixel(point: THREE.Vector3, camera: THREE.Camera, height: number) {
  if (camera instanceof THREE.OrthographicCamera) {
    return (camera.top - camera.bottom) / camera.zoom / height;
  }
  const fov = camera instanceof THREE.PerspectiveCamera ? camera.fov : 50;
  const distance = camera.getWorldPosition(new THREE.Vector3()).distanceTo(point);
  return (2 * distance * Math.tan(THREE.MathUtils.degToRad(fov) / 2)) / height;
}

export interface SnapHit {
  point: THREE.Vector3;
  object: THREE.Object3D;
  face?: THREE.Face | null;
}

/**
 * Find the point to measure: a corner, circle center, edge midpoint or point on a sharp
 * edge within SNAP_PX of the cursor, else the surface point under the cursor. Sharp
 * edges are read from `hit.object.userData.snapEdges` (pairs of local positions).
 * Circle centers (world space) can snap even without a hit, e.g. over a through-hole.
 * Returns null when there is neither a hit nor a nearby center.
 */
export function findSnap({
  hit,
  centers = [],
  cursor,
  camera,
  size,
  clip,
}: {
  hit: SnapHit | null;
  centers?: THREE.Vector3[];
  cursor: THREE.Vector2;
  camera: THREE.Camera;
  size: { width: number; height: number };
  clip?: THREE.Plane | null;
}): Snap | null {
  const best = new Map<SnapType, { point: THREE.Vector3; distance: number }>();
  const considerWorld = (type: SnapType, world: THREE.Vector3) => {
    // Targets on the removed side of a section aren't visible
    if (clip && clip.distanceToPoint(world) < -1e-6) return;
    const distance = toScreen(world, camera, size).distanceTo(cursor);
    if (distance > SNAP_PX) return;
    const current = best.get(type);
    if (!current || distance < current.distance) best.set(type, { point: world, distance });
  };

  for (const center of centers) considerWorld("center", center.clone());

  if (hit) {
    const { object, face } = hit;
    const consider = (type: SnapType, local: THREE.Vector3) =>
      considerWorld(type, local.clone().applyMatrix4(object.matrixWorld));

    // Corners of the triangle under the cursor
    const position = (object as THREE.Mesh).geometry?.getAttribute("position");
    if (face && position) {
      for (const index of [face.a, face.b, face.c]) {
        consider("vertex", new THREE.Vector3().fromBufferAttribute(position, index));
      }
    }

    // Sharp edges near the hit point (searched in local space)
    const edges: ArrayLike<number> | undefined = object.userData.snapEdges;
    if (edges) {
      const localHit = object.worldToLocal(hit.point.clone());
      const scale = object.getWorldScale(new THREE.Vector3());
      const radius =
        (SNAP_PX * 1.5 * worldPerPixel(hit.point, camera, size.height)) /
        Math.max(scale.x, scale.y, scale.z);
      const a = new THREE.Vector3();
      const b = new THREE.Vector3();
      const closest = new THREE.Vector3();
      const segment = new THREE.Line3(a, b);
      for (let i = 0; i + 5 < edges.length; i += 6) {
        a.set(edges[i], edges[i + 1], edges[i + 2]);
        b.set(edges[i + 3], edges[i + 4], edges[i + 5]);
        segment.closestPointToPoint(localHit, true, closest);
        if (closest.distanceTo(localHit) > radius) continue;
        consider("vertex", a);
        consider("vertex", b);
        consider("midpoint", a.clone().lerp(b, 0.5));
        consider("edge", closest);
      }
    }
  }

  for (const type of SNAP_PRIORITY) {
    const found = best.get(type);
    if (found) return { point: found.point, type };
  }
  return hit ? { point: hit.point.clone(), type: "surface" } : null;
}

// ---- Circle detection ----

export interface Circle {
  center: THREE.Vector3;
  radius: number;
}

// OpenSCAD's coarsest circle has 5 segments; 4 equal sides would also match squares
const MIN_CIRCLE_SEGMENTS = 5;
const MAX_TURN = THREE.MathUtils.degToRad(75);
const MIN_TURN = THREE.MathUtils.degToRad(0.5);

/**
 * Find circles among sharp edges (pairs of positions, as in `snapEdges`). OpenSCAD draws
 * circles, cylinders and holes as regular polygons, so a circle is a closed loop of
 * equal-length, coplanar edges that all turn by the same angle in the same direction.
 */
export function findCircles(edges: ArrayLike<number>): Circle[] {
  // Merge duplicate positions into shared vertices
  const vertices: THREE.Vector3[] = [];
  const ids = new Map<string, number>();
  const vertexId = (i: number) => {
    const [x, y, z] = [edges[i], edges[i + 1], edges[i + 2]];
    const key = `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`;
    let id = ids.get(key);
    if (id === undefined) {
      id = vertices.length;
      vertices.push(new THREE.Vector3(x, y, z));
      ids.set(key, id);
    }
    return id;
  };

  const neighbors: number[][] = [];
  const edgeList: [number, number][] = [];
  for (let i = 0; i + 5 < edges.length; i += 6) {
    const a = vertexId(i);
    const b = vertexId(i + 3);
    if (a === b) continue;
    edgeList.push([a, b]);
    (neighbors[a] ??= []).push(b);
    (neighbors[b] ??= []).push(a);
  }

  const direction = (from: number, to: number) =>
    vertices[to].clone().sub(vertices[from]).normalize();
  const length = (a: number, b: number) => vertices[a].distanceTo(vertices[b]);

  // Follow a regular polygon from the first edge and first turn; null if it doesn't close
  const followLoop = (start: number, second: number, third: number): number[] | null => {
    const edgeLength = length(start, second);
    const turn = direction(start, second).angleTo(direction(second, third));
    const normal = direction(start, second).cross(direction(second, third)).normalize();
    const path = [start, second, third];
    const visited = new Set(path);

    while (path.length < 5000) {
      const previous = path[path.length - 2];
      const current = path[path.length - 1];
      const incoming = direction(previous, current);
      let next = -1;
      for (const candidate of neighbors[current] ?? []) {
        if (candidate === previous) continue;
        if (Math.abs(length(current, candidate) - edgeLength) > edgeLength * 0.02) continue;
        const outgoing = direction(current, candidate);
        if (Math.abs(incoming.angleTo(outgoing) - turn) > turn * 0.02 + 1e-3) continue;
        if (incoming.clone().cross(outgoing).normalize().dot(normal) < 0.999) continue;
        next = candidate;
        break;
      }
      if (next === start) return path;
      if (next < 0 || visited.has(next)) return null;
      path.push(next);
      visited.add(next);
    }
    return null;
  };

  const edgeKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);
  const inCircle = new Set<string>();
  const circles: Circle[] = [];

  for (const [start, second] of edgeList) {
    if (inCircle.has(edgeKey(start, second))) continue;
    const edgeLength = length(start, second);
    for (const third of neighbors[second]) {
      if (third === start) continue;
      if (Math.abs(length(second, third) - edgeLength) > edgeLength * 0.02) continue;
      const turn = direction(start, second).angleTo(direction(second, third));
      if (turn < MIN_TURN || turn > MAX_TURN) continue;

      const loop = followLoop(start, second, third);
      if (!loop || loop.length < MIN_CIRCLE_SEGMENTS) continue;

      // All corners must be equally far from the center
      const center = loop
        .reduce((sum, id) => sum.add(vertices[id]), new THREE.Vector3())
        .divideScalar(loop.length);
      const radii = loop.map((id) => vertices[id].distanceTo(center));
      const radius = radii.reduce((sum, r) => sum + r, 0) / radii.length;
      if (radii.some((r) => Math.abs(r - radius) > radius * 0.01)) continue;

      loop.forEach((id, i) => inCircle.add(edgeKey(id, loop[(i + 1) % loop.length])));
      circles.push({ center, radius });
      break;
    }
  }
  return circles;
}

const formatMm = (value: number) => `${value.toFixed(2)} mm`;

const panelClass =
  "w-56 bg-[#131924]/90 border border-border-figma rounded-lg shadow-xl p-2.5 space-y-2 select-none font-sans text-[10px] text-zinc-400";

function PanelHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[9px] text-scad-amber font-bold uppercase tracking-wider">{title}</span>
      <button
        onClick={onClose}
        className="p-0.5 rounded text-zinc-500 hover:text-zinc-200 hover:bg-[#1d2737]"
        title="Close"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

export function SectionPanel({
  section,
  bounds,
  onChange,
  onClose,
}: {
  section: Section;
  bounds: THREE.Box3 | null;
  onChange: (section: Section) => void;
  onClose: () => void;
}) {
  const min = bounds ? bounds.min.getComponent(section.axis) : 0;
  const max = bounds ? bounds.max.getComponent(section.axis) : 0;
  const step = Math.max((max - min) / 500, 0.001);

  return (
    <div className={panelClass}>
      <PanelHeader title="Section" onClose={onClose} />
      <div className="flex items-center space-x-1">
        {AXES.map((name, axis) => (
          <button
            key={name}
            onClick={() => {
              // Start in the middle of the model along the new axis
              const center = bounds ? bounds.getCenter(new THREE.Vector3()).getComponent(axis) : 0;
              onChange({ ...section, axis: axis as Section["axis"], offset: center });
            }}
            className={`flex-1 py-0.5 rounded font-mono font-bold transition-colors ${
              section.axis === axis
                ? "bg-scad-amber text-[#0b0e14]"
                : "bg-[#0b0e14] text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {name}
          </button>
        ))}
        <button
          onClick={() => onChange({ ...section, flipped: !section.flipped })}
          className={`p-1 rounded transition-colors ${
            section.flipped
              ? "text-scad-amber bg-scad-amber-bg"
              : "text-zinc-400 hover:text-zinc-200 hover:bg-[#1d2737]"
          }`}
          title="Flip which side is kept"
        >
          <ArrowLeftRight className="h-3 w-3" />
        </button>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={section.offset}
        disabled={!bounds}
        onChange={(e) => onChange({ ...section, offset: Number(e.target.value) })}
        className="w-full accent-[#e2a04e]"
      />
      <div className="font-mono text-zinc-300">
        {AXES[section.axis]} = {section.offset.toFixed(2)}
        <span className="text-zinc-600">
          {" "}
          ({min.toFixed(1)} to {max.toFixed(1)})
        </span>
      </div>
    </div>
  );
}

export function MeasurePanel({
  points,
  onClear,
  onClose,
}: {
  points: THREE.Vector3[];
  onClear: () => void;
  onClose: () => void;
}) {
  const [a, b] = points;
  return (
    <div className={panelClass}>
      <PanelHeader title="Measure" onClose={onClose} />
      {!b ? (
        <p>
          {a ? "Click the second point." : "Click two points on the model."}
          <span className="block text-zinc-600 mt-1">
            Snaps to corners, circle centers and edges. Hold Alt for a free point.
          </span>
        </p>
      ) : (
        <>
          <div className="text-[13px] font-mono font-bold text-zinc-100">
            {formatMm(a.distanceTo(b))}
          </div>
          <div className="grid grid-cols-3 gap-1 font-mono">
            {AXES.map((name, axis) => (
              <div key={name}>
                <span className="text-zinc-600">Δ{name} </span>
                <span className="text-zinc-300">
                  {Math.abs(b.getComponent(axis) - a.getComponent(axis)).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
          <button
            onClick={onClear}
            className="py-0.5 px-2 bg-zinc-800 hover:bg-[#383838] text-zinc-400 rounded text-[9px]"
          >
            Clear
          </button>
        </>
      )}
    </div>
  );
}

const SNAP_LABELS: Record<SnapType, string> = {
  vertex: "corner",
  center: "center",
  midpoint: "midpoint",
  edge: "edge",
  surface: "",
};

/**
 * Markers, line and distance label for a measurement, plus a preview of the point
 * under the cursor (all in world coordinates).
 */
export function MeasureMarkers({
  points,
  hover,
  size,
}: {
  points: THREE.Vector3[];
  hover: Snap | null;
  size: number;
}) {
  const radius = Math.max(size * 0.006, 0.05);
  const [a, b] = points;
  const midpoint = useMemo(() => (a && b ? a.clone().lerp(b, 0.5) : null), [a, b]);
  // While placing the second point, preview the measurement to the cursor
  const previewTo = a && !b && hover ? hover.point : null;
  const snapped = hover && hover.type !== "surface";

  return (
    <group renderOrder={1000}>
      {points.map((point, i) => (
        <mesh key={i} position={point} renderOrder={1000}>
          <sphereGeometry args={[radius, 16, 16]} />
          {/* Always visible, even when the point is behind other geometry */}
          <meshBasicMaterial color={SECTION_COLOR} depthTest={false} transparent />
        </mesh>
      ))}
      {a && b && midpoint && (
        <>
          <Line
            points={[a, b]}
            color={SECTION_COLOR}
            lineWidth={2}
            depthTest={false}
            renderOrder={1000}
          />
          <Html position={midpoint} center style={{ pointerEvents: "none" }}>
            <div className="px-1.5 py-0.5 rounded bg-[#0b0e14]/90 border border-scad-amber/40 text-scad-amber font-mono text-[10px] whitespace-nowrap">
              {formatMm(a.distanceTo(b))}
            </div>
          </Html>
        </>
      )}
      {hover && (
        <>
          <mesh position={hover.point} renderOrder={1001}>
            <sphereGeometry args={[snapped ? radius * 1.2 : radius * 0.7, 16, 16]} />
            <meshBasicMaterial
              color={snapped ? SECTION_COLOR : 0xffffff}
              opacity={snapped ? 1 : 0.6}
              depthTest={false}
              transparent
            />
          </mesh>
          {(snapped || previewTo) && (
            <Html position={hover.point} style={{ pointerEvents: "none" }}>
              <div className="ml-2 -mt-5 px-1 rounded bg-[#0b0e14]/80 text-zinc-300 font-mono text-[9px] whitespace-nowrap">
                {SNAP_LABELS[hover.type]}
                {previewTo && a && (
                  <span className="text-scad-amber">
                    {snapped ? " · " : ""}
                    {formatMm(a.distanceTo(previewTo))}
                  </span>
                )}
              </div>
            </Html>
          )}
        </>
      )}
      {previewTo && a && (
        <Line
          points={[a, previewTo]}
          color={SECTION_COLOR}
          lineWidth={1}
          dashed
          dashSize={radius * 2}
          gapSize={radius * 1.5}
          transparent
          opacity={0.7}
          depthTest={false}
          renderOrder={1000}
        />
      )}
    </group>
  );
}
