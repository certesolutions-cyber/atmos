import { GameObject } from "@certe/atmos-core";
import { Vec3 } from "@certe/atmos-math";
import { registerTerrainBuiltins } from "@certe/atmos-terrain";
import { startEditor } from "@certe/atmos-editor";
import { World } from "./scripts/world.js";

registerTerrainBuiltins();

const app = await startEditor({
  setupScene({ scene }) {
    const terrainGo = new GameObject("Terrain");
    scene.add(terrainGo);
    terrainGo.addComponent(World);
  },
});

// Position camera above the terrain
const camera = app.renderSystem.camera;
Vec3.set(camera.eye, 20, 30, 50);
Vec3.set(camera.target, 20, 0, 20);
if (app.orbitCamera) {
  Vec3.set(app.orbitCamera.target, 20, 0, 20);
}
