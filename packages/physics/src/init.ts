import RAPIER from '@dimforge/rapier3d-compat';

let initialized = false;

/**
 * WASM memory buffer from the Rapier module.
 * Used to patch raw joint data that the JS bindings don't fully expose.
 */
let wasmMemory: WebAssembly.Memory | null = null;

/**
 * Byte offset of `locked_axes` within a RawGenericJoint WASM struct.
 * Detected at init by comparing a Fixed and Revolute raw joint.
 */
let lockedAxesOffset = -1;

/** Initialize Rapier WASM. Idempotent – safe to call multiple times. */
export async function initRapier(): Promise<typeof RAPIER> {
  if (!initialized) {
    // RAPIER.init() returns void — intercept WebAssembly instantiation to capture the memory.
    // Browsers may use either instantiateStreaming or instantiate depending on MIME type.
    let capturedMemory: WebAssembly.Memory | null = null;

    const extractMemory = (instance: WebAssembly.Instance) => {
      const mem = instance.exports.memory as WebAssembly.Memory | undefined;
      if (mem) capturedMemory = mem;
    };

    const origInstantiate = WebAssembly.instantiate;
    WebAssembly.instantiate = (async (...args: unknown[]) => {
      const result = await (origInstantiate as Function).apply(WebAssembly, args);
      const inst = (result as { instance?: WebAssembly.Instance })?.instance;
      if (inst) extractMemory(inst);
      return result;
    }) as typeof WebAssembly.instantiate;

    const origStreaming = WebAssembly.instantiateStreaming;
    if (origStreaming) {
      WebAssembly.instantiateStreaming = (async (...args: unknown[]) => {
        const result = await (origStreaming as Function).apply(WebAssembly, args);
        const inst = (result as { instance?: WebAssembly.Instance })?.instance;
        if (inst) extractMemory(inst);
        return result;
      }) as typeof WebAssembly.instantiateStreaming;
    }

    try {
      await RAPIER.init();
    } finally {
      WebAssembly.instantiate = origInstantiate;
      if (origStreaming) WebAssembly.instantiateStreaming = origStreaming;
    }
    wasmMemory = capturedMemory;
    lockedAxesOffset = detectLockedAxesOffset();
    initialized = true;
  }
  return RAPIER;
}

/**
 * Detect the byte offset of `locked_axes` in the RawGenericJoint WASM struct.
 * Creates throwaway revolute (locked=0x37) and fixed (locked=0x3F) raw joints,
 * then scans for the differing byte.
 */
function detectLockedAxesOffset(): number {
  const v0 = new RAPIER.Vector3(0, 0, 0);
  const v1 = new RAPIER.Vector3(0, 1, 0);
  const q0 = new RAPIER.Quaternion(0, 0, 0, 1);

  const revolute = RAPIER.JointData.revolute(v0, v0, v1);
  const fixed = RAPIER.JointData.fixed(v0, q0, v0, q0);

  const rawRev = revolute.intoRaw();
  const rawFix = fixed.intoRaw();

  if (!rawRev || !rawFix || !wasmMemory) {
    rawRev?.free();
    rawFix?.free();
    return -1;
  }

  const ptrRev = (rawRev as unknown as { __wbg_ptr: number }).__wbg_ptr;
  const ptrFix = (rawFix as unknown as { __wbg_ptr: number }).__wbg_ptr;
  const bytes = new Uint8Array(wasmMemory.buffer);

  // Fixed locked_axes = 0x3F (all 6 DOFs locked)
  // Revolute locked_axes = 0x37 (all except AngX = bit 3)
  let offset = -1;
  for (let i = 0; i < 512; i++) {
    if (bytes[ptrRev + i] === 0x37 && bytes[ptrFix + i] === 0x3F) {
      offset = i;
      break;
    }
  }

  rawRev.free();
  rawFix.free();

  return offset;
}

/** Get the WASM memory buffer. Only available after initRapier(). */
export function getWasmMemory(): WebAssembly.Memory | null {
  return wasmMemory;
}

/** Get the detected locked_axes byte offset, or -1 if detection failed. */
export function getLockedAxesOffset(): number {
  return lockedAxesOffset;
}
