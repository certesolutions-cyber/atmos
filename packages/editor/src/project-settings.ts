import type { ProjectFileSystem } from './project-fs.js';

export interface PhysicsSettings {
  gravity: [number, number, number];
  fixedTimestep: number;
  solverIterations: number;
  substeps: number;
}

export interface ProjectSettings {
  defaultScene?: string;
  physics: PhysicsSettings;
}

export const DEFAULT_PHYSICS_SETTINGS: PhysicsSettings = {
  gravity: [0, -9.81, 0],
  fixedTimestep: 1 / 60,
  solverIterations: 8,
  substeps: 1,
};

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  physics: { ...DEFAULT_PHYSICS_SETTINGS },
};

const SETTINGS_PATH = 'project-settings.json';

type ChangeListener = () => void;

export class ProjectSettingsManager {
  private _settings: ProjectSettings = deepClone(DEFAULT_PROJECT_SETTINGS);
  private readonly _fs: ProjectFileSystem;
  private readonly _listeners = new Set<ChangeListener>();

  constructor(fs: ProjectFileSystem) {
    this._fs = fs;
  }

  get settings(): Readonly<ProjectSettings> {
    return this._settings;
  }

  async load(): Promise<void> {
    try {
      if (await this._fs.exists(SETTINGS_PATH)) {
        const json = await this._fs.readTextFile(SETTINGS_PATH);
        const data = JSON.parse(json) as Partial<ProjectSettings>;
        this._settings = deepMerge(DEFAULT_PROJECT_SETTINGS, data);
      }
    } catch (err) {
      console.warn('[ProjectSettings] Failed to load, using defaults:', err);
      this._settings = deepClone(DEFAULT_PROJECT_SETTINGS);
    }
  }

  async save(): Promise<void> {
    const json = JSON.stringify(this._settings, null, 2);
    await this._fs.writeFile(SETTINGS_PATH, json);
  }

  async updateDefaultScene(name: string): Promise<void> {
    this._settings.defaultScene = name;
    await this.save();
  }

  async updatePhysics(partial: Partial<PhysicsSettings>): Promise<void> {
    Object.assign(this._settings.physics, partial);
    this._notify();
    await this.save();
  }

  onChange(fn: ChangeListener): () => void {
    this._listeners.add(fn);
    return () => { this._listeners.delete(fn); };
  }

  private _notify(): void {
    for (const fn of this._listeners) fn();
  }
}

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

function deepMerge(defaults: ProjectSettings, overrides: Partial<ProjectSettings>): ProjectSettings {
  const result = deepClone(defaults);
  if (overrides.defaultScene !== undefined) {
    result.defaultScene = overrides.defaultScene;
  }
  if (overrides.physics) {
    Object.assign(result.physics, overrides.physics);
  }
  return result;
}
