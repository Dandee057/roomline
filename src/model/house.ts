import { walls, type Opening, type Room } from "./room.ts";

/**
 * The house: rooms placed on one plan (cm), each by its top-left floor corner. Walls are 10 cm thick and stand
 * outside each room's floor, so two rooms side by side have 20 cm between their floors (two walls back to back).
 * Rooms snap together at that gap, and a door on one room's wall that lands on its neighbour's wall becomes a
 * doorway through both, which is how the plan shows the flow from room to room.
 */

export const WALL = 10;          // cm, one wall's thickness
export const GAP = 2 * WALL;     // floor-to-floor between neighbouring rooms
export const SNAP = 30;          // cm within which a room snaps to a neighbour

export interface Box { x0: number; z0: number; x1: number; z1: number }
export const roomBox = (r: Room): Box => ({ x0: r.x, z0: r.z, x1: r.x + r.width, z1: r.z + r.length });

export function houseBounds(rooms: Room[]): Box {
  const bs = rooms.map(roomBox);
  return { x0: Math.min(...bs.map((b) => b.x0)), z0: Math.min(...bs.map((b) => b.z0)), x1: Math.max(...bs.map((b) => b.x1)), z1: Math.max(...bs.map((b) => b.z1)) };
}

/**
 * Where a room ends up when dropped at (x, z): each axis snaps to the nearest neighbour edge (back to back at the
 * wall gap, or lined up flush) within SNAP cm.
 */
export function snapRoom(rooms: Room[], id: string, x: number, z: number): [number, number] {
  const me = rooms.find((r) => r.id === id)!;
  const W = me.width, L = me.length;
  let bestX: [number, number] = [Infinity, x], bestZ: [number, number] = [Infinity, z];
  const tryX = (nx: number) => { const d = Math.abs(nx - x); if (d < SNAP && d < bestX[0]) bestX = [d, nx]; };
  const tryZ = (nz: number) => { const d = Math.abs(nz - z); if (d < SNAP && d < bestZ[0]) bestZ = [d, nz]; };
  for (const o of rooms) {
    if (o.id === id) continue;
    const b = roomBox(o);
    tryX(b.x1 + GAP); tryX(b.x0 - GAP - W); tryX(b.x0); tryX(b.x1 - W);
    tryZ(b.z1 + GAP); tryZ(b.z0 - GAP - L); tryZ(b.z0); tryZ(b.z1 - L);
  }
  return [Math.round(bestX[1]), Math.round(bestZ[1])];
}

/** Rooms whose floors (plus walls) would overlap. */
export function overlappingRooms(rooms: Room[]): [string, string][] {
  const out: [string, string][] = [];
  for (let i = 0; i < rooms.length; i++) for (let j = i + 1; j < rooms.length; j++) {
    const a = roomBox(rooms[i]), b = roomBox(rooms[j]);
    const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) + GAP, oz = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) + GAP;
    if (ox > 1 && oz > 1) out.push([rooms[i].id, rooms[j].id]);
  }
  return out;
}

export interface Connection {
  from: string; to: string; door: string;
  /** The doorway as an opening on the neighbour's wall (no leaf of its own). */
  passage: Opening;
}

/** Doors that open onto a neighbouring room's wall: those rooms are connected, and the neighbour gets a doorway. */
export function connections(rooms: Room[]): Connection[] {
  const out: Connection[] = [];
  for (const a of rooms) {
    const wa = walls(a);
    for (const door of a.openings.filter((o) => o.kind === "door")) {
      const w = wa[door.wall];
      const t = [(w.b[0] - w.a[0]) / w.length, (w.b[1] - w.a[1]) / w.length];
      // the door's two edges on the house plan
      const p0 = [a.x + w.a[0] + t[0] * door.offset, a.z + w.a[1] + t[1] * door.offset];
      const p1 = [p0[0] + t[0] * door.width, p0[1] + t[1] * door.width];
      // and the same edges pushed out through both walls, onto where a neighbour's inner wall face would be
      const q0 = [p0[0] - w.normal[0] * GAP, p0[1] - w.normal[1] * GAP], q1 = [p1[0] - w.normal[0] * GAP, p1[1] - w.normal[1] * GAP];
      for (const b of rooms) {
        if (b.id === a.id) continue;
        walls(b).forEach((v, i) => {
          if (Math.abs(v.normal[0] + w.normal[0]) > 1e-6 || Math.abs(v.normal[1] + w.normal[1]) > 1e-6) return; // must face back
          const tv = [(v.b[0] - v.a[0]) / v.length, (v.b[1] - v.a[1]) / v.length];
          const va = [b.x + v.a[0], b.z + v.a[1]];
          // both door edges must lie on this wall's line, within its length
          const along = (q: number[]) => (q[0] - va[0]) * tv[0] + (q[1] - va[1]) * tv[1];
          const off = (q: number[]) => Math.abs((q[0] - va[0]) * tv[1] - (q[1] - va[1]) * tv[0]);
          if (off(q0) > 3 || off(q1) > 3) return;
          const s0 = along(q0), s1 = along(q1), lo = Math.min(s0, s1), hi = Math.max(s0, s1);
          if (lo < -1 || hi > v.length + 1) return;
          out.push({ from: a.id, to: b.id, door: door.id, passage: { id: `p-${a.id}-${door.id}`, kind: "door", wall: i, offset: Math.max(0, lo), width: hi - lo } });
        });
      }
    }
  }
  return out;
}

/** Puts rooms that have no position yet (old links) side by side in a row. */
export function arrangeInRow(rooms: Room[]): Room[] {
  let x = 0;
  return rooms.map((r) => { const placed = { ...r, x, z: 0 }; x += r.width + GAP; return placed; });
}
