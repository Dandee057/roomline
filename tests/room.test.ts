import { test } from "node:test";
import assert from "node:assert/strict";
import { contains, floorArea, normaliseRoom, outline, walls, type Room } from "../src/model/room.ts";
import { DEFAULT_PLAN, decodePlan, encodePlan } from "../src/model/plan.ts";

const room = (over: Partial<Room> = {}): Room => ({ ...DEFAULT_PLAN.rooms[0], ...over });

test("an L-shaped room has six walls and loses its notch from the floor area", () => {
  const r = room({ shape: "L", width: 400, length: 300, notchW: 100, notchL: 100 });
  assert.equal(outline(r).length, 6);
  assert.equal(floorArea(r), 11);
  assert.equal(contains(r, 350, 250), false);
  assert.equal(contains(r, 250, 250), true);
});

test("wall normals point into the room", () => {
  for (const shape of ["rect", "L"] as const) {
    const r = room({ shape, width: 400, length: 300, notchW: 100, notchL: 100 });
    for (const w of walls(r)) {
      const mid = [(w.a[0] + w.b[0]) / 2 + w.normal[0] * 5, (w.a[1] + w.b[1]) / 2 + w.normal[1] * 5];
      assert.ok(contains(r, mid[0], mid[1]), `normal of wall ${JSON.stringify(w.a)}→${JSON.stringify(w.b)} points out`);
    }
  }
});

test("rooms are snapped to drawable sizes and openings to their walls", () => {
  const r = normaliseRoom(room({ width: 5000, length: 20, notchW: 999, openings: [
    { id: "a", kind: "door", wall: 0, offset: 1180, width: 300 },
    { id: "b", kind: "window", wall: 9, offset: 0, width: 100 }
  ] }));
  assert.equal(r.width, 1200);
  assert.equal(r.length, 150);
  assert.equal(r.openings.length, 1, "an opening on a wall that doesn't exist is dropped");
  const d = r.openings[0];
  assert.equal(d.width, 180);
  assert.ok(d.offset + d.width <= 1200 - 10);
});

test("a plan survives a round trip through a share link", () => {
  const p = decodePlan(encodePlan(DEFAULT_PLAN))!;
  assert.equal(p.rooms.length, 2);
  assert.equal(p.items.length, DEFAULT_PLAN.items.length);
  assert.deepEqual(p.rooms[1].openings.map((o) => [o.kind, o.wall, o.offset, o.width]), DEFAULT_PLAN.rooms[1].openings.map((o) => [o.kind, o.wall, o.offset, o.width]));
  const shelf = p.items.find((i) => i.productId === "shelving")!;
  assert.deepEqual(shelf.shelving, DEFAULT_PLAN.items.find((i) => i.productId === "shelving")!.shelving);
});

test("a broken share link is rejected, not thrown", () => {
  assert.equal(decodePlan("not-base64!"), null);
  assert.equal(decodePlan(btoa("{}")), null);
});
