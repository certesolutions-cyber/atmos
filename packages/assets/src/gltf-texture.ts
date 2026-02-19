/**
 * Extract embedded textures from a glTF document.
 * Supports bufferView-embedded images and data URIs.
 * Actual RGBA decoding happens at instantiation time (requires DOM).
 */

import type { GltfDocument } from './gltf-parser.js';
import { readBufferView } from './gltf-parser.js';
import type { ModelTexture } from './types.js';

/**
 * Extract all images from the document as raw bytes.
 * Returns one ModelTexture per glTF image.
 * width/height are set to 0 here – they're resolved during GPU upload
 * via decodeImageToRGBA().
 */
export function extractTextures(doc: GltfDocument): ModelTexture[] {
  const images = doc.json.images ?? [];
  const textures: ModelTexture[] = [];

  for (let i = 0; i < images.length; i++) {
    const img = images[i]!;
    const mimeType = img.mimeType ?? 'image/png';

    let data: Uint8Array;

    if (img.bufferView !== undefined) {
      // Embedded in GLB binary chunk
      data = readBufferView(doc, img.bufferView);
    } else if (img.uri) {
      if (img.uri.startsWith('data:')) {
        data = decodeDataUri(img.uri);
      } else {
        // External URI – not supported in MVP, skip
        continue;
      }
    } else {
      continue;
    }

    textures.push({
      name: `texture_${i}`,
      data,
      width: 0,  // resolved at decode time
      height: 0,
      mimeType,
    });
  }

  return textures;
}

/** Decode a base64 data URI to raw bytes. */
function decodeDataUri(uri: string): Uint8Array {
  const commaIndex = uri.indexOf(',');
  if (commaIndex === -1) throw new Error('Invalid data URI');
  const base64 = uri.slice(commaIndex + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
