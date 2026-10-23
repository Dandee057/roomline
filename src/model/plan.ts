import { DEFAULT_CONFIG, normalise as normaliseShelving, type Config as ShelvingConfig } from "../shelving/config.ts";
import { quote as shelvingQuote } from "../shelving/quote.ts";
import { product, type Product } from "./catalogue.ts";
import { normaliseRoom, type Room } from "./room.ts";
import { arrangeInRow } from "./house.ts";

/**
 * A plan is the rooms and the furniture in them. Items are placed by their centre on the floor plan (cm) and turned
 * in quarter turns. The configurable shelving carries its own Shelfline design, which sets its size and price.
 */

export type Rotation = 0 | 90 | 180 | 270;

export interface Item {
  id: string;
  roomId: string;
  productId: string;
  x: number;
  z: number;
  rot: Rotation;
  shelving?: ShelvingConfig;
}

export interface Plan { rooms: Room[]; items: Item[] }

export interface Dims { w: number; d: number; h: number; price: number; name: string }

/** Size and price of an item: from the catalogue, or from its Shelfline design. */
export function dimsOf(item: Item): Dims {
  const p = product(item.productId) as Product;
  if (p.kind === "shelving") {
    const c = item.shelving ?? DEFAULT_CONFIG, q = shelvingQuote(c);
    return { w: q.widthCm, d: c.depth, h: c.height + (c.base === "castors" ? 8.5 : 2.5), price: q.total, name: `Shelving, ${c.bays.length} bay${c.bays.length > 1 ? "s" : ""}` };
  }
  return { w: p.w, d: p.d, h: p.h, price: p.price, name: p.name };
}

let counter = 0;
export const newId = (prefix: string) => `${prefix}${Date.now().toString(36).slice(-4)}${(counter++).toString(36)}`;

export const DEFAULT_PLAN: Plan = {
  rooms: [
    {
      id: "lounge", name: "Lounge", shape: "rect", width: 450, length: 380, notchW: 120, notchL: 110, height: 260, floor: "oak", wallColor: "#f2efe9", x: 0, z: 0,
      openings: [
        { id: "d1", kind: "door", wall: 2, offset: 40, width: 82, hinge: "left" },
        { id: "d3", kind: "door", wall: 1, offset: 285, width: 82, hinge: "right" }, // through to the bedroom
        { id: "w1", kind: "window", wall: 0, offset: 140, width: 160 }
      ]
    },
    {
      id: "bed1", name: "Main bedroom", shape: "L", width: 420, length: 380, notchW: 130, notchL: 120, height: 260, floor: "ash", wallColor: "#ece8e1", x: 470, z: 0,
      openings: [
        { id: "d2", kind: "door", wall: 3, offset: 20, width: 82, hinge: "right" },
        { id: "w2", kind: "window", wall: 0, offset: 120, width: 150 }
      ]
    }
  ],
  items: [
    { id: "i1", roomId: "lounge", productId: "rug200", x: 270, z: 170, rot: 90 },
    { id: "i2", roomId: "lounge", productId: "sofa3", x: 399, z: 170, rot: 270 },
    { id: "i3", roomId: "lounge", productId: "coffee", x: 280, z: 170, rot: 90 },
    { id: "i4", roomId: "lounge", productId: "tv180", x: 21, z: 170, rot: 90 },
    { id: "i5", roomId: "lounge", productId: "arm", x: 190, z: 70, rot: 180 },
    { id: "i6", roomId: "lounge", productId: "shelving", x: 150, z: 359, rot: 180, shelving: DEFAULT_CONFIG },
    { id: "i7", roomId: "bed1", productId: "queen", x: 107, z: 150, rot: 90 },
    { id: "i8", roomId: "bed1", productId: "bedside", x: 22, z: 45, rot: 90 },
    { id: "i9", roomId: "bed1", productId: "bedside", x: 22, z: 255, rot: 90 },
    { id: "i10", roomId: "bed1", productId: "ward3", x: 389, z: 100, rot: 270 }
  ]
};

// ---- Share links: the whole plan, as base64url JSON in the URL hash ----

const toB64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64 = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)));

/** Rounds positions and drops defaults, so links stay short. */
export function encodePlan(p: Plan): string {
  const compact = {
    v: 2,
    r: p.rooms.map((r) => [r.id, r.name, r.shape, r.width, r.length, r.notchW, r.notchL, r.height, r.floor, r.wallColor, r.openings.map((o) => [o.kind === "door" ? 1 : 0, o.wall, o.offset, o.width, o.hinge === "right" ? 1 : 0]), r.x, r.z]),
    i: p.items.map((it) => [it.roomId, it.productId, Math.round(it.x), Math.round(it.z), it.rot, it.shelving ?? 0])
  };
  return toB64(JSON.stringify(compact));
}

/** Reads a plan from a share link. Anything malformed is dropped or snapped, never thrown. Returns null if unreadable. */
export function decodePlan(s: string): Plan | null {
  let raw: { v?: number; r?: unknown[]; i?: unknown[] };
  try { raw = JSON.parse(fromB64(s)); } catch { return null; }
  if ((raw?.v !== 1 && raw?.v !== 2) || !Array.isArray(raw.r) || !Array.isArray(raw.i)) return null;
  let rooms: Room[] = [];
  for (const r of raw.r) {
    if (!Array.isArray(r)) continue;
    const [id, name, shape, width, length, notchW, notchL, height, floor, wallColor, ops, x, z] = r as [string, string, string, number, number, number, number, number, string, string, unknown[], number, number];
    rooms.push(normaliseRoom({
      id: String(id), name: String(name), shape: shape === "L" ? "L" : "rect", width: +width, length: +length, notchW: +notchW, notchL: +notchL, height: +height,
      floor: floor as Room["floor"], wallColor: String(wallColor), x: +x || 0, z: +z || 0,
      openings: (Array.isArray(ops) ? ops : []).filter(Array.isArray).map((o, k) => {
        const [door, wall, offset, width, right] = o as number[];
        return { id: `o${k}`, kind: door ? "door" : "window", wall: +wall, offset: +offset, width: +width, hinge: right ? "right" : "left" } as const;
      })
    }));
  }
  if (raw.v === 1) rooms = arrangeInRow(rooms); // links from before the house plan had no room positions
  const ids = new Set(rooms.map((r) => r.id));
  const items: Item[] = [];
  raw.i.forEach((it, k) => {
    if (!Array.isArray(it)) return;
    const [roomId, productId, x, z, rot, shelving] = it as [string, string, number, number, number, ShelvingConfig | 0];
    if (!ids.has(roomId) || !product(productId)) return;
    items.push({
      id: `i${k}`, roomId, productId, x: +x || 0, z: +z || 0,
      rot: ([0, 90, 180, 270].includes(+rot) ? +rot : 0) as Rotation,
      shelving: product(productId)!.kind === "shelving" ? (shelving && typeof shelving === "object" ? normaliseShelving(shelving).config : DEFAULT_CONFIG) : undefined
    });
  });
  return rooms.length ? { rooms, items } : null;
}
