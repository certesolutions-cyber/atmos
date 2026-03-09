/**
 * Types and constants for terrain detail billboard rendering.
 */

/** Configuration for a detail type (e.g. "tall grass", "flower", "small rock"). */
export interface DetailTypeConfig {
  name: string;
  /** Billboard width in world units. */
  width: number;
  /** Billboard height in world units. */
  height: number;
  /** Distance at which fade begins. */
  fadeStart: number;
  /** Distance at which fully invisible. */
  fadeEnd: number;
  /** Random scale variation range [min, max]. */
  scaleMin: number;
  scaleMax: number;
  /** 0–1 color tint variation per instance. */
  colorVariation: number;
  /** Base albedo color [r, g, b], each 0–1. Multiplied with texture. */
  baseColor: [number, number, number];
}

export const DEFAULT_DETAIL_TYPE_CONFIG: DetailTypeConfig = {
  name: 'Grass',
  width: 0.4,
  height: 0.6,
  fadeStart: 30,
  fadeEnd: 50,
  scaleMin: 0.7,
  scaleMax: 1.3,
  colorVariation: 0.15,
  baseColor: [0.3, 0.5, 0.15],
};

/** Per-instance data for a placed detail billboard. */
export interface DetailInstance {
  x: number;
  y: number;
  z: number;
  /** Y-axis rotation in radians. */
  rotationY: number;
  /** Uniform scale factor. */
  scale: number;
  /** Random color tint offset (-1..1). */
  colorShift: number;
}

/** Detail brush configuration. */
export interface DetailBrushConfig {
  radius: number;
  density: number;
  typeIndex: number;
  scaleMin: number;
  scaleMax: number;
  eraseMode: boolean;
}

export const DEFAULT_DETAIL_BRUSH_CONFIG: DetailBrushConfig = {
  radius: 5,
  density: 8,
  typeIndex: 0,
  scaleMin: 0.7,
  scaleMax: 1.3,
  eraseMode: false,
};

/**
 * Instance stride (floats):
 * position(3) + rotY(1) + scale(1) + colorShift(1) + pad(2) = 8
 */
export const DETAIL_INSTANCE_STRIDE = 8;

/** Instance stride in bytes. */
export const DETAIL_INSTANCE_STRIDE_BYTES = DETAIL_INSTANCE_STRIDE * 4; // 32
