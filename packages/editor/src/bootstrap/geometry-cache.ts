import {
  createCubeGeometry,
  createPlaneGeometry,
  createSphereGeometry,
  createCylinderGeometry,
  createMesh,
  VERTEX_STRIDE_FLOATS,
} from '@atmos/renderer';
import type { Mesh } from '@atmos/renderer';
import type { PrimitiveType } from '../editor-mount.js';

export type MeshRecord = Record<Exclude<PrimitiveType, 'camera'>, Mesh>;

export function createGeometryCache(device: GPUDevice): MeshRecord {
  const S = VERTEX_STRIDE_FLOATS;

  const cubeGeo = createCubeGeometry();
  const cubeMesh = createMesh(device, cubeGeo.vertices, cubeGeo.indices, S);
  cubeMesh.bounds = cubeGeo.bounds;

  const planeGeo = createPlaneGeometry(20, 20);
  const planeMesh = createMesh(device, planeGeo.vertices, planeGeo.indices, S);
  planeMesh.bounds = planeGeo.bounds;

  const sphereGeo = createSphereGeometry(0.5, 24, 16);
  const sphereMesh = createMesh(device, sphereGeo.vertices, sphereGeo.indices, S);
  sphereMesh.bounds = sphereGeo.bounds;

  const cylinderGeo = createCylinderGeometry(0.5, 0.5, 1, 16);
  const cylinderMesh = createMesh(device, cylinderGeo.vertices, cylinderGeo.indices, S);
  cylinderMesh.bounds = cylinderGeo.bounds;

  return { cube: cubeMesh, plane: planeMesh, sphere: sphereMesh, cylinder: cylinderMesh };
}
