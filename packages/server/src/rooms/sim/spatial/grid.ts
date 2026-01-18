type Bucket = {
  players: number[];
  bullets: number[];
  pickups: number[];
  obstacles: number[];
};

export type GridQueryType = "players" | "bullets" | "pickups" | "obstacles";

export class SpatialGrid {
  private readonly cellSize: number;
  private readonly buckets = new Map<string, Bucket>();

  constructor(cellSize: number) {
    this.cellSize = Math.max(1, Math.floor(cellSize));
  }

  clear() {
    this.buckets.clear();
  }

  insert(type: GridQueryType, id: number, x: number, y: number) {
    const key = this.keyFor(x, y);
    const bucket = this.buckets.get(key) ?? this.createBucket(key);
    bucket[type].push(id);
  }

  queryCircle(x: number, y: number, radius: number, types: GridQueryType[]): number[] {
    const result: number[] = [];
    const r = Math.max(0, radius);
    const minX = this.cellCoord(x - r);
    const maxX = this.cellCoord(x + r);
    const minY = this.cellCoord(y - r);
    const maxY = this.cellCoord(y + r);

    for (let cx = minX; cx <= maxX; cx++) {
      for (let cy = minY; cy <= maxY; cy++) {
        const bucket = this.buckets.get(this.keyForCell(cx, cy));
        if (!bucket) continue;
        for (const t of types) {
          result.push(...bucket[t]);
        }
      }
    }

    return result;
  }

  queryRect(left: number, top: number, right: number, bottom: number, types: GridQueryType[]): number[] {
    const result: number[] = [];
    const minX = this.cellCoord(left);
    const maxX = this.cellCoord(right);
    const minY = this.cellCoord(top);
    const maxY = this.cellCoord(bottom);

    for (let cx = minX; cx <= maxX; cx++) {
      for (let cy = minY; cy <= maxY; cy++) {
        const bucket = this.buckets.get(this.keyForCell(cx, cy));
        if (!bucket) continue;
        for (const t of types) {
          result.push(...bucket[t]);
        }
      }
    }
    return result;
  }

  private cellCoord(v: number): number {
    return Math.floor(v / this.cellSize);
  }

  private keyFor(x: number, y: number): string {
    return this.keyForCell(this.cellCoord(x), this.cellCoord(y));
  }

  private keyForCell(cx: number, cy: number): string {
    return `${cx},${cy}`;
  }

  private createBucket(key: string): Bucket {
    const bucket: Bucket = { players: [], bullets: [], pickups: [], obstacles: [] };
    this.buckets.set(key, bucket);
    return bucket;
  }
}
