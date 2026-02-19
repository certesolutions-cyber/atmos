/** Unlit vertex format: position(3) + color(3) = 6 floats, 24 bytes per vertex */
export interface GizmoGeometry {
  vertices: Float32Array;
  indices: Uint16Array;
}

const AXIS_COLORS = {
  x: [1.0, 0.2, 0.2] as const,
  y: [0.2, 1.0, 0.2] as const,
  z: [0.2, 0.4, 1.0] as const,
};

function pushVert(
  arr: Float32Array,
  offset: number,
  px: number, py: number, pz: number,
  r: number, g: number, b: number,
): number {
  arr[offset] = px; arr[offset + 1] = py; arr[offset + 2] = pz;
  arr[offset + 3] = r; arr[offset + 4] = g; arr[offset + 5] = b;
  return offset + 6;
}

function createArrow(
  vertices: Float32Array, indices: Uint16Array,
  vOff: number, iOff: number, baseVert: number,
  axis: 'x' | 'y' | 'z', segments: number,
): { vOff: number; iOff: number; vertCount: number } {
  const [r, g, b] = AXIS_COLORS[axis];
  const shaftLen = 0.8;
  const shaftRad = 0.02;
  const coneLen = 0.2;
  const coneRad = 0.06;

  // Helper to rotate (lx, ly, lz) from Y-up to axis direction
  const rotate = (lx: number, ly: number, lz: number): [number, number, number] => {
    if (axis === 'y') return [lx, ly, lz];
    if (axis === 'x') return [ly, lx, lz];
    return [lx, lz, ly]; // z
  };

  let v = vOff;
  let idx = iOff;

  // Shaft: cylinder from 0 to shaftLen along axis
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const c = Math.cos(a) * shaftRad;
    const s = Math.sin(a) * shaftRad;

    const [bx, by, bz] = rotate(c, 0, s);
    v = pushVert(vertices, v, bx, by, bz, r, g, b);

    const [tx, ty, tz] = rotate(c, shaftLen, s);
    v = pushVert(vertices, v, tx, ty, tz, r, g, b);
  }

  // Shaft indices
  for (let i = 0; i < segments; i++) {
    const a = baseVert + i * 2;
    const b2 = a + 1;
    const c2 = a + 2;
    const d = a + 3;
    indices[idx++] = a; indices[idx++] = b2; indices[idx++] = c2;
    indices[idx++] = c2; indices[idx++] = b2; indices[idx++] = d;
  }

  const shaftVerts = (segments + 1) * 2;

  // Cone: from shaftLen to shaftLen+coneLen
  const coneTip = baseVert + shaftVerts;
  const [tipX, tipY, tipZ] = rotate(0, shaftLen + coneLen, 0);
  v = pushVert(vertices, v, tipX, tipY, tipZ, r, g, b);

  const coneBase = coneTip + 1;
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const cx2 = Math.cos(a) * coneRad;
    const sz = Math.sin(a) * coneRad;
    const [bx, by, bz] = rotate(cx2, shaftLen, sz);
    v = pushVert(vertices, v, bx, by, bz, r, g, b);
  }

  // Cone indices (fan)
  for (let i = 0; i < segments; i++) {
    indices[idx++] = coneTip;
    indices[idx++] = coneBase + i;
    indices[idx++] = coneBase + i + 1;
  }

  const totalVerts = shaftVerts + 1 + segments + 1;
  return { vOff: v, iOff: idx, vertCount: totalVerts };
}

export function createTranslateGizmo(segments = 8): GizmoGeometry {
  const vertsPerArrow = (segments + 1) * 2 + 1 + segments + 1;
  const totalVerts = vertsPerArrow * 3;
  const indicesPerArrow = segments * 6 + segments * 3;
  const totalIndices = indicesPerArrow * 3;

  const vertices = new Float32Array(totalVerts * 6);
  const indices = new Uint16Array(totalIndices);

  let vOff = 0, iOff = 0, baseVert = 0;
  for (const axis of ['x', 'y', 'z'] as const) {
    const result = createArrow(vertices, indices, vOff, iOff, baseVert, axis, segments);
    vOff = result.vOff;
    iOff = result.iOff;
    baseVert += result.vertCount;
  }

  return { vertices: vertices.slice(0, vOff), indices: indices.slice(0, iOff) };
}

function createRing(
  vertices: Float32Array, indices: Uint16Array,
  vOff: number, iOff: number, baseVert: number,
  axis: 'x' | 'y' | 'z', segments: number,
  radius: number, tubeRadius: number,
): { vOff: number; iOff: number; vertCount: number } {
  const [r, g, b] = AXIS_COLORS[axis];
  const tubeSeg = 6;
  let v = vOff;
  let idx = iOff;

  const rotate = (lx: number, ly: number, lz: number): [number, number, number] => {
    if (axis === 'y') return [lx, ly, lz];
    if (axis === 'x') return [ly, lx, lz];
    return [lx, lz, ly];
  };

  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    const cx = Math.cos(theta) * radius;
    const cz = Math.sin(theta) * radius;

    for (let j = 0; j <= tubeSeg; j++) {
      const phi = (j / tubeSeg) * Math.PI * 2;
      const tx = cx + Math.cos(theta) * Math.cos(phi) * tubeRadius;
      const ty = Math.sin(phi) * tubeRadius;
      const tz = cz + Math.sin(theta) * Math.cos(phi) * tubeRadius;
      const [px, py, pz] = rotate(tx, ty, tz);
      v = pushVert(vertices, v, px, py, pz, r, g, b);
    }
  }

  // Indices
  const ringStride = tubeSeg + 1;
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < tubeSeg; j++) {
      const a = baseVert + i * ringStride + j;
      const b2 = a + ringStride;
      const c2 = a + 1;
      const d = b2 + 1;
      indices[idx++] = a; indices[idx++] = b2; indices[idx++] = c2;
      indices[idx++] = c2; indices[idx++] = b2; indices[idx++] = d;
    }
  }

  const totalVerts = (segments + 1) * (tubeSeg + 1);
  return { vOff: v, iOff: idx, vertCount: totalVerts };
}

export function createRotateGizmo(segments = 32): GizmoGeometry {
  const tubeSeg = 6;
  const vertsPerRing = (segments + 1) * (tubeSeg + 1);
  const totalVerts = vertsPerRing * 3;
  const indicesPerRing = segments * tubeSeg * 6;
  const totalIndices = indicesPerRing * 3;

  const vertices = new Float32Array(totalVerts * 6);
  const indices = new Uint16Array(totalIndices);

  let vOff = 0, iOff = 0, baseVert = 0;
  for (const axis of ['x', 'y', 'z'] as const) {
    const result = createRing(
      vertices, indices, vOff, iOff, baseVert,
      axis, segments, 1.0, 0.015,
    );
    vOff = result.vOff;
    iOff = result.iOff;
    baseVert += result.vertCount;
  }

  return { vertices: vertices.slice(0, vOff), indices: indices.slice(0, iOff) };
}

function createScaleArm(
  vertices: Float32Array, indices: Uint16Array,
  vOff: number, iOff: number, baseVert: number,
  axis: 'x' | 'y' | 'z', segments: number,
): { vOff: number; iOff: number; vertCount: number } {
  const [r, g, b] = AXIS_COLORS[axis];
  const lineLen = 0.8;
  const lineRad = 0.02;
  const boxSize = 0.06;

  const rotate = (lx: number, ly: number, lz: number): [number, number, number] => {
    if (axis === 'y') return [lx, ly, lz];
    if (axis === 'x') return [ly, lx, lz];
    return [lx, lz, ly];
  };

  let v = vOff;
  let idx = iOff;

  // Line shaft (same as translate shaft)
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const c = Math.cos(a) * lineRad;
    const s = Math.sin(a) * lineRad;
    const [bx, by, bz] = rotate(c, 0, s);
    v = pushVert(vertices, v, bx, by, bz, r, g, b);
    const [tx, ty, tz] = rotate(c, lineLen, s);
    v = pushVert(vertices, v, tx, ty, tz, r, g, b);
  }

  for (let i = 0; i < segments; i++) {
    const a = baseVert + i * 2;
    const b2 = a + 1; const c2 = a + 2; const d = a + 3;
    indices[idx++] = a; indices[idx++] = b2; indices[idx++] = c2;
    indices[idx++] = c2; indices[idx++] = b2; indices[idx++] = d;
  }

  const shaftVerts = (segments + 1) * 2;

  // Cube at end
  const cubeBase = baseVert + shaftVerts;
  const hs = boxSize;
  const cubePositions = [
    [-hs, -hs, -hs], [hs, -hs, -hs], [hs, hs, -hs], [-hs, hs, -hs],
    [-hs, -hs, hs], [hs, -hs, hs], [hs, hs, hs], [-hs, hs, hs],
  ] as const;

  for (const [lx, ly, lz] of cubePositions) {
    const [px, py, pz] = rotate(lx, ly + lineLen + hs, lz);
    v = pushVert(vertices, v, px, py, pz, r, g, b);
  }

  // Cube faces (6 faces, 12 tris)
  const ci = [
    0,1,2, 0,2,3, 4,6,5, 4,7,6,
    0,4,5, 0,5,1, 2,6,7, 2,7,3,
    0,3,7, 0,7,4, 1,5,6, 1,6,2,
  ];
  for (const i of ci) {
    indices[idx++] = cubeBase + i;
  }

  const totalVerts2 = shaftVerts + 8;
  return { vOff: v, iOff: idx, vertCount: totalVerts2 };
}

export function createScaleGizmo(segments = 8): GizmoGeometry {
  const vertsPerArm = (segments + 1) * 2 + 8;
  const totalVerts = vertsPerArm * 3;
  const indicesPerArm = segments * 6 + 36;
  const totalIndices = indicesPerArm * 3;

  const vertices = new Float32Array(totalVerts * 6);
  const indices = new Uint16Array(totalIndices);

  let vOff = 0, iOff = 0, baseVert = 0;
  for (const axis of ['x', 'y', 'z'] as const) {
    const result = createScaleArm(vertices, indices, vOff, iOff, baseVert, axis, segments);
    vOff = result.vOff;
    iOff = result.iOff;
    baseVert += result.vertCount;
  }

  return { vertices: vertices.slice(0, vOff), indices: indices.slice(0, iOff) };
}
