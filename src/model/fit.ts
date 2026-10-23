import { meantToBeClose, product, type Category } from "./catalogue.ts";
import { contains, floorArea, walls, WINDOW, type Room } from "./room.ts";
import { dimsOf, type Item } from "./plan.ts";

/**
 * Does it fit? Every check here is plain geometry on the floor plan, in centimetres. Furniture turns in quarter
 * turns, so every footprint is an axis-aligned rectangle, and so are the walls.
 *
 *   error    it can't go there: through a wall, into another piece, or blocking a door
 *   warning  it fits, but living with it will be awkward: a squeeze to walk past, wardrobe doors that can't open
 *   tip      worth knowing: it covers part of a window, the coffee table is a stretch from the sofa
 */

export interface Rect { x0: number; z0: number; x1: number; z1: number }
export type Severity = "error" | "warning" | "tip";
export interface Issue { severity: Severity; items: string[]; message: string }

export const WALKWAY_MIN = 60, WALKWAY_GOOD = 75;

export function footprint(it: Item): Rect {
  const { w, d } = dimsOf(it), turned = it.rot === 90 || it.rot === 270;
  const hw = (turned ? d : w) / 2, hd = (turned ? w : d) / 2;
  return { x0: it.x - hw, z0: it.z - hd, x1: it.x + hw, z1: it.z + hd };
}

/** The direction an item faces on the plan: 0° faces +z (down the page), 90° faces +x. */
export function facing(rot: number): [number, number] {
  const a = (rot * Math.PI) / 180;
  return [Math.round(Math.sin(a)), Math.round(Math.cos(a))];
}

const area = (r: Rect) => Math.max(0, r.x1 - r.x0) * Math.max(0, r.z1 - r.z0);
const overlapX = (a: Rect, b: Rect) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
const overlapZ = (a: Rect, b: Rect) => Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
export const overlaps = (a: Rect, b: Rect, tol = 1) => overlapX(a, b) > tol && overlapZ(a, b) > tol;

/** The clear gap between two rectangles side by side (or one above the other), or null if they're diagonal or overlap. */
export function gapBetween(a: Rect, b: Rect): number | null {
  const ox = overlapX(a, b), oz = overlapZ(a, b);
  if (ox > 0 && oz <= 0) return -oz;
  if (oz > 0 && ox <= 0) return -ox;
  return null;
}

/** Whether a footprint is wholly inside the room (it may touch the walls). */
export function insideRoom(room: Room, r: Rect): boolean {
  const corners: [number, number][] = [[r.x0, r.z0], [r.x1, r.z0], [r.x1, r.z1], [r.x0, r.z1]];
  if (!corners.every(([x, z]) => contains(room, x, z))) return false;
  if (room.shape === "L") { // the notch's inner corner mustn't sit inside the footprint
    const cx = room.width - room.notchW, cz = room.length - room.notchL;
    if (cx > r.x0 + 1e-6 && cx < r.x1 - 1e-6 && cz > r.z0 + 1e-6 && cz < r.z1 - 1e-6) return false;
  }
  return true;
}

/** Clear distance from each side of a footprint to the nearest wall in that direction (cm), for measurement lines. */
export function wallDistances(room: Room, r: Rect): { left: number | null; right: number | null; up: number | null; down: number | null } {
  const out = { left: null as number | null, right: null as number | null, up: null as number | null, down: null as number | null };
  const keep = (k: keyof typeof out, d: number) => { if (d >= -0.5 && (out[k] === null || d < out[k]!)) out[k] = Math.max(0, d); };
  for (const w of walls(room)) {
    const [ax, az] = w.a, [bx, bz] = w.b;
    if (ax === bx) { // vertical wall at x = ax spanning z
      const lo = Math.min(az, bz), hi = Math.max(az, bz);
      if (Math.min(hi, r.z1) - Math.max(lo, r.z0) <= 0) continue;
      if (ax <= r.x0 + 0.5) keep("left", r.x0 - ax); else if (ax >= r.x1 - 0.5) keep("right", ax - r.x1);
    } else { // horizontal wall at z = az spanning x
      const lo = Math.min(ax, bx), hi = Math.max(ax, bx);
      if (Math.min(hi, r.x1) - Math.max(lo, r.x0) <= 0) continue;
      if (az <= r.z0 + 0.5) keep("up", r.z0 - az); else if (az >= r.z1 - 0.5) keep("down", az - r.z1);
    }
  }
  return out;
}

/** The space a door sweeps as it opens into the room. */
export function doorSwing(room: Room, wallIndex: number, offset: number, width: number): Rect {
  const w = walls(room)[wallIndex];
  const t: [number, number] = [(w.b[0] - w.a[0]) / w.length, (w.b[1] - w.a[1]) / w.length];
  const p1: [number, number] = [w.a[0] + t[0] * offset, w.a[1] + t[1] * offset];
  const p2: [number, number] = [p1[0] + t[0] * width, p1[1] + t[1] * width];
  const p3: [number, number] = [p2[0] + w.normal[0] * width, p2[1] + w.normal[1] * width];
  return { x0: Math.min(p1[0], p3[0]), z0: Math.min(p1[1], p3[1]), x1: Math.max(p1[0], p3[0]), z1: Math.max(p1[1], p3[1]) };
}

/** How much clear floor there is in front of an item, up to `max` cm, stopping at walls and other furniture. */
function clearInFront(room: Room, r: Rect, [fx, fz]: [number, number], others: Rect[], max: number): number {
  let free = max;
  const step = 2;
  for (let d = step; d <= max; d += step) {
    const probe: Rect = fx > 0 ? { x0: r.x1, x1: r.x1 + d, z0: r.z0, z1: r.z1 } : fx < 0 ? { x0: r.x0 - d, x1: r.x0, z0: r.z0, z1: r.z1 }
      : fz > 0 ? { x0: r.x0, x1: r.x1, z0: r.z1, z1: r.z1 + d } : { x0: r.x0, x1: r.x1, z0: r.z0 - d, z1: r.z0 };
    if (!insideRoom(room, probe) || others.some((o) => overlaps(o, probe, 0.5))) { free = d - step; break; }
  }
  return free;
}

export interface Report { issues: Issue[]; freePct: number; byItem: Map<string, Severity> }

const RANK: Record<Severity, number> = { error: 3, warning: 2, tip: 1 };

export function check(room: Room, items: Item[]): Report {
  const issues: Issue[] = [];
  const add = (severity: Severity, ids: string[], message: string) => issues.push({ severity, items: ids, message });
  const placed = items.map((it) => {
    const p = product(it.productId)!, d = dimsOf(it);
    return { it, p, d, r: footprint(it), cat: p.category as Category, rug: p.kind === "rug" };
  });
  const solid = placed.filter((x) => !x.rug);

  for (const a of placed) if (!insideRoom(room, a.r)) add("error", [a.it.id], `${a.d.name} doesn't fit there: it goes through a wall.`);

  // Overlaps (rugs sit under things, so they don't count)
  for (let i = 0; i < solid.length; i++) for (let j = i + 1; j < solid.length; j++) {
    const a = solid[i], b = solid[j];
    if (overlaps(a.r, b.r)) add("error", [a.it.id, b.it.id], `${a.d.name} and ${b.d.name} overlap.`);
  }

  // Doors must be able to swing open
  for (const o of room.openings.filter((o) => o.kind === "door")) {
    const zone = doorSwing(room, o.wall, o.offset, o.width);
    for (const a of solid) if (overlaps(a.r, zone, 2)) add("error", [a.it.id], `${a.d.name} is in the way of the door opening.`);
  }

  // Wardrobes, drawers and desks need space in front of them to be used
  for (const a of solid) {
    if (!a.p.front) continue;
    const others = solid.filter((b) => b !== a && !meantToBeClose(a.cat, b.cat)).map((b) => b.r);
    const free = clearInFront(room, a.r, facing(a.it.rot), others, a.p.front);
    if (free < a.p.front - 1) add("warning", [a.it.id], `${a.d.name} needs about ${a.p.front} cm clear in front to use it, but has ${Math.max(0, free)} cm.`);
  }

  // Walkways between furniture, and sofa-to-coffee-table distance
  for (let i = 0; i < solid.length; i++) for (let j = i + 1; j < solid.length; j++) {
    const a = solid[i], b = solid[j], gap = gapBetween(a.r, b.r);
    if (gap === null || gap <= 2) continue;
    const seat = (c: Category) => c === "sofa" || c === "chair";
    if ((seat(a.cat) && b.cat === "coffeeTable") || (seat(b.cat) && a.cat === "coffeeTable")) {
      if (gap < 30) add("warning", [a.it.id, b.it.id], `Only ${Math.round(gap)} cm between the ${shortName(a, b, "coffeeTable", true)} and the coffee table: tight for knees. 40–50 cm is ideal.`);
      else if (gap > 75) add("tip", [a.it.id, b.it.id], `The coffee table is ${Math.round(gap)} cm from the ${shortName(a, b, "coffeeTable", true)}: a stretch to reach. 40–50 cm is ideal.`);
      continue;
    }
    if (meantToBeClose(a.cat, b.cat)) continue;
    if (gap < WALKWAY_MIN) add("warning", [a.it.id, b.it.id], `Only ${Math.round(gap)} cm between ${a.d.name.toLowerCase()} and ${b.d.name.toLowerCase()}. Allow ${WALKWAY_MIN} cm to walk between them (${WALKWAY_GOOD} cm is comfortable).`);
  }

  // Tall pieces standing in front of a window
  for (const o of room.openings.filter((o) => o.kind === "window")) {
    const w = walls(room)[o.wall];
    const zone = doorSwing(room, o.wall, o.offset, o.width); // the strip in front of the window…
    const strip: Rect = w.normal[0] !== 0
      ? { ...zone, x0: w.normal[0] > 0 ? zone.x0 : zone.x1 - 25, x1: w.normal[0] > 0 ? zone.x0 + 25 : zone.x1 }
      : { ...zone, z0: w.normal[1] > 0 ? zone.z0 : zone.z1 - 25, z1: w.normal[1] > 0 ? zone.z0 + 25 : zone.z1 };
    for (const a of solid) if (a.d.h > WINDOW.sill && overlaps(a.r, strip, 2)) add("tip", [a.it.id], `${a.d.name} stands in front of the window and will block some light.`);
  }

  const used = solid.reduce((s, a) => s + area(a.r), 0) / 10_000;
  const byItem = new Map<string, Severity>();
  for (const is of issues) for (const id of is.items) if (!byItem.has(id) || RANK[is.severity] > RANK[byItem.get(id)!]) byItem.set(id, is.severity);
  issues.sort((a, b) => RANK[b.severity] - RANK[a.severity]);
  return { issues, freePct: Math.max(0, Math.round((1 - used / floorArea(room)) * 100)), byItem };
}

function shortName(a: { cat: Category; d: { name: string } }, b: { cat: Category; d: { name: string } }, not: Category, lower: boolean): string {
  const n = a.cat === not ? b.d.name : a.d.name;
  return lower ? n.toLowerCase() : n;
}
