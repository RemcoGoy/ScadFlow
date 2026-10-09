import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { findCircles, findSnap, sectionPlane, type Snap } from "@/components/ViewerTools";

// Three.js clips points whose signed distance to a clipping plane is negative
const kept = (plane: THREE.Plane, x: number, y: number, z: number) =>
  plane.distanceToPoint(new THREE.Vector3(x, y, z)) >= 0;

describe("sectionPlane", () => {
  it("keeps the part below the offset by default", () => {
    const plane = sectionPlane({ axis: 2, offset: 5, flipped: false });
    expect(kept(plane, 0, 0, 4)).toBe(true);
    expect(kept(plane, 0, 0, 6)).toBe(false);
  });

  it("keeps the part above the offset when flipped", () => {
    const plane = sectionPlane({ axis: 0, offset: -2, flipped: true });
    expect(kept(plane, -1, 0, 0)).toBe(true);
    expect(kept(plane, -3, 0, 0)).toBe(false);
  });

  it("only depends on the chosen axis", () => {
    const plane = sectionPlane({ axis: 1, offset: 0, flipped: false });
    expect(kept(plane, 100, -1, 100)).toBe(true);
    expect(kept(plane, -100, 1, -100)).toBe(false);
  });
});

describe("findSnap", () => {
  // A 10mm cube seen from above by an orthographic camera: 100px for 20mm, so 5px per mm
  const setup = () => {
    const geometry = new THREE.BoxGeometry(10, 10, 10);
    const mesh = new THREE.Mesh(geometry);
    mesh.userData.snapEdges = new THREE.EdgesGeometry(geometry, 20).attributes.position.array;
    mesh.updateMatrixWorld();
    const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 100);
    camera.position.set(0, 0, 50);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
    const size = { width: 100, height: 100 };
    const snapAt = (x: number, y: number, clip?: THREE.Plane) => {
      const hitPoint = new THREE.Vector3(x, y, 5);
      // The cursor is right above the hit point
      const ndc = hitPoint.clone().project(camera);
      const cursor = new THREE.Vector2(((ndc.x + 1) / 2) * 100, ((1 - ndc.y) / 2) * 100);
      return findSnap({
        hit: { point: hitPoint, object: mesh },
        cursor,
        camera,
        size,
        clip,
      }) as Snap;
    };
    return { snapAt };
  };

  it("snaps to a nearby corner", () => {
    const snap = setup().snapAt(4.5, 4.5);
    expect(snap.type).toBe("vertex");
    expect(snap.point.toArray()).toEqual([5, 5, 5]);
  });

  it("snaps to an edge midpoint", () => {
    const snap = setup().snapAt(0.2, 4.6);
    expect(snap.type).toBe("midpoint");
    expect(snap.point.toArray()).toEqual([0, 5, 5]);
  });

  it("snaps to the closest point on an edge", () => {
    const snap = setup().snapAt(2.5, 4.7);
    expect(snap.type).toBe("edge");
    expect(snap.point.x).toBeCloseTo(2.5);
    expect(snap.point.y).toBeCloseTo(5);
  });

  it("uses the surface point when nothing is close", () => {
    const snap = setup().snapAt(0, 0);
    expect(snap.type).toBe("surface");
    expect(snap.point.toArray()).toEqual([0, 0, 5]);
  });

  it("skips targets removed by the section plane", () => {
    // Keep x <= 4.8, so the corner at x = 5 is cut away
    const clip = sectionPlane({ axis: 0, offset: 4.8, flipped: false });
    const snap = setup().snapAt(4.5, 4.5, clip);
    expect(snap.type).toBe("edge");
    expect(snap.point.x).toBeLessThanOrEqual(4.8);
  });
});

describe("findCircles", () => {
  const edgesOf = (geometry: THREE.BufferGeometry) =>
    new THREE.EdgesGeometry(geometry, 20).attributes.position.array;

  it("finds both rims of a smooth cylinder", () => {
    const circles = findCircles(edgesOf(new THREE.CylinderGeometry(5, 5, 10, 32)));
    expect(circles).toHaveLength(2);
    const centers = circles.map((c) => c.center.toArray().map((v) => Math.round(v * 1000) / 1000));
    expect(centers).toEqual(
      expect.arrayContaining([
        [0, 5, 0],
        [0, -5, 0],
      ]),
    );
    for (const circle of circles) expect(circle.radius).toBeCloseTo(5);
  });

  it("finds the rims of a coarse cylinder whose sides are sharp edges too", () => {
    // 8 segments: 45° between side faces, so every vertex also has a vertical edge
    const circles = findCircles(edgesOf(new THREE.CylinderGeometry(3, 3, 4, 8)));
    expect(circles).toHaveLength(2);
    for (const circle of circles) {
      expect(circle.center.x).toBeCloseTo(0);
      expect(circle.center.z).toBeCloseTo(0);
      expect(circle.radius).toBeCloseTo(3);
    }
  });

  it("finds an off-center circle", () => {
    const geometry = new THREE.CylinderGeometry(2, 2, 1, 24).translate(10, 0, -4);
    const circles = findCircles(edgesOf(geometry));
    expect(circles).toHaveLength(2);
    expect(circles[0].center.x).toBeCloseTo(10);
    expect(circles[0].center.z).toBeCloseTo(-4);
  });

  it("ignores squares and boxes", () => {
    expect(findCircles(edgesOf(new THREE.BoxGeometry(10, 10, 10)))).toEqual([]);
  });

  it("ignores a cone's tip", () => {
    // The base is a circle; the slanted side edges meet at the tip but form no loop
    const circles = findCircles(edgesOf(new THREE.ConeGeometry(4, 6, 6)));
    expect(circles).toHaveLength(1);
    expect(circles[0].center.y).toBeCloseTo(-3);
  });
});

describe("findSnap with circle centers", () => {
  const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 100);
  camera.position.set(0, 0, 50);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  const size = { width: 100, height: 100 };

  it("snaps to a center without a surface under the cursor", () => {
    // The center of a through-hole at (2, 2, 0): 5px per mm, cursor 1mm away
    const center = new THREE.Vector3(2, 2, 0);
    const cursor = new THREE.Vector2(((2 + 1 + 10) / 20) * 100, ((10 - 2) / 20) * 100);
    const snap = findSnap({ hit: null, centers: [center], cursor, camera, size });
    expect(snap?.type).toBe("center");
    expect(snap?.point.toArray()).toEqual([2, 2, 0]);
  });

  it("returns null when there is no hit and no center nearby", () => {
    const snap = findSnap({
      hit: null,
      centers: [new THREE.Vector3(8, 8, 0)],
      cursor: new THREE.Vector2(50, 50),
      camera,
      size,
    });
    expect(snap).toBeNull();
  });
});
