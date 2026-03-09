export type {
  DetailTypeConfig,
  DetailInstance,
  DetailBrushConfig,
} from './types.js';
export {
  DEFAULT_DETAIL_TYPE_CONFIG,
  DEFAULT_DETAIL_BRUSH_CONFIG,
  DETAIL_INSTANCE_STRIDE,
  DETAIL_INSTANCE_STRIDE_BYTES,
} from './types.js';
export { DETAIL_VERTEX_SHADER, DETAIL_FRAGMENT_SHADER } from './detail-shader.js';
export { createDetailPipeline, createCrossBillboardQuad } from './detail-pipeline.js';
export type { DetailPipelineResources } from './detail-pipeline.js';
export { DetailSystem } from './detail-system.js';
export type { TextureLoaderFn } from './detail-system.js';
export { DetailBrush } from './detail-brush.js';
export type { HeightFn } from './detail-brush.js';
export { registerDetailBuiltins } from './register-builtins.js';
