import { create } from "zustand";
import { DEFAULT_CONFIG, normalise as normaliseShelving, type Config as ShelvingConfig } from "./shelving/config.ts";
import { product } from "./model/catalogue.ts";
import { footprint, insideRoom, overlaps } from "./model/fit.ts";
import { DEFAULT_PLAN, decodePlan, encodePlan, newId, type Item, type Plan, type Rotation } from "./model/plan.ts";
import { DOOR, WINDOW, normaliseRoom, walls, type Opening, type Room } from "./model/room.ts";
import { GAP, houseBounds } from "./model/house.ts";

/**
 * App state: the plan (rooms and furniture), which room you're in, what's selected, and history.
 * Every change goes through `apply()`, which snaps rooms to valid shapes and records an undo step. A drag is one
 * step: `beginDrag()` remembers where you started, moves don't add history, and `endDrag()` commits.
 */

export type ViewMode = "3d" | "plan";
/** One room at a time, or the whole house. */
export type Scope = "room" | "house";
export type PanelTab = "furniture" | "room" | "house" | "catalogue";

interface State {
  plan: Plan;
  room: string;
  selected: string | null;
  past: Plan[];
  future: Plan[];
  mode: ViewMode;
  scope: Scope;
  tab: PanelTab;
  snap: boolean;
  dragging: boolean;
  frameNonce: number;

  apply(change: (p: Plan) => Plan): void;
  setRoom(id: string): void;
  setScope(s: Scope): void;
  setTab(t: PanelTab): void;
  /** The catalogue changed: give every item a new identity so sizes, models and checks update. No undo step. */
  refreshProducts(): void;
  moveRoom(id: string, x: number, z: number): void;
  addRoom(): void;
  updateRoom(patch: Partial<Room>): void;
  removeRoom(id: string): void;
  addOpening(kind: Opening["kind"]): void;
  updateOpening(id: string, patch: Partial<Opening>): void;
  removeOpening(id: string): void;
  addItem(productId: string): void;
  moveItem(id: string, x: number, z: number): void;
  /** Arrow-key nudges: a run of them on one piece is a single undo step. */
  nudge(id: string, dx: number, dz: number): void;
  beginDrag(): void;
  endDrag(): void;
  rotate(id: string, by?: number): void;
  duplicate(id: string): void;
  remove(id: string): void;
  updateShelving(id: string, change: (c: ShelvingConfig) => ShelvingConfig): void;
  select(id: string | null): void;
  setMode(m: ViewMode): void;
  toggleSnap(): void;
  reframe(): void;
  undo(): void;
  redo(): void;
  reset(): void;
}

const KEY = "roomline.plan", HISTORY = 80;
const read = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
const write = (v: string) => { try { localStorage.setItem(KEY, v); } catch { /* storage unavailable: the link still holds the plan */ } };

function initialPlan(): Plan {
  const fromLink = typeof location !== "undefined" && location.hash.startsWith("#p=") ? decodePlan(location.hash.slice(3)) : null;
  if (fromLink) return fromLink;
  const stored = read();
  return (stored && decodePlan(stored)) || DEFAULT_PLAN;
}

const tidy = (p: Plan): Plan => ({ ...p, rooms: p.rooms.map(normaliseRoom) });
const mapRoom = (p: Plan, id: string, f: (r: Room) => Room): Plan => ({ ...p, rooms: p.rooms.map((r) => (r.id === id ? f(r) : r)) });
const mapItem = (p: Plan, id: string, f: (i: Item) => Item): Plan => ({ ...p, items: p.items.map((i) => (i.id === id ? f(i) : i)) });

/** Slides an item the shortest way back inside the room's walls (after it grew or turned). */
function keepInside(room: Room, it: Item): Item {
  let r = footprint(it), x = it.x, z = it.z;
  x += Math.max(0, -r.x0) - Math.max(0, r.x1 - room.width);
  z += Math.max(0, -r.z0) - Math.max(0, r.z1 - room.length);
  let moved = { ...it, x, z };
  if (room.shape === "L" && !insideRoom(room, footprint(moved))) {
    r = footprint(moved);
    const toLeft = { ...moved, x: moved.x - (r.x1 - (room.width - room.notchW)) }, toUp = { ...moved, z: moved.z - (r.z1 - (room.length - room.notchL)) };
    const fits = [toLeft, toUp].filter((c) => insideRoom(room, footprint(c)));
    if (fits.length) moved = fits.sort((a, b) => Math.hypot(a.x - it.x, a.z - it.z) - Math.hypot(b.x - it.x, b.z - it.z))[0];
  }
  return moved;
}
const roomOf = (p: Plan, it: Item) => p.rooms.find((r) => r.id === it.roomId)!;
let lastNudge: { id: string; at: number } | null = null;

/** The first free spot for a new item: scan the room on a grid, nearest the centre first. */
function freeSpot(room: Room, items: Item[], probe: Item): { x: number; z: number } {
  const others = items.filter((i) => i.roomId === room.id && product(i.productId)?.kind !== "rug").map(footprint);
  const rug = product(probe.productId)?.kind === "rug";
  const cx = room.width / 2, cz = room.length / 2;
  const spots: [number, number][] = [];
  for (let x = 10; x < room.width; x += 10) for (let z = 10; z < room.length; z += 10) spots.push([x, z]);
  spots.sort((a, b) => Math.hypot(a[0] - cx, a[1] - cz) - Math.hypot(b[0] - cx, b[1] - cz));
  for (const [x, z] of spots) {
    const r = footprint({ ...probe, x, z });
    if (insideRoom(room, r) && (rug || !others.some((o) => overlaps(o, r)))) return { x, z };
  }
  return { x: cx, z: cz };
}

const plan0 = initialPlan();

export const useStore = create<State>()((set, get) => ({
  plan: plan0,
  room: plan0.rooms[0].id,
  selected: null,
  past: [],
  future: [],
  mode: "3d",
  scope: "room",
  tab: "furniture",
  snap: true,
  dragging: false,
  frameNonce: 0,

  apply(change) {
    const { plan, past } = get();
    const next = tidy(change(plan));
    if (encodePlan(next) === encodePlan(plan)) return;
    set({ plan: next, past: [...past, plan].slice(-HISTORY), future: [] });
  },

  setRoom: (id) => set((s) => ({ room: id, selected: null, frameNonce: s.scope === "room" ? s.frameNonce + 1 : s.frameNonce })),
  setScope: (scope) => set((s) => ({ scope, selected: null, frameNonce: s.frameNonce + 1, tab: scope === "house" ? "house" : s.tab === "house" ? "furniture" : s.tab })),
  setTab: (tab) => set({ tab }),
  refreshProducts: () => set((s) => ({ plan: { ...s.plan, items: s.plan.items.map((i) => ({ ...i })) } })),
  addRoom() {
    const id = newId("r"), n = get().plan.rooms.length + 1;
    const b = houseBounds(get().plan.rooms);
    // New rooms start beside the house, back to back with it, ready to be dragged into place
    get().apply((p) => ({ ...p, rooms: [...p.rooms, { id, name: `Room ${n}`, shape: "rect", width: 350, length: 300, notchW: 100, notchL: 100, height: 260, floor: "oak", wallColor: "#f2efe9", x: b.x1 + GAP, z: b.z0, openings: [{ id: newId("o"), kind: "door", wall: 2, offset: 30, width: DOOR.default, hinge: "left" }] }] }));
    get().setRoom(id);
    set({ tab: "room" });
  },
  moveRoom(id, x, z) {
    const f = (p: Plan) => mapRoom(p, id, (r) => ({ ...r, x, z }));
    if (get().dragging) set((s) => ({ plan: f(s.plan) })); else get().apply(f);
  },
  updateRoom(patch) { get().apply((p) => mapRoom(p, get().room, (r) => ({ ...r, ...patch }))); },
  removeRoom(id) {
    const { plan } = get();
    if (plan.rooms.length < 2) return;
    get().apply((p) => ({ rooms: p.rooms.filter((r) => r.id !== id), items: p.items.filter((i) => i.roomId !== id) }));
    if (get().room === id) get().setRoom(get().plan.rooms[0].id);
  },

  addOpening(kind) {
    get().apply((p) => mapRoom(p, get().room, (r) => {
      const ws = walls(r);
      // the longest wall without an opening, or else the longest wall
      const free = ws.map((w, i) => ({ w, i })).filter(({ i }) => !r.openings.some((o) => o.wall === i));
      const pick = (free.length ? free : ws.map((w, i) => ({ w, i }))).sort((a, b) => b.w.length - a.w.length)[0];
      const width = kind === "door" ? DOOR.default : WINDOW.default;
      return { ...r, openings: [...r.openings, { id: newId("o"), kind, wall: pick.i, offset: Math.max(10, (pick.w.length - width) / 2), width, hinge: "left" }] };
    }));
  },
  updateOpening(id, patch) { get().apply((p) => mapRoom(p, get().room, (r) => ({ ...r, openings: r.openings.map((o) => (o.id === id ? { ...o, ...patch } : o)) }))); },
  removeOpening(id) { get().apply((p) => mapRoom(p, get().room, (r) => ({ ...r, openings: r.openings.filter((o) => o.id !== id) }))); },

  addItem(productId) {
    const { plan, room } = get();
    const r = plan.rooms.find((x) => x.id === room)!;
    const probe: Item = { id: newId("i"), roomId: room, productId, x: 0, z: 0, rot: 0, shelving: product(productId)?.kind === "shelving" ? DEFAULT_CONFIG : undefined };
    const spot = freeSpot(r, plan.items, probe);
    get().apply((p) => ({ ...p, items: [...p.items, { ...probe, ...spot }] }));
    set({ selected: probe.id });
  },
  moveItem(id, x, z) {
    const { dragging } = get();
    if (dragging) set((s) => ({ plan: mapItem(s.plan, id, (i) => ({ ...i, x, z })) })); // live, no history
    else get().apply((p) => mapItem(p, id, (i) => ({ ...i, x, z })));
  },
  nudge(id, dx, dz) {
    const it = get().plan.items.find((i) => i.id === id);
    if (!it) return;
    const now = Date.now(), joined = lastNudge?.id === id && now - lastNudge.at < 1500 && get().past.length > 0;
    lastNudge = { id, at: now };
    if (joined) set((s) => ({ plan: mapItem(s.plan, id, (i) => ({ ...i, x: i.x + dx, z: i.z + dz })), future: [] }));
    else get().apply((p) => mapItem(p, id, (i) => ({ ...i, x: i.x + dx, z: i.z + dz })));
  },
  beginDrag() { set((s) => ({ dragging: true, past: [...s.past, s.plan].slice(-HISTORY), future: [] })); },
  endDrag() {
    const { past, plan } = get();
    // A click without movement shouldn't leave an empty undo step
    if (past.length && encodePlan(past[past.length - 1]) === encodePlan(plan)) set({ past: past.slice(0, -1) });
    set({ dragging: false });
  },
  rotate(id, by = 90) { get().apply((p) => mapItem(p, id, (i) => keepInside(roomOf(p, i), { ...i, rot: ((((i.rot + by) % 360) + 360) % 360) as Rotation }))); },
  duplicate(id) {
    const it = get().plan.items.find((i) => i.id === id);
    if (!it) return;
    const copy = { ...it, id: newId("i") };
    const r = get().plan.rooms.find((x) => x.id === it.roomId)!;
    const spot = freeSpot(r, get().plan.items, copy);
    get().apply((p) => ({ ...p, items: [...p.items, { ...copy, ...spot }] }));
    set({ selected: copy.id });
  },
  remove(id) { get().apply((p) => ({ ...p, items: p.items.filter((i) => i.id !== id) })); if (get().selected === id) set({ selected: null }); },
  updateShelving(id, change) { get().apply((p) => mapItem(p, id, (i) => keepInside(roomOf(p, i), { ...i, shelving: normaliseShelving(change(i.shelving ?? DEFAULT_CONFIG)).config }))); },

  select: (id) => set({ selected: id }),
  setMode: (m) => set((s) => ({ mode: m, frameNonce: s.frameNonce + 1 })),
  toggleSnap: () => set((s) => ({ snap: !s.snap })),
  reframe: () => set((s) => ({ frameNonce: s.frameNonce + 1 })),

  undo() {
    const { past, plan, future } = get();
    if (!past.length) return;
    set({ plan: past[past.length - 1], past: past.slice(0, -1), future: [plan, ...future] });
    fixUp();
  },
  redo() {
    const { past, plan, future } = get();
    if (!future.length) return;
    set({ plan: future[0], past: [...past, plan], future: future.slice(1) });
    fixUp();
  },
  reset() { get().apply(() => DEFAULT_PLAN); set({ selected: null, room: DEFAULT_PLAN.rooms[0].id }); get().reframe(); }
}));

/** After undo/redo the current room or selection may no longer exist. */
function fixUp(): void {
  const { plan, room, selected } = useStore.getState();
  if (!plan.rooms.some((r) => r.id === room)) useStore.setState({ room: plan.rooms[0].id });
  if (selected && !plan.items.some((i) => i.id === selected)) useStore.setState({ selected: null });
}

// The plan lives in the link and on this device; while dragging, wait for the drop
useStore.subscribe((s, prev) => {
  if (s.dragging || (s.plan === prev.plan && s.dragging === prev.dragging)) return;
  const code = encodePlan(s.plan);
  write(code);
  history.replaceState(null, "", location.pathname + location.search + "#p=" + code);
});

export const currentRoom = (s: State) => s.plan.rooms.find((r) => r.id === s.room)!;
export const roomItems = (s: State) => s.plan.items.filter((i) => i.roomId === s.room);
if (typeof location !== "undefined" && !location.hash.startsWith("#p=")) history.replaceState(null, "", location.pathname + location.search + "#p=" + encodePlan(useStore.getState().plan));
