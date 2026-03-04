/**
 * Parses custom WGSL shader source to extract @property and @texture metadata.
 *
 * Expected comment format:
 *   /// @property name: type = (default values)
 *   /// @texture name
 *
 * Supported property types: float, vec2, vec3, vec4
 * Max 8 @texture declarations per shader.
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
  /** Vertex displacement code (lines between /// @vertex and @fragment fn). Null if no vertex section. */
  vertexSource: string | null;
  /** If true, shader is opaque: depth write enabled, backface culling, drawn with opaque objects. */
  opaque: boolean;
}

export const MAX_CUSTOM_TEXTURES = 8;

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

const VERTEX_MARKER_RE = /^\/\/\/\s*@vertex\s*$/;
const OPAQUE_RE = /^\/\/\/\s*@opaque\s*$/;
const FRAGMENT_FN_RE = /^@fragment\s+fn\b/;

export function parseCustomShader(wgslSource: string): CustomShaderDescriptor {
  const lines = wgslSource.split('\n');
  const properties: CustomPropertyDef[] = [];
  const textures: CustomTextureDef[] = [];
  const sourceLines: string[] = [];
  const vertexLines: string[] = [];

  let byteOffset = 0;
  // Texture bindings start at 2 (0=custom uniforms, 1=scene uniforms)
  let nextTextureBinding = 2;
  let inVertexSection = false;
  let opaque = false;

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

    // Detect /// @opaque marker
    if (OPAQUE_RE.test(trimmed)) {
      opaque = true;
      continue;
    }

    // Detect /// @vertex marker
    if (VERTEX_MARKER_RE.test(trimmed)) {
      inVertexSection = true;
      continue;
    }

    // Detect @fragment fn — ends vertex section, starts fragment
    if (inVertexSection && FRAGMENT_FN_RE.test(trimmed)) {
      inVertexSection = false;
      sourceLines.push(line);
      continue;
    }

    if (inVertexSection) {
      vertexLines.push(line);
    } else {
      sourceLines.push(line);
    }
  }

  // Uniform buffer size must be a multiple of 16 bytes (std140), minimum 16
  const uniformBufferSize = Math.max(byteOffset, 16);

  return {
    properties,
    textures,
    uniformBufferSize,
    fragmentSource: sourceLines.join('\n'),
    vertexSource: vertexLines.length > 0 ? vertexLines.join('\n') : null,
    opaque,
  };
}
