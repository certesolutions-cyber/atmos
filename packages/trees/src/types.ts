/**
 * Types and constants for procedural tree generation and rendering.
 */

/**
 * Branch growth mode:
 * - 'decurrent': Sympodial — branches fork equally at each level (oak, maple).
 * - 'excurrent': Monopodial — strong central trunk with lateral branches (spruce, fir).
 */
export type BranchMode = 'decurrent' | 'excurrent';

/** L-system rule: maps a symbol to a replacement string with optional probability. */
export interface LSystemRule {
  symbol: string;
  replacement: string;
  /** Probability weight for stochastic rules (default 1.0). */
  probability?: number;
}

/** Full configuration for a tree species. */
export interface TreeSpeciesConfig {
  name: string;

  // Growth mode
  /** Branch growth pattern. Default 'decurrent'. */
  branchMode: BranchMode;

  // L-system
  axiom: string;
  rules: LSystemRule[];
  iterations: number;
  /** Branch angle in degrees. */
  branchAngle: number;
  /** Random angle variance in degrees. */
  angleVariance: number;

  // Excurrent-specific
  /** Lateral branch sub-division depth in excurrent mode (1 = simple, higher = more complex). */
  excurrentBranchIterations: number;
  /** Segment length multiplier for lateral branches in excurrent mode (0.1–1.0). */
  excurrentBranchScale: number;

  // Geometry
  trunkRadius: number;
  /** Radius taper per branch level. */
  radiusTaper: number;
  /** Length of one F segment. */
  segmentLength: number;
  /** Radial segments for cylinder cross-section. */
  radialSegments: number;
  /** Random curvature offset per segment. */
  curvature: number;

  // Leaves
  /** Leaf quads per branch tip. */
  leafCount: number;
  leafWidth: number;
  leafHeight: number;

  // Billboard LOD
  lodDistance: number;
  /** Max draw distance for billboards. 0 = auto (lodDistance * 4). */
  drawDistance: number;
  billboardWidth: number;
  billboardHeight: number;

  // Variants
  /** Number of mesh variants per species (different seeds → different shapes). */
  variants: number;

  // Scale
  scaleMultiplier: number;
  /** Deterministic seed for PRNG. */
  seed: number;
}

/** Default species config. */
export const DEFAULT_TREE_SPECIES_CONFIG: TreeSpeciesConfig = {
  name: 'default',
  branchMode: 'decurrent',
  axiom: 'FFA',
  rules: [
    { symbol: 'A', replacement: 'F[+FA][-FA][&FA][^FA]' },
  ],
  iterations: 4,
  branchAngle: 25,
  angleVariance: 5,
  excurrentBranchIterations: 2,
  excurrentBranchScale: 0.5,
  trunkRadius: 0.15,
  radiusTaper: 0.65,
  segmentLength: 1.0,
  radialSegments: 6,
  curvature: 0.05,
  leafCount: 3,
  leafWidth: 0.8,
  leafHeight: 0.8,
  variants: 3,
  lodDistance: 80,
  drawDistance: 0,
  billboardWidth: 6,
  billboardHeight: 8,
  scaleMultiplier: 1.0,
  seed: 42,
};

/** Per-instance data for a placed tree. */
export interface TreeInstance {
  x: number;
  y: number;
  z: number;
  /** Y-axis rotation in radians. */
  rotationY: number;
  /** Uniform scale factor. */
  scale: number;
  /** Random wind phase offset. */
  windPhase: number;
}

/** Output of the tree mesh generator. */
export interface TreeMeshData {
  trunkVertices: Float32Array;
  trunkIndices: Uint32Array;
  leafVertices: Float32Array;
  leafIndices: Uint32Array;
}

/**
 * Vertex stride for tree mesh vertices (floats):
 * position(3) + normal(3) + uv(2) + windWeight(1) + branchLevel(1) = 10
 */
export const TREE_VERTEX_STRIDE = 10;

/** Vertex stride in bytes. */
export const TREE_VERTEX_STRIDE_BYTES = TREE_VERTEX_STRIDE * 4; // 40

/**
 * Instance stride (floats):
 * position(3) + rotY(1) + scale(1) + windPhase(1) + pad(2) = 8
 */
export const INSTANCE_STRIDE = 8;

/** Instance stride in bytes. */
export const INSTANCE_STRIDE_BYTES = INSTANCE_STRIDE * 4; // 32

/** Tree brush configuration. */
export interface TreeBrushConfig {
  radius: number;
  density: number;
  speciesIndex: number;
  scaleMin: number;
  scaleMax: number;
  eraseMode: boolean;
}

export const DEFAULT_TREE_BRUSH_CONFIG: TreeBrushConfig = {
  radius: 10,
  density: 0.5,
  speciesIndex: 0,
  scaleMin: 0.8,
  scaleMax: 1.2,
  eraseMode: false,
};
