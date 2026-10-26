import { DOOR, OPENING_MARGIN, walls, type Opening, type Room } from "./room.ts";

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

/* ---------- Placing rooms by hand and connecting them ---------- */

export type Side = "left" | "right" | "above" | "below";
export type Align = "start" | "centre" | "end";

/** Where room `id` goes to sit on `side` of room `target`, back to back, lined up at the start, centre or end. */
export function placeBeside(rooms: Room[], id: string, target: string, side: Side, align: Align = "start"): [number, number] {
  const me = rooms.find((r) => r.id === id)!, t = roomBox(rooms.find((r) => r.id === target)!);
  const line = (lo: number, hi: number, size: number) => Math.round(align === "start" ? lo : align === "end" ? hi - size : lo + (hi - lo - size) / 2);
  switch (side) {
    case "right": return [t.x1 + GAP, line(t.z0, t.z1, me.length)];
    case "left": return [t.x0 - GAP - me.width, line(t.z0, t.z1, me.length)];
    case "below": return [line(t.x0, t.x1, me.width), t.z1 + GAP];
    case "above": return [line(t.x0, t.x1, me.width), t.z0 - GAP - me.length];
  }
}

/** Two rooms standing back to back: the stretch of room a's wall that faces room b's, in a's wall coordinates. */
export interface SharedWall { a: string; wallA: number; b: string; wallB: number; from: number; to: number }

/** Every pair of walls that stand back to back with enough shared length for a door. */
export function sharedWalls(rooms: Room[]): SharedWall[] {
  const out: SharedWall[] = [];
  const need = DOOR.min + 2 * OPENING_MARGIN;
  for (let i = 0; i < rooms.length; i++) for (let j = i + 1; j < rooms.length; j++) {
    const a = rooms[i], b = rooms[j];
    walls(a).forEach((v, wa) => {
      const tv = [(v.b[0] - v.a[0]) / v.length, (v.b[1] - v.a[1]) / v.length], A0 = [a.x + v.a[0], a.z + v.a[1]];
      walls(b).forEach((u, wb) => {
        if (Math.abs(u.normal[0] + v.normal[0]) > 1e-6 || Math.abs(u.normal[1] + v.normal[1]) > 1e-6) return;
        const B0 = [b.x + u.a[0], b.z + u.a[1]], B1 = [b.x + u.b[0], b.z + u.b[1]];
        // b's wall must be one wall-gap outside a's, on the far side
        const out_ = (P: number[]) => -((P[0] - A0[0]) * v.normal[0] + (P[1] - A0[1]) * v.normal[1]);
        if (Math.abs(out_(B0) - GAP) > 3) return;
        const along = (P: number[]) => (P[0] - A0[0]) * tv[0] + (P[1] - A0[1]) * tv[1];
        const from = Math.max(0, Math.min(along(B0), along(B1))), to = Math.min(v.length, Math.max(along(B0), along(B1)));
        if (to - from >= need) out.push({ a: a.id, wallA: wa, b: b.id, wallB: wb, from: Math.round(from), to: Math.round(to) });
      });
    });
  }
  return out;
}

/**
 * Where a new door for room a could go on a shared wall, best first: as near the middle of the shared stretch as
 * it fits, without running into a door or window on either side of the wall.
 */
export function doorwayCandidates(rooms: Room[], sw: SharedWall, id: string, width = DOOR.default): Opening[] {
  const a = rooms.find((r) => r.id === sw.a)!, b = rooms.find((r) => r.id === sw.b)!;
  const lo = sw.from + OPENING_MARGIN, hi = sw.to - OPENING_MARGIN;
  width = Math.min(width, hi - lo);
  if (width < DOOR.min) return [];
  // what's already on this stretch, in a's wall coordinates: a's own openings, and b's mapped across
  const taken: [number, number][] = a.openings.filter((o) => o.wall === sw.wallA).map((o) => [o.offset, o.offset + o.width]);
  const v = walls(a)[sw.wallA], u = walls(b)[sw.wallB];
  const tv = [(v.b[0] - v.a[0]) / v.length, (v.b[1] - v.a[1]) / v.length], A0 = [a.x + v.a[0], a.z + v.a[1]];
  const tu = [(u.b[0] - u.a[0]) / u.length, (u.b[1] - u.a[1]) / u.length], B0 = [b.x + u.a[0], b.z + u.a[1]];
  const map = (s: number) => (B0[0] + tu[0] * s - A0[0]) * tv[0] + (B0[1] + tu[1] * s - A0[1]) * tv[1];
  for (const o of b.openings.filter((o) => o.wall === sw.wallB)) { const p = map(o.offset), q = map(o.offset + o.width); taken.push([Math.min(p, q), Math.max(p, q)]); }
  const free = (s: number) => taken.every(([x0, x1]) => s + width + OPENING_MARGIN <= x0 || s >= x1 + OPENING_MARGIN);
  const mid = Math.round((lo + hi - width) / 2), out: Opening[] = [], seen = new Set<number>();
  for (let d = 0; d <= hi - lo; d += 10) for (const s of [mid - d, mid + d]) {
    if (s < lo || s + width > hi || seen.has(s) || !free(s)) continue;
    seen.add(s);
    for (const hinge of ["left", "right"] as const) out.push({ id, kind: "door", wall: sw.wallA, offset: s, width, hinge });
  }
  return out;
}

/** The best place for a new door for room a on a shared wall, or null if there's no space for one. */
export const doorwayFor = (rooms: Room[], sw: SharedWall, id: string, width = DOOR.default): Opening | null =>
  doorwayCandidates(rooms, sw, id, width)[0] ?? null;

/** The same shared wall, seen from room b's side. */
export function flipShared(rooms: Room[], sw: SharedWall): SharedWall | undefined {
  const a = rooms.find((r) => r.id === sw.a)!, b = rooms.find((r) => r.id === sw.b)!;
  return sharedWalls([b, a]).find((x) => x.wallA === sw.wallB && x.wallB === sw.wallA);
}

/** Whether two rooms already have a doorway between them. */
export const isConnected = (conns: Connection[], a: string, b: string) => conns.some((c) => (c.from === a && c.to === b) || (c.from === b && c.to === a));
