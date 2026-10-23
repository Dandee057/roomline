import { test } from "node:test";
import assert from "node:assert/strict";
import { GAP, arrangeInRow, connections, overlappingRooms, snapRoom } from "../src/model/house.ts";
import { DEFAULT_PLAN, decodePlan, encodePlan } from "../src/model/plan.ts";
import type { Room } from "../src/model/room.ts";

const [lounge, bedroom] = DEFAULT_PLAN.rooms;

test("the example bedroom sits just beyond the lounge's right-hand wall", () => {
  assert.equal(bedroom.x, lounge.x + lounge.width + GAP);
  assert.deepEqual(overlappingRooms(DEFAULT_PLAN.rooms), []);
});

test("a dragged room snaps back to back with its neighbour, and flush along the other axis", () => {
  assert.deepEqual(snapRoom(DEFAULT_PLAN.rooms, "bed1", 485, 12), [470, 0]);
  assert.deepEqual(snapRoom(DEFAULT_PLAN.rooms, "bed1", 700, 200), [700, 200], "far away: no snapping");
  // below the lounge, lined up with its left edge
  assert.deepEqual(snapRoom(DEFAULT_PLAN.rooms, "bed1", 10, 410), [0, 400]);
});

test("overlapping rooms are reported", () => {
  const moved = DEFAULT_PLAN.rooms.map((r) => (r.id === "bed1" ? { ...r, x: 300 } : r));
  assert.deepEqual(overlappingRooms(moved), [["lounge", "bed1"]]);
});

test("the lounge's side door opens into the bedroom", () => {
  const cs = connections(DEFAULT_PLAN.rooms);
  assert.equal(cs.length, 1);
  const c = cs[0];
  assert.equal(c.from, "lounge"); assert.equal(c.to, "bed1");
  // the bedroom's left wall runs bottom to top (wall 5), so the doorway is measured from its bottom end
  assert.equal(c.passage.wall, 5);
  assert.equal(Math.round(c.passage.width), 82);
  assert.equal(Math.round(c.passage.offset), 380 - 285 - 82);
});

test("move the bedroom away and the doorway goes with it", () => {
  const apart = DEFAULT_PLAN.rooms.map((r): Room => (r.id === "bed1" ? { ...r, x: 600 } : r));
  assert.deepEqual(connections(apart), []);
});

test("old links without positions get laid out in a row", () => {
  const row = arrangeInRow(DEFAULT_PLAN.rooms.map((r) => ({ ...r, x: 0, z: 0 })));
  assert.equal(row[1].x, row[0].width + GAP);
  const p = decodePlan(encodePlan(DEFAULT_PLAN))!;
  assert.deepEqual(p.rooms.map((r) => [r.x, r.z]), [[0, 0], [470, 0]]);
});
