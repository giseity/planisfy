import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const VOID_ELEVATION = -32768;

export type ElevationPoint = {
  longitude: number;
  latitude: number;
};

export type SampleResult = {
  elevation: number;
  source: string;
};

export class HgtTile {
  readonly size: number;
  readonly south: number;
  readonly west: number;
  readonly north: number;
  readonly east: number;

  private constructor(
    readonly name: string,
    private readonly data: Buffer,
  ) {
    const samples = data.byteLength / 2;
    const size = Math.sqrt(samples);
    if (!Number.isInteger(size) || size < 2) {
      throw new Error(`Invalid HGT tile size for ${name}`);
    }

    const bounds = parseHgtTileName(name);
    this.size = size;
    this.south = bounds.south;
    this.west = bounds.west;
    this.north = bounds.south + 1;
    this.east = bounds.west + 1;
  }

  static fromBuffer(name: string, data: Buffer) {
    return new HgtTile(name, data);
  }

  contains(point: ElevationPoint) {
    return (
      point.latitude >= this.south &&
      point.latitude <= this.north &&
      point.longitude >= this.west &&
      point.longitude <= this.east
    );
  }

  sample(point: ElevationPoint): SampleResult | null {
    if (!this.contains(point)) return null;

    const max = this.size - 1;
    const x = clamp((point.longitude - this.west) * max, 0, max);
    const y = clamp((this.north - point.latitude) * max, 0, max);
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = Math.min(x0 + 1, max);
    const y1 = Math.min(y0 + 1, max);
    const dx = x - x0;
    const dy = y - y0;

    const samples = [
      { value: this.readSample(x0, y0), weight: (1 - dx) * (1 - dy) },
      { value: this.readSample(x1, y0), weight: dx * (1 - dy) },
      { value: this.readSample(x0, y1), weight: (1 - dx) * dy },
      { value: this.readSample(x1, y1), weight: dx * dy },
    ].filter((sample) => sample.value !== null);

    if (samples.length === 0) return null;

    const totalWeight = samples.reduce((sum, sample) => sum + sample.weight, 0);
    const elevation =
      samples.reduce((sum, sample) => sum + sample.value! * sample.weight, 0) /
      totalWeight;

    return {
      elevation: Math.round(elevation),
      source: this.name,
    };
  }

  private readSample(x: number, y: number) {
    const offset = (y * this.size + x) * 2;
    const value = this.data.readInt16BE(offset);
    return value === VOID_ELEVATION ? null : value;
  }
}

export class HgtTileSet {
  constructor(private readonly tiles: HgtTile[]) {}

  static async load(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    const tiles: HgtTile[] = [];

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".hgt")) {
        continue;
      }

      const tilePath = path.join(dir, entry.name);
      const data = await readFile(tilePath);
      tiles.push(HgtTile.fromBuffer(entry.name.replace(/\.hgt$/i, ""), data));
    }

    return new HgtTileSet(tiles);
  }

  get count() {
    return this.tiles.length;
  }

  sample(point: ElevationPoint) {
    for (const tile of this.tiles) {
      const sample = tile.sample(point);
      if (sample) return sample;
    }

    return null;
  }
}

export function parseHgtTileName(name: string) {
  const match = /([NS])(\d{2})([EW])(\d{3})/i.exec(name);
  if (!match) {
    throw new Error(`Invalid HGT tile name: ${name}`);
  }

  const south =
    Number(match[2]) * (match[1]!.toUpperCase() === "S" ? -1 : 1);
  const west =
    Number(match[4]) * (match[3]!.toUpperCase() === "W" ? -1 : 1);

  return { south, west };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
