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

test("placeBeside puts a room back to back with another, lined up as asked", async () => {
  const { placeBeside } = await import("../src/model/house.ts");
  const rooms = DEFAULT_PLAN.rooms; // lounge 450×380 at 0,0; bedroom 420×380 at 470,0
  assert.deepEqual(placeBeside(rooms, "bed1", "lounge", "right"), [470, 0]);
  assert.deepEqual(placeBeside(rooms, "bed1", "lounge", "below"), [0, 400]);
  assert.deepEqual(placeBeside(rooms, "bed1", "lounge", "below", "end"), [30, 400]);
  assert.deepEqual(placeBeside(rooms, "bed1", "lounge", "left", "centre"), [-440, 0]);
  assert.deepEqual(placeBeside(rooms, "bed1", "lounge", "above"), [0, -400]);
});

test("sharedWalls finds back-to-back walls and how much of them is shared", async () => {
  const { sharedWalls } = await import("../src/model/house.ts");
  const sw = sharedWalls(DEFAULT_PLAN.rooms);
  assert.equal(sw.length, 1);
  assert.deepEqual([sw[0].a, sw[0].wallA, sw[0].b, sw[0].from, sw[0].to], ["lounge", 1, "bed1", 0, 380]);
  const below = DEFAULT_PLAN.rooms.map((r) => (r.id === "bed1" ? { ...r, x: 100, z: 400 } : r));
  const s2 = sharedWalls(below);
  assert.equal(s2.length, 1);
  assert.deepEqual([s2[0].wallA, s2[0].from, s2[0].to], [2, 0, 350]); // the lounge's bottom wall runs right to left
  assert.equal(sharedWalls(DEFAULT_PLAN.rooms.map((r) => (r.id === "bed1" ? { ...r, x: 600 } : r))).length, 0);
});

test("doorwayFor connects two rooms, avoiding the doors already on that wall", async () => {
  const { sharedWalls, doorwayFor } = await import("../src/model/house.ts");
  // move the bedroom below the lounge, and take away the lounge's front door so nothing connects them yet
  const rooms = DEFAULT_PLAN.rooms.map((r) => (r.id === "bed1" ? { ...r, x: 100, z: 400 } : { ...r, openings: r.openings.filter((o) => o.id !== "d1") }));
  assert.equal(connections(rooms).length, 0);
  const door = doorwayFor(rooms, sharedWalls(rooms)[0], "new")!;
  assert.ok(door);
  const joined = rooms.map((r) => (r.id === "lounge" ? { ...r, openings: [...r.openings, door] } : r));
  assert.equal(connections(joined).length, 1);
  // the default side-by-side layout already has a door on that wall: the new one doesn't overlap it
  const sw = sharedWalls(DEFAULT_PLAN.rooms)[0], d2 = doorwayFor(DEFAULT_PLAN.rooms, sw, "x")!;
  const d3 = DEFAULT_PLAN.rooms[0].openings.find((o) => o.id === "d3")!;
  assert.ok(d2.offset + d2.width + 10 <= d3.offset || d2.offset >= d3.offset + d3.width + 10);
});
