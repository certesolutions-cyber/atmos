/**
 * Bit-packs chunk coordinates into a single number for use as a Map key.
 * Supports coordinates in the range [-511, 512] per axis (10 bits each).
 */
export function chunkKey(cx: number, cy: number, cz: number): number {
  // Offset to make values positive, then mask to 10 bits
  const x = (cx + 512) & 0x3FF;
  const y = (cy + 512) & 0x3FF;
  const z = (cz + 512) & 0x3FF;
  return (x << 20) | (y << 10) | z;
}

/** Unpack a chunk key back into [cx, cy, cz]. */
export function fromChunkKey(key: number): [number, number, number] {
  const x = ((key >>> 20) & 0x3FF) - 512;
  const y = ((key >>> 10) & 0x3FF) - 512;
  const z = (key & 0x3FF) - 512;
  return [x, y, z];
}

/** Convert world position to chunk coordinates. */
export function worldToChunk(
  wx: number, wy: number, wz: number,
  chunkWorldSize: number,
): [number, number, number] {
  return [
    Math.floor(wx / chunkWorldSize),
    Math.floor(wy / chunkWorldSize),
    Math.floor(wz / chunkWorldSize),
  ];
}
