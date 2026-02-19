const MAX_DELTA = 1 / 10; // clamp to 100ms to avoid spiral of death

export class Time {
  deltaTime = 0;
  time = 0;
  frameCount = 0;

  private _lastTimestamp = 0;

  reset(): void {
    this.deltaTime = 0;
    this.time = 0;
    this.frameCount = 0;
    this._lastTimestamp = 0;
  }

  update(timestamp: number): void {
    if (this._lastTimestamp === 0) {
      this._lastTimestamp = timestamp;
    }
    const rawDelta = (timestamp - this._lastTimestamp) / 1000;
    this.deltaTime = Math.min(rawDelta, MAX_DELTA);
    this.time += this.deltaTime;
    this.frameCount++;
    this._lastTimestamp = timestamp;
  }
}
