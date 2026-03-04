import { Component, GameObject, Scene } from '@certe/atmos-core';
import { MeshRenderer, createMaterial } from '@certe/atmos-renderer';
import { RandomRotator } from './RandomRotator.js';

const MESH_SOURCES = ['primitive:cube', 'primitive:sphere', 'primitive:cylinder', 'primitive:plane'];
const MATERIALS: [number, number, number, number, number, number][] = [
  // [r, g, b, a, metallic, roughness]
  [1.0, 0.2, 0.2, 1, 0.1, 0.6],
  [0.2, 0.8, 0.3, 1, 0.0, 0.8],
  [0.3, 0.3, 1.0, 1, 0.7, 0.2],
  [0.9, 0.9, 0.9, 1, 1.0, 0.1],
  [1.0, 0.7, 0.2, 1, 0.9, 0.3],
];

/**
 * Creates a 10x10 grid of PBR objects with random rotators.
 */
export class PBRGridSetup extends Component {
  private _initialized = false;

  onPlayStop(): void {
    this._initialized = false;
  }

  onUpdate(): void {
    if (this._initialized) return;
    this._initialized = true;

    const scene = Scene.current;
    if (!scene) return;

    const GRID = 10;
    const SPACING = 1.5;
    const offsetX = ((GRID - 1) * SPACING) / 2;
    const offsetZ = ((GRID - 1) * SPACING) / 2;

    for (let iz = 0; iz < GRID; iz++) {
      for (let ix = 0; ix < GRID; ix++) {
        const idx = iz * GRID + ix;
        const obj = new GameObject(`Obj_${idx}`);

        const x = ix * SPACING - offsetX;
        const z = iz * SPACING - offsetZ;
        obj.transform.setPosition(x, 0, z);

        const meshIdx = idx % MESH_SOURCES.length;
        if (MESH_SOURCES[meshIdx] === 'primitive:plane') {
          obj.transform.setScale(0.05, 0.05, 0.05);
        }
        const matIdx = idx % MATERIALS.length;
        const m = MATERIALS[matIdx]!;

        const mr = obj.addComponent(MeshRenderer);
        mr.meshSource = MESH_SOURCES[meshIdx]!;
        mr.material = createMaterial({
          albedo: [m[0], m[1], m[2], m[3]],
          metallic: m[4],
          roughness: m[5],
        });

        obj.addComponent(RandomRotator);
        scene.add(obj);
      }
    }
  }
}
