/**
 * Parses custom WGSL shader source to extract @property and @texture metadata.
 *
 * Expected comment format:
 *   /// @property name: type = (default values)
 *   /// @texture name
 *
 * Supported property types: float, vec2, vec3, vec4
 * Max 3 @texture declarations per shader.
 */

export interface CustomPropertyDef {
  name: string;
  type: 'float' | 'vec2' | 'vec3' | 'vec4';
  default: number[];
  byteOffset: number;
  floatCount: number;
}

export interface CustomTextureDef {
  name: string;
  bindingIndex: number;
  samplerBindingIndex: number;
}

export interface CustomShaderDescriptor {
  properties: CustomPropertyDef[];
  textures: CustomTextureDef[];
  uniformBufferSize: number;
  fragmentSource: string;
}

const MAX_CUSTOM_TEXTURES = 3;

const FLOAT_COUNTS: Record<string, number> = {
  float: 1,
  vec2: 2,
  vec3: 3,
  vec4: 4,
};

const PROPERTY_RE = /^\/\/\/\s*@property\s+(\w+)\s*:\s*(float|vec2|vec3|vec4)\s*=\s*(.+)$/;
const TEXTURE_RE = /^\/\/\/\s*@texture\s+(\w+)\s*$/;

function parseDefaults(raw: string, floatCount: number): number[] {
  // Accept formats: (1, 2, 3), 1.0, (1.0), (1, 2)
  const stripped = raw.replace(/[()]/g, '').trim();
  const parts = stripped.split(',').map((s) => parseFloat(s.trim()));
  const result: number[] = [];
  for (let i = 0; i < floatCount; i++) {
    result.push(Number.isFinite(parts[i]) ? parts[i]! : 0);
  }
  return result;
}

export function parseCustomShader(wgslSource: string): CustomShaderDescriptor {
  const lines = wgslSource.split('\n');
  const properties: CustomPropertyDef[] = [];
  const textures: CustomTextureDef[] = [];
  const sourceLines: string[] = [];

  let byteOffset = 0;
  // Texture bindings start at 2 (0=custom uniforms, 1=scene uniforms)
  let nextTextureBinding = 2;

  for (const line of lines) {
    const trimmed = line.trim();

    const propMatch = trimmed.match(PROPERTY_RE);
    if (propMatch) {
      const name = propMatch[1]!;
      const type = propMatch[2] as CustomPropertyDef['type'];
      const floatCount = FLOAT_COUNTS[type]!;
      const defaults = parseDefaults(propMatch[3]!, floatCount);
      properties.push({
        name,
        type,
        default: defaults,
        byteOffset,
        floatCount,
      });
      // Each property occupies a 16-byte slot (std140 alignment)
      byteOffset += 16;
      continue;
    }

    const texMatch = trimmed.match(TEXTURE_RE);
    if (texMatch) {
      if (textures.length >= MAX_CUSTOM_TEXTURES) {
        console.warn(`[CustomShader] Max ${MAX_CUSTOM_TEXTURES} textures allowed, ignoring: ${texMatch[1]}`);
        continue;
      }
      textures.push({
        name: texMatch[1]!,
        bindingIndex: nextTextureBinding,
        samplerBindingIndex: nextTextureBinding + 1,
      });
      nextTextureBinding += 2;
      continue;
    }

    sourceLines.push(line);
  }

  // Uniform buffer size must be a multiple of 16 bytes (std140), minimum 16
  const uniformBufferSize = Math.max(byteOffset, 16);

  return {
    properties,
    textures,
    uniformBufferSize,
    fragmentSource: sourceLines.join('\n'),
  };
}
