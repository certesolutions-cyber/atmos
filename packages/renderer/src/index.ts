export { initWebGPU, resizeGPU } from './webgpu-device.js';
export type { GPUContext } from './webgpu-device.js';
export { VERTEX_SHADER, FRAGMENT_SHADER } from './shader.js';
export { createRenderPipeline } from './pipeline.js';
export type { PipelineResources } from './pipeline.js';
export { createMesh } from './mesh.js';
export type { Mesh } from './mesh.js';
export {
  createCubeGeometry,
  createPlaneGeometry,
  createSphereGeometry,
  createCylinderGeometry,
  VERTEX_STRIDE_FLOATS,
  VERTEX_STRIDE_BYTES,
} from './geometry.js';
export type { GeometryData } from './geometry.js';
export { createMaterial, writeMaterialUniforms, MATERIAL_UNIFORM_SIZE } from './material.js';
export type { Material, MaterialParams } from './material.js';
export { createDirectionalLight, writeSceneUniforms, SCENE_UNIFORM_SIZE } from './light.js';
export type { LightSettings } from './light.js';
export { MeshRenderer } from './mesh-renderer.js';
export { Camera } from './camera.js';
export { RenderSystem, createDefaultCamera } from './render-system.js';
export type { CameraSettings, OverlayCallback } from './render-system.js';
export { registerRendererBuiltins } from './register-builtins.js';
export {
  createDefaultMaterialAsset,
  serializeMaterialAsset,
  deserializeMaterialAsset,
} from './material-asset.js';
export type { ShaderType, MaterialAssetData } from './material-asset.js';
export { computeBoundingSphere } from './bounds.js';
export type { BoundingSphere } from './bounds.js';
export { createUnlitPipeline } from './unlit-pipeline.js';
export type { UnlitPipelineResources, UnlitPipelineOptions } from './unlit-pipeline.js';
export { GridRenderer } from './grid-renderer.js';
export { createTextureFromRGBA, decodeImageToRGBA, getWhiteFallbackTexture } from './texture.js';
export type { GPUTextureHandle } from './texture.js';
