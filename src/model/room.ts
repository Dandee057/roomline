/**
 * Rooms, in centimetres on the floor plan: x runs left to right (the room's width), z runs top to bottom (its length).
 * A room is a rectangle, or an L made by cutting a notch out of the bottom-right corner (a bay, an en-suite, a
 * passage). Walls are the outline's edges in order, and doors and windows sit on a wall at an offset along it.
 */

export type Shape = "rect" | "L";
export type OpeningKind = "door" | "window";

export interface Opening {
  id: string;
  kind: OpeningKind;
  /** Index into walls(room). */
  wall: number;
  /** Distance from the wall's start to the opening's near edge, cm. */
  offset: number;
  width: number;
  /** Doors: which way the leaf is hinged when you look at it from inside the room. */
  hinge?: "left" | "right";
}

export type Floor = "oak" | "ash" | "tiles" | "carpet";

export interface Room {
  id: string;
  name: string;
  shape: Shape;
  width: number;
  length: number;
  /** The L's missing corner, cm. Ignored for rectangles. */
  notchW: number;
  notchL: number;
  height: number;
  floor: Floor;
  wallColor: string;
  openings: Opening[];
}

export interface Wall { a: [number, number]; b: [number, number]; length: number; /** Unit normal pointing into the room. */ normal: [number, number] }

export const LIMITS = { min: 150, max: 1200, minNotch: 60, minArm: 120, height: [220, 360] as const };
export const DOOR = { min: 70, max: 180, default: 82 };
export const WINDOW = { min: 50, max: 300, default: 120, sill: 90 };
export const OPENING_MARGIN = 10;

export const FLOORS: Record<Floor, { label: string; color: string; grain: boolean }> = {
  oak: { label: "Oak boards", color: "#c8a57c", grain: true },
  ash: { label: "Pale ash", color: "#e3d3ba", grain: true },
  tiles: { label: "Grey tiles", color: "#bdbbb6", grain: false },
  carpet: { label: "Carpet", color: "#a89f93", grain: false }
};

/** The floor outline, clockwise on the plan (z points down the page). */
export function outline(r: Room): [number, number][] {
  const { width: W, length: L } = r;
  if (r.shape === "rect") return [[0, 0], [W, 0], [W, L], [0, L]];
  const nw = r.notchW, nl = r.notchL;
  return [[0, 0], [W, 0], [W, L - nl], [W - nw, L - nl], [W - nw, L], [0, L]];
}

export function walls(r: Room): Wall[] {
  const pts = outline(r);
  return pts.map((a, i) => {
    const b = pts[(i + 1) % pts.length];
    const dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
    // Going clockwise on the plan, the inside of the room is on the right of the direction of travel: (−dz, dx)
    return { a, b, length, normal: [-dz / length, dx / length] as [number, number] };
  });
}

export const floorArea = (r: Room) => (r.width * r.length - (r.shape === "L" ? r.notchW * r.notchL : 0)) / 10_000; // m²

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(Number.isFinite(v) ? v : lo)));

/** Snaps a room to something drawable: sizes in range, the notch leaving usable arms, openings on their walls. */
export function normaliseRoom(input: Room): Room {
  const width = clamp(input.width, LIMITS.min, LIMITS.max), length = clamp(input.length, LIMITS.min, LIMITS.max);
  const shape: Shape = input.shape === "L" ? "L" : "rect";
  const r: Room = {
    ...input,
    name: (input.name || "Room").slice(0, 40),
    shape, width, length,
    notchW: clamp(input.notchW, LIMITS.minNotch, Math.max(LIMITS.minNotch, width - LIMITS.minArm)),
    notchL: clamp(input.notchL, LIMITS.minNotch, Math.max(LIMITS.minNotch, length - LIMITS.minArm)),
    height: clamp(input.height, LIMITS.height[0], LIMITS.height[1]),
    floor: input.floor in FLOORS ? input.floor : "oak",
    wallColor: /^#[0-9a-f]{6}$/i.test(input.wallColor) ? input.wallColor : "#f2efe9",
    openings: []
  };
  const ws = walls(r);
  for (const o of input.openings) {
    if (o.wall < 0 || o.wall >= ws.length) continue;
    const len = ws[o.wall].length;
    const [lo, hi] = o.kind === "door" ? [DOOR.min, DOOR.max] : [WINDOW.min, WINDOW.max];
    const w = clamp(o.width, lo, Math.min(hi, len - 2 * OPENING_MARGIN));
    if (w < lo) continue; // the wall is too short for it
    r.openings.push({ ...o, width: w, offset: clamp(o.offset, OPENING_MARGIN, len - OPENING_MARGIN - w), hinge: o.kind === "door" ? (o.hinge === "right" ? "right" : "left") : undefined });
  }
  return r;
}

/** Whether a point is inside (or on the edge of) the room. */
export function contains(r: Room, x: number, z: number): boolean {
  if (x < -1e-6 || z < -1e-6 || x > r.width + 1e-6 || z > r.length + 1e-6) return false;
  if (r.shape === "L" && x > r.width - r.notchW + 1e-6 && z > r.length - r.notchL + 1e-6) return false;
  return true;
}
