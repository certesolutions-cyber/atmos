import { Vec3 } from '@atmos/math';
import type { CameraSettings } from '@atmos/renderer';

const DEG_TO_RAD = Math.PI / 180;
const MAX_ELEVATION = 89 * DEG_TO_RAD;
const MIN_ELEVATION = -89 * DEG_TO_RAD;
const MIN_DISTANCE = 0.1;
const MAX_DISTANCE = 500;
const ORBIT_SPEED = 0.005;
const PAN_SPEED = 0.002;
const ZOOM_SPEED = 0.001;
const FOCUS_SPEED = 8; // exponential decay rate for smooth focus

export class OrbitCamera {
  azimuth: number;
  elevation: number;
  distance: number;
  readonly target: Float32Array;

  private _camera: CameraSettings | null = null;

  get camera(): CameraSettings | null {
    return this._camera;
  }

  private _canvas: HTMLCanvasElement | null = null;
  private _dragging: 'orbit' | 'pan' | null = null;
  private _lastX = 0;
  private _lastY = 0;

  // Smooth focus animation state
  private _focusTarget: Float32Array | null = null;
  private _focusDistance = 0;
  private _focusRafId = 0;
  private _focusPrevTime = 0;

  // Bound handlers for removal
  private readonly _onMouseDown = (e: MouseEvent) => this._handleMouseDown(e);
  private readonly _onMouseMove = (e: MouseEvent) => this._handleMouseMove(e);
  private readonly _onMouseUp = () => this._handleMouseUp();
  private readonly _onWheel = (e: WheelEvent) => this._handleWheel(e);
  private readonly _onContextMenu = (e: Event) => e.preventDefault();

  constructor(camera: CameraSettings) {
    this.target = Vec3.fromValues(camera.target[0]!, camera.target[1]!, camera.target[2]!);

    const dx = camera.eye[0]! - this.target[0]!;
    const dy = camera.eye[1]! - this.target[1]!;
    const dz = camera.eye[2]! - this.target[2]!;

    this.distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    this.elevation = Math.asin(dy / (this.distance || 1));
    this.azimuth = Math.atan2(dx, dz);
  }

  attach(canvas: HTMLCanvasElement, camera: CameraSettings): void {
    this.detach();
    this._canvas = canvas;
    this._camera = camera;

    canvas.addEventListener('mousedown', this._onMouseDown);
    canvas.addEventListener('mousemove', this._onMouseMove);
    canvas.addEventListener('mouseup', this._onMouseUp);
    canvas.addEventListener('wheel', this._onWheel, { passive: false });
    canvas.addEventListener('contextmenu', this._onContextMenu);
    window.addEventListener('mouseup', this._onMouseUp);
  }

  detach(): void {
    this._stopFocus();
    if (this._canvas) {
      this._canvas.removeEventListener('mousedown', this._onMouseDown);
      this._canvas.removeEventListener('mousemove', this._onMouseMove);
      this._canvas.removeEventListener('mouseup', this._onMouseUp);
      this._canvas.removeEventListener('wheel', this._onWheel);
      this._canvas.removeEventListener('contextmenu', this._onContextMenu);
      window.removeEventListener('mouseup', this._onMouseUp);
      this._canvas = null;
    }
    this._camera = null;
    this._dragging = null;
  }

  private _handleMouseDown(e: MouseEvent): void {
    // MMB = orbit
    if (e.button === 1) {
      this._dragging = e.shiftKey ? 'pan' : 'orbit';
      this._stopFocus();
      e.preventDefault();
    }
    // Alt + LMB = orbit (laptop alternative)
    if (e.button === 0 && e.altKey) {
      this._dragging = e.shiftKey ? 'pan' : 'orbit';
      this._stopFocus();
      e.preventDefault();
    }
    this._lastX = e.clientX;
    this._lastY = e.clientY;
  }

  private _handleMouseMove(e: MouseEvent): void {
    if (!this._dragging) return;

    const dx = e.clientX - this._lastX;
    const dy = e.clientY - this._lastY;
    this._lastX = e.clientX;
    this._lastY = e.clientY;

    if (this._dragging === 'orbit') {
      this.azimuth -= dx * ORBIT_SPEED;
      this.elevation += dy * ORBIT_SPEED;
      this.elevation = Math.max(MIN_ELEVATION, Math.min(MAX_ELEVATION, this.elevation));
    } else if (this._dragging === 'pan') {
      this._pan(dx, dy);
    }

    this._updateCamera();
  }

  private _handleMouseUp(): void {
    this._dragging = null;
  }

  private _handleWheel(e: WheelEvent): void {
    e.preventDefault();
    this._stopFocus();
    const zoomFactor = 1 + e.deltaY * ZOOM_SPEED;
    this.distance = Math.max(MIN_DISTANCE, Math.min(MAX_DISTANCE, this.distance * zoomFactor));
    this._updateCamera();
  }

  private _pan(dx: number, dy: number): void {
    const panScale = this.distance * PAN_SPEED;
    // Camera right vector from azimuth
    const rx = Math.cos(this.azimuth);
    const rz = -Math.sin(this.azimuth);
    // Camera up vector in screen space (perpendicular to forward and right)
    const ux = -Math.sin(this.elevation) * Math.sin(this.azimuth);
    const uy = Math.cos(this.elevation);
    const uz = -Math.sin(this.elevation) * Math.cos(this.azimuth);

    this.target[0] = this.target[0]! - (rx * dx - ux * dy) * panScale;
    this.target[1] = this.target[1]! - (-uy * dy) * panScale;
    this.target[2] = this.target[2]! - (rz * dx - uz * dy) * panScale;
  }

  /** Smoothly animate the orbit camera to look at the given world position. */
  focusOn(worldPos: Float32Array, distance?: number): void {
    this._focusTarget = Vec3.fromValues(worldPos[0]!, worldPos[1]!, worldPos[2]!);
    this._focusDistance = distance ?? Math.max(this.distance, 3);
    this._focusPrevTime = 0;
    if (!this._focusRafId) {
      this._focusRafId = requestAnimationFrame((t) => this._focusTick(t));
    }
  }

  private _stopFocus(): void {
    if (this._focusRafId) {
      cancelAnimationFrame(this._focusRafId);
      this._focusRafId = 0;
    }
    this._focusTarget = null;
  }

  private _focusTick(time: number): void {
    this._focusRafId = 0;
    if (!this._focusTarget) return;

    const dt = this._focusPrevTime ? (time - this._focusPrevTime) / 1000 : 1 / 60;
    this._focusPrevTime = time;

    const t = 1 - Math.exp(-FOCUS_SPEED * dt);

    this.target[0] = this.target[0]! + (this._focusTarget[0]! - this.target[0]!) * t;
    this.target[1] = this.target[1]! + (this._focusTarget[1]! - this.target[1]!) * t;
    this.target[2] = this.target[2]! + (this._focusTarget[2]! - this.target[2]!) * t;
    this.distance += (this._focusDistance - this.distance) * t;

    this._updateCamera();

    // Stop when close enough
    const dx = this._focusTarget[0]! - this.target[0]!;
    const dy = this._focusTarget[1]! - this.target[1]!;
    const dz = this._focusTarget[2]! - this.target[2]!;
    const remaining = dx * dx + dy * dy + dz * dz;
    const distDelta = Math.abs(this._focusDistance - this.distance);

    if (remaining < 0.0001 && distDelta < 0.001) {
      Vec3.copy(this.target, this._focusTarget);
      this.distance = this._focusDistance;
      this._updateCamera();
      this._focusTarget = null;
      return;
    }

    this._focusRafId = requestAnimationFrame((t2) => this._focusTick(t2));
  }

  /** Recompute eye from spherical coords and write to the given camera */
  applyToCamera(camera: CameraSettings): void {
    const cosEl = Math.cos(this.elevation);
    Vec3.set(
      camera.eye,
      this.target[0]! + this.distance * cosEl * Math.sin(this.azimuth),
      this.target[1]! + this.distance * Math.sin(this.elevation),
      this.target[2]! + this.distance * cosEl * Math.cos(this.azimuth),
    );
    Vec3.copy(camera.target, this.target);
  }

  private _updateCamera(): void {
    if (!this._camera) return;
    this.applyToCamera(this._camera);
  }
}
