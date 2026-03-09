/**
 * Turtle-graphics interpreter that converts an L-system string into tree mesh data.
 *
 * Produces separate trunk and leaf geometry with per-vertex windWeight and branchLevel.
 */

import type { TreeSpeciesConfig, TreeMeshData } from './types.js';
import { TREE_VERTEX_STRIDE } from './types.js';
import { mulberry32 } from './lsystem.js';

interface TurtleState {
  posX: number; posY: number; posZ: number;
  // Local coordinate frame (heading, left, up)
  hx: number; hy: number; hz: number; // heading (forward)
  lx: number; ly: number; lz: number; // left
  ux: number; uy: number; uz: number; // up
  radius: number;
  depth: number;
}

function cloneState(s: TurtleState): TurtleState {
  return { ...s };
}

/** Rotate heading/left around up axis (yaw). */
function yaw(s: TurtleState, angle: number): void {
  const c = Math.cos(angle);
  const sn = Math.sin(angle);
  const hx = s.hx * c + s.lx * sn;
  const hy = s.hy * c + s.ly * sn;
  const hz = s.hz * c + s.lz * sn;
  const lx = -s.hx * sn + s.lx * c;
  const ly = -s.hy * sn + s.ly * c;
  const lz = -s.hz * sn + s.lz * c;
  s.hx = hx; s.hy = hy; s.hz = hz;
  s.lx = lx; s.ly = ly; s.lz = lz;
}

/** Rotate heading/up around left axis (pitch). */
function pitch(s: TurtleState, angle: number): void {
  const c = Math.cos(angle);
  const sn = Math.sin(angle);
  const hx = s.hx * c + s.ux * sn;
  const hy = s.hy * c + s.uy * sn;
  const hz = s.hz * c + s.uz * sn;
  const ux = -s.hx * sn + s.ux * c;
  const uy = -s.hy * sn + s.uy * c;
  const uz = -s.hz * sn + s.uz * c;
  s.hx = hx; s.hy = hy; s.hz = hz;
  s.ux = ux; s.uy = uy; s.uz = uz;
}

/** Rotate left/up around heading axis (roll). */
function roll(s: TurtleState, angle: number): void {
  const c = Math.cos(angle);
  const sn = Math.sin(angle);
  const lx = s.lx * c + s.ux * sn;
  const ly = s.ly * c + s.uy * sn;
  const lz = s.lz * c + s.uz * sn;
  const ux = -s.lx * sn + s.ux * c;
  const uy = -s.ly * sn + s.uy * c;
  const uz = -s.lz * sn + s.uz * c;
  s.lx = lx; s.ly = ly; s.lz = lz;
  s.ux = ux; s.uy = uy; s.uz = uz;
}

/**
 * Generate a ring of vertices around the turtle's current position.
 * Returns the base index of the first vertex in the ring.
 */
function emitRing(
  verts: number[],
  state: TurtleState,
  radialSegs: number,
  windWeight: number,
  branchLevel: number,
  vCoord: number,
): number {
  const baseIdx = verts.length / TREE_VERTEX_STRIDE;
  const { posX, posY, posZ, lx, ly, lz, ux, uy, uz, radius } = state;

  for (let i = 0; i <= radialSegs; i++) {
    const theta = (i / radialSegs) * Math.PI * 2;
    const ct = Math.cos(theta);
    const st = Math.sin(theta);

    // Normal in local frame, transformed to world
    const nx = lx * ct + ux * st;
    const ny = ly * ct + uy * st;
    const nz = lz * ct + uz * st;

    // Position = center + normal * radius
    const px = posX + nx * radius;
    const py = posY + ny * radius;
    const pz = posZ + nz * radius;

    const u = i / radialSegs;
    verts.push(px, py, pz, nx, ny, nz, u, vCoord, windWeight, branchLevel);
  }

  return baseIdx;
}

/**
 * Connect two rings with triangle strip indices.
 */
function connectRings(
  indices: number[],
  baseA: number,
  baseB: number,
  radialSegs: number,
): void {
  for (let i = 0; i < radialSegs; i++) {
    const a0 = baseA + i;
    const a1 = baseA + i + 1;
    const b0 = baseB + i;
    const b1 = baseB + i + 1;
    indices.push(a0, a1, b0);
    indices.push(a1, b1, b0);
  }
}

/**
 * Emit a leaf quad at the given position/orientation.
 */
function emitLeaf(
  verts: number[],
  indices: number[],
  cx: number, cy: number, cz: number,
  rightX: number, rightY: number, rightZ: number,
  upX: number, upY: number, upZ: number,
  width: number, height: number,
  normalX: number, normalY: number, normalZ: number,
  windWeight: number, branchLevel: number,
): void {
  const baseIdx = verts.length / TREE_VERTEX_STRIDE;
  const hw = width * 0.5;

  // 4 corners: bottom-left, bottom-right, top-right, top-left
  const corners = [
    [-hw, 0], [hw, 0], [hw, height], [-hw, height],
  ] as const;

  for (const [u, v] of corners) {
    const px = cx + rightX * u + upX * v;
    const py = cy + rightY * u + upY * v;
    const pz = cz + rightZ * u + upZ * v;
    const uvU = (u / hw + 1) * 0.5;
    const uvV = 1.0 - v / height;
    verts.push(px, py, pz, normalX, normalY, normalZ, uvU, uvV, windWeight, branchLevel);
  }

  indices.push(baseIdx, baseIdx + 1, baseIdx + 2);
  indices.push(baseIdx, baseIdx + 2, baseIdx + 3);
}

/**
 * Convert an L-system output string into trunk and leaf mesh data.
 */
export function generateTreeMesh(
  lsystemOutput: string,
  config: TreeSpeciesConfig,
): TreeMeshData {
  const rand = mulberry32(config.seed + 7919); // offset from L-system seed
  const DEG2RAD = Math.PI / 180;
  const baseAngle = config.branchAngle * DEG2RAD;
  const variance = config.angleVariance * DEG2RAD;

  const trunkVerts: number[] = [];
  const trunkIndices: number[] = [];
  const leafVerts: number[] = [];
  const leafIndices: number[] = [];

  const stack: TurtleState[] = [];
  const state: TurtleState = {
    posX: 0, posY: 0, posZ: 0,
    hx: 0, hy: 1, hz: 0,  // heading = up
    lx: 1, ly: 0, lz: 0,  // left = right
    ux: 0, uy: 0, uz: -1, // up = -z (forward)
    radius: config.trunkRadius,
    depth: 0,
  };

  // Track max depth for branchLevel normalization
  let maxDepth = 0;

  // Track max Y for windWeight normalization
  let maxY = 0.001;

  // First pass: determine maxDepth
  {
    let d = 0;
    for (let i = 0; i < lsystemOutput.length; i++) {
      const ch = lsystemOutput[i];
      if (ch === '[') { d++; maxDepth = Math.max(maxDepth, d); }
      else if (ch === ']') { d--; }
    }
  }
  if (maxDepth === 0) maxDepth = 1;

  // First pass for maxY: simulate turtle movement
  {
    let py = 0;
    const yStack: number[] = [];
    let hy = 1;
    const hyStack: number[] = [];
    for (let i = 0; i < lsystemOutput.length; i++) {
      const ch = lsystemOutput[i];
      if (ch === 'F') {
        py += hy * config.segmentLength;
        maxY = Math.max(maxY, py);
      } else if (ch === '[') {
        yStack.push(py);
        hyStack.push(hy);
      } else if (ch === ']') {
        py = yStack.pop() ?? 0;
        hy = hyStack.pop() ?? 1;
      } else if (ch === '+' || ch === '-' || ch === '&' || ch === '^') {
        // Rough: branch angle changes heading Y component
        hy *= Math.cos(baseAngle);
      }
    }
  }

  // Scale leaves by tree height — taller trees get proportionally bigger leaves
  const leafScale = Math.sqrt(maxY);
  const leafW = config.leafWidth * leafScale;
  const leafH = config.leafHeight * leafScale;

  const radialSegs = config.radialSegments;
  let prevRingBase = -1;
  let segmentCount = 0;

  // Wind params at branch junction — child's first ring must match parent's last ring
  let anchorWindW = 0;
  let anchorBranchL = 0;

  // Per-segment radius taper — smooth gradual narrowing within each branch
  // Derived from radiusTaper so thinner branches taper faster visually
  const segmentTaper = Math.pow(config.radiusTaper, 0.3);

  function angle(): number {
    return baseAngle + (rand() - 0.5) * 2 * variance;
  }

  for (let i = 0; i < lsystemOutput.length; i++) {
    const ch = lsystemOutput[i];

    switch (ch) {
      case 'F': {
        // Apply curvature
        if (config.curvature > 0) {
          pitch(state, (rand() - 0.5) * config.curvature);
          yaw(state, (rand() - 0.5) * config.curvature);
        }

        // Emit ring at current position (bottom of segment)
        if (prevRingBase < 0) {
          // First ring of a branch uses parent's wind params so it stays anchored
          prevRingBase = emitRing(trunkVerts, state, radialSegs, anchorWindW, anchorBranchL, segmentCount);
        }

        // Move forward
        state.posX += state.hx * config.segmentLength;
        state.posY += state.hy * config.segmentLength;
        state.posZ += state.hz * config.segmentLength;
        segmentCount++;

        // Taper radius smoothly per segment
        state.radius *= segmentTaper;

        // Emit ring at new position (top of segment) with tapered radius
        const windW = Math.max(0, Math.min(1, state.posY / maxY));
        const branchL = Math.min(1, state.depth / maxDepth);
        const newRing = emitRing(trunkVerts, state, radialSegs, windW, branchL, segmentCount);

        connectRings(trunkIndices, prevRingBase, newRing, radialSegs);
        prevRingBase = newRing;
        break;
      }

      case '+': yaw(state, angle()); break;
      case '-': yaw(state, -angle()); break;
      case '&': pitch(state, angle()); break;
      case '^': pitch(state, -angle()); break;
      case '\\': roll(state, angle()); break;
      case '/': roll(state, -angle()); break;

      case '[': {
        stack.push(cloneState(state));
        // Save parent's wind params as anchor for child branch's first ring
        anchorWindW = Math.max(0, Math.min(1, state.posY / maxY));
        anchorBranchL = Math.min(1, state.depth / maxDepth);
        state.depth++;
        // Don't taper radius here — the branch starts at the parent's current
        // radius so there's no step at the junction. The per-segment taper
        // (segmentTaper) and subsequent child branches handle narrowing.
        prevRingBase = -1;
        segmentCount = 0;
        break;
      }

      case ']':
        if (stack.length > 0) {
          const restored = stack.pop()!;
          Object.assign(state, restored);
          // Restore anchor to parent's wind params
          anchorWindW = Math.max(0, Math.min(1, state.posY / maxY));
          anchorBranchL = Math.min(1, state.depth / maxDepth);
          prevRingBase = -1;
          segmentCount = 0;
        }
        break;

      case 'A': // Terminal growth point — emit leaves at branch tip (smaller)
      case 'L': {
        // Terminal tips get smaller leaves
        const tipScale = ch === 'A' ? 0.6 : 1.0;
        const lw = leafW * tipScale;
        const lh = leafH * tipScale;

        // Compute wind params to match the parent branch tip
        const leafWindWeight = Math.max(0, Math.min(1, state.posY / maxY));
        const leafBranchLevel = Math.min(1, state.depth / maxDepth);

        // Emit leaves at current position
        for (let l = 0; l < config.leafCount; l++) {
          const rotAngle = (l / config.leafCount) * Math.PI * 2 + rand() * 0.5;
          const tiltAngle = rand() * 0.4 + 0.2;

          // Compute leaf orientation
          const cosR = Math.cos(rotAngle);
          const sinR = Math.sin(rotAngle);
          const cosT = Math.cos(tiltAngle);
          const sinT = Math.sin(tiltAngle);

          // Right vector (around heading axis)
          const rx = state.lx * cosR + state.ux * sinR;
          const ry = state.ly * cosR + state.uy * sinR;
          const rz = state.lz * cosR + state.uz * sinR;

          // Up vector (tilted from heading)
          const upx = state.hx * cosT + (state.lx * (-sinR) + state.ux * cosR) * sinT;
          const upy = state.hy * cosT + (state.ly * (-sinR) + state.uy * cosR) * sinT;
          const upz = state.hz * cosT + (state.lz * (-sinR) + state.uz * cosR) * sinT;

          // Normal = cross(right, up)
          const nx = ry * upz - rz * upy;
          const ny = rz * upx - rx * upz;
          const nz = rx * upy - ry * upx;
          const nLen = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;

          emitLeaf(
            leafVerts, leafIndices,
            state.posX, state.posY, state.posZ,
            rx, ry, rz,
            upx, upy, upz,
            lw, lh,
            nx / nLen, ny / nLen, nz / nLen,
            leafWindWeight, leafBranchLevel,
          );
        }
        break;
      }

      // Unknown symbols: skip (already expanded by L-system)
      default: break;
    }
  }

  return {
    trunkVertices: new Float32Array(trunkVerts),
    trunkIndices: new Uint32Array(trunkIndices),
    leafVertices: new Float32Array(leafVerts),
    leafIndices: new Uint32Array(leafIndices),
  };
}
