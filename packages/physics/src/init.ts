import RAPIER from '@dimforge/rapier3d-compat';

let initialized = false;

/** Initialize Rapier WASM. Idempotent – safe to call multiple times. */
export async function initRapier(): Promise<typeof RAPIER> {
  if (!initialized) {
    await RAPIER.init();
    initialized = true;
  }
  return RAPIER;
}
