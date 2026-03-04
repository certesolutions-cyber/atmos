import { Component } from "@certe/atmos-core";

export abstract class TerrainDensityProvider extends Component {
  abstract terrainDensity: (x: number, y: number, z: number) => number;
  /** True once the density function is ready to be queried. */
  abstract get ready(): boolean;
}
