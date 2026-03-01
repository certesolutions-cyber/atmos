/**
 * Singleton wrapper around the Web Audio API AudioContext.
 *
 * The AudioContext is created lazily on first access and automatically
 * resumed on user interaction (required by browser autoplay policies).
 */

let _ctx: AudioContext | null = null;
let _resumeListenerAdded = false;

/** Get (or create) the shared AudioContext. */
export function getAudioContext(): AudioContext {
  if (!_ctx) {
    _ctx = new AudioContext();
    _addResumeListener();
  }
  return _ctx;
}

/** Resume the AudioContext. Must be called from a user gesture. */
export function resumeAudioContext(): Promise<void> {
  return getAudioContext().resume();
}

/** Suspend the AudioContext (e.g. when pausing the game). */
export function suspendAudioContext(): Promise<void> {
  if (!_ctx) return Promise.resolve();
  return _ctx.suspend();
}

/** Destroy the AudioContext entirely. */
export async function closeAudioContext(): Promise<void> {
  if (!_ctx) return;
  await _ctx.close();
  _ctx = null;
}

/** Replace the AudioContext (for testing). */
export function setAudioContext(ctx: AudioContext | null): void {
  _ctx = ctx;
}

function _addResumeListener(): void {
  if (_resumeListenerAdded || typeof document === 'undefined') return;
  _resumeListenerAdded = true;
  const resume = (): void => {
    if (_ctx && _ctx.state === 'suspended') {
      void _ctx.resume();
    }
  };
  document.addEventListener('pointerdown', resume, { once: false });
  document.addEventListener('keydown', resume, { once: false });
}
