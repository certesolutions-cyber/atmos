import type { MaterialAssetData } from '@certe/atmos-renderer';
import { serializeMaterialAsset } from '@certe/atmos-renderer';
import type { ProjectFileSystem } from './project-fs.js';
import { DEFAULT_PROJECT_SETTINGS } from './project-settings.js';

const SEED_MATERIALS: Record<string, Omit<MaterialAssetData, 'name'>> = {
  default: { shader: 'pbr', albedo: [0.7, 0.7, 0.7, 1], metallic: 0, roughness: 0.5 },
  metal: { shader: 'pbr', albedo: [0.8, 0.8, 0.85, 1], metallic: 1, roughness: 0.3 },
  gold: { shader: 'pbr', albedo: [1.0, 0.76, 0.34, 1], metallic: 1, roughness: 0.35 },
  copper: { shader: 'pbr', albedo: [0.95, 0.64, 0.54, 1], metallic: 1, roughness: 0.4 },
  plastic: { shader: 'pbr', albedo: [0.8, 0.2, 0.2, 1], metallic: 0, roughness: 0.4 },
  rubber: { shader: 'pbr', albedo: [0.15, 0.15, 0.15, 1], metallic: 0, roughness: 0.95 },
  wood: { shader: 'pbr', albedo: [0.55, 0.35, 0.18, 1], metallic: 0, roughness: 0.7 },
  glass: { shader: 'pbr', albedo: [0.9, 0.95, 1.0, 1], metallic: 0, roughness: 0.1 },
};

export async function seedProject(projectFs: ProjectFileSystem): Promise<void> {
  // Only seed if materials/ doesn't exist yet
  const hasDir = await projectFs.exists('materials');
  if (hasDir) return;

  await projectFs.ensureDir('materials');
  await projectFs.ensureDir('scenes');

  const writes: Promise<void>[] = [];

  for (const [key, params] of Object.entries(SEED_MATERIALS)) {
    const name = key.charAt(0).toUpperCase() + key.slice(1);
    const data: MaterialAssetData = { name, ...params };
    const json = serializeMaterialAsset(data);
    writes.push(projectFs.writeFile(`materials/${key}.mat.json`, json));
  }

  // Empty scene
  writes.push(projectFs.writeFile('scenes/main.scene.json', '{}'));

  // Default project settings
  if (!(await projectFs.exists('project-settings.json'))) {
    writes.push(projectFs.writeFile(
      'project-settings.json',
      JSON.stringify(DEFAULT_PROJECT_SETTINGS, null, 2),
    ));
  }

  await Promise.all(writes);
}
