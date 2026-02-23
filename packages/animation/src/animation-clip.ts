/** Interpolation mode for a keyframe track. */
export type Interpolation = 'LINEAR' | 'STEP';

/** Which transform channel a track controls. */
export type AnimationChannel = 'translation' | 'rotation' | 'scale';

/** A single track of keyframes targeting one joint's transform channel. */
export interface KeyframeTrack {
  jointIndex: number;
  channel: AnimationChannel;
  interpolation: Interpolation;
  /** Keyframe timestamps in seconds. */
  times: Float32Array;
  /** Keyframe values (3 floats for T/S, 4 floats for R per keyframe). */
  values: Float32Array;
}

/** A named animation clip containing multiple keyframe tracks. */
export interface AnimationClip {
  name: string;
  duration: number;
  tracks: readonly KeyframeTrack[];
}

/**
 * Create an animation clip. Computes duration from the max time across all tracks.
 */
export function createAnimationClip(
  name: string,
  tracks: KeyframeTrack[],
): AnimationClip {
  let duration = 0;
  for (const track of tracks) {
    if (track.times.length > 0) {
      const last = track.times[track.times.length - 1]!;
      if (last > duration) duration = last;
    }
  }
  return { name, duration, tracks };
}
