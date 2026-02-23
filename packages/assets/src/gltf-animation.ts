/**
 * Extract animation data from a glTF document.
 * Reads animation channels and samplers into ModelAnimation format.
 */

import type { GltfDocument } from './gltf-parser.js';
import { readAccessor } from './gltf-parser.js';
import type { ModelAnimation, ModelAnimationTrack } from './types.js';

/**
 * Extract all animations from the glTF document.
 */
export function extractAnimations(doc: GltfDocument): ModelAnimation[] {
  const gltfAnimations = doc.json.animations ?? [];
  const animations: ModelAnimation[] = [];

  for (let i = 0; i < gltfAnimations.length; i++) {
    const anim = gltfAnimations[i]!;
    const tracks: ModelAnimationTrack[] = [];

    for (const channel of anim.channels) {
      if (channel.target.node === undefined) continue;

      const path = channel.target.path;
      if (path !== 'translation' && path !== 'rotation' && path !== 'scale') continue;

      const sampler = anim.samplers[channel.sampler];
      if (!sampler) continue;

      const timesRaw = readAccessor(doc, sampler.input);
      const valuesRaw = readAccessor(doc, sampler.output);

      const times = timesRaw instanceof Float32Array
        ? timesRaw
        : new Float32Array(timesRaw);

      const values = valuesRaw instanceof Float32Array
        ? valuesRaw
        : new Float32Array(valuesRaw);

      const interpolation = sampler.interpolation === 'STEP' ? 'STEP' as const : 'LINEAR' as const;

      tracks.push({
        targetNode: channel.target.node,
        path,
        interpolation,
        times,
        values,
      });
    }

    if (tracks.length > 0) {
      animations.push({
        name: anim.name ?? `animation_${i}`,
        tracks,
      });
    }
  }

  return animations;
}
