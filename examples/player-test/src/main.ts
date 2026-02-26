import { startPlayer } from '@atmos/editor';
import { createEditorPhysics } from '@atmos/editor';

const scriptModules = import.meta.glob('./scripts/*.ts', { eager: true });

const physics = await createEditorPhysics();

await startPlayer({
  scene: 'scenes/main.scene.json',
  physics,
  scriptModules: scriptModules as Record<string, Record<string, unknown>>,
});
