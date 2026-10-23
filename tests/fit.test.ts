import { test } from "node:test";
import assert from "node:assert/strict";
import { check, doorSwing, footprint, gapBetween, insideRoom, wallDistances } from "../src/model/fit.ts";
import { DEFAULT_PLAN, type Item } from "../src/model/plan.ts";
import type { Room } from "../src/model/room.ts";

const lounge = DEFAULT_PLAN.rooms[0], bedroom = DEFAULT_PLAN.rooms[1];
const itemsIn = (r: Room) => DEFAULT_PLAN.items.filter((i) => i.roomId === r.id);
const item = (productId: string, x: number, z: number, rot: Item["rot"] = 0): Item => ({ id: productId + x + z, roomId: "lounge", productId, x, z, rot });
const messages = (r: Room, items: Item[]) => check(r, items).issues.map((i) => `${i.severity}: ${i.message}`);

test("the example rooms have no errors or warnings", () => {
  for (const r of [lounge, bedroom]) {
    const bad = check(r, itemsIn(r)).issues.filter((i) => i.severity !== "tip");
    assert.deepEqual(bad, [], r.name);
  }
});

test("footprints turn with the item", () => {
  assert.deepEqual(footprint(item("sofa3", 200, 100, 0)), { x0: 92.5, z0: 54, x1: 307.5, z1: 146 });
  assert.deepEqual(footprint(item("sofa3", 200, 200, 90)), { x0: 154, z0: 92.5, x1: 246, z1: 307.5 });
});

test("gaps are measured only between pieces side by side", () => {
  assert.equal(gapBetween({ x0: 0, z0: 0, x1: 10, z1: 10 }, { x0: 30, z0: 5, x1: 40, z1: 20 }), 20);
  assert.equal(gapBetween({ x0: 0, z0: 0, x1: 10, z1: 10 }, { x0: 30, z0: 30, x1: 40, z1: 40 }), null);
});

test("furniture can't go through the wall of an L-shaped room", () => {
  // the bedroom's notch is the bottom-right 130 × 120
  assert.equal(insideRoom(bedroom, { x0: 300, z0: 200, x1: 400, z1: 280 }), false);
  assert.equal(insideRoom(bedroom, { x0: 200, z0: 200, x1: 290, z1: 380 }), true);
  assert.equal(insideRoom(bedroom, { x0: 250, z0: 240, x1: 320, z1: 300 }), false, "straddling the inner corner");
});

test("overlaps and walls are errors; rugs don't count", () => {
  const m = messages(lounge, [item("sofa3", 200, 150), item("coffee", 200, 170), item("rug160", 200, 150)]);
  assert.ok(m.some((s) => s.startsWith("error") && s.includes("overlap")));
  assert.ok(!m.some((s) => s.includes("Rug")));
  assert.ok(messages(lounge, [item("sofa3", 10, 150)]).some((s) => s.includes("goes through a wall")));
});

test("blocking the door is an error", () => {
  const zone = doorSwing(lounge, 2, 40, 82); // bottom wall, opening into the room
  assert.deepEqual(zone, { x0: 328, z0: 298, x1: 410, z1: 380 });
  assert.ok(messages(lounge, [item("arm", 370, 330)]).some((s) => s.includes("in the way of the door")));
});

test("a narrow walkway is flagged, but neighbours like a bed and bedside aren't", () => {
  const m = messages(lounge, [item("dine4", 150, 150), item("tv180", 150, 255)]); // table z 110–190, TV z 235–275 → 45 cm
  assert.ok(m.some((s) => s.startsWith("warning") && s.includes("Only 45 cm")));
  const bed = messages(bedroom, [{ ...item("queen", 120, 150), roomId: "bed1" }, { ...item("bedside", 20, 30), roomId: "bed1" }]);
  assert.ok(!bed.some((s) => s.includes("walk between")));
});

test("the coffee table should be within easy reach of the sofa", () => {
  const close = messages(lounge, [item("sofa3", 200, 100), item("coffee", 200, 170)]); // sofa z1 146, table z0 140 → overlap
  assert.ok(close.some((s) => s.includes("overlap")));
  assert.ok(messages(lounge, [item("sofa3", 200, 100), item("coffee", 200, 195)]).some((s) => s.includes("tight for knees")));
  assert.ok(messages(lounge, [item("sofa3", 200, 100), item("coffee", 200, 260)]).some((s) => s.startsWith("tip") && s.includes("stretch")));
});

test("wardrobe doors need room to open", () => {
  // wardrobe against the top wall facing down, with a sofa 40 cm in front
  const m = messages(lounge, [item("ward2", 100, 30), item("sofa2", 100, 143)]);
  assert.ok(m.some((s) => s.includes("needs about 70 cm clear in front") && s.includes("has 40 cm")));
});

test("distances to the walls, for measurement lines", () => {
  const d = wallDistances(lounge, { x0: 100, z0: 50, x1: 200, z1: 150 });
  assert.deepEqual(d, { left: 100, right: 250, up: 50, down: 230 });
});
