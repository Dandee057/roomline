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

// The default bedroom is L-shaped: 420 × 380 at x 470, with a 130 × 120 notch in its bottom-right corner.
// Its floor's notch corner is at (760, 260), so a small room fits in there, one wall gap from both inner walls.
const nook: Room = { ...bedroom, id: "nook", name: "Nook", shape: "rect", width: 110, length: 100, openings: [], x: 2000, z: 2000 };

test("L-shaped rooms: a room tucked into the notch doesn't count as overlapping", async () => {
  const { roomsOverlap } = await import("../src/model/house.ts");
  assert.equal(roomsOverlap({ ...nook, x: 780, z: 280 }, bedroom), false);
  assert.equal(roomsOverlap({ ...nook, x: 770, z: 280 }, bedroom), true);  // too close to the inner wall
  assert.equal(roomsOverlap({ ...nook, x: 700, z: 300 }, bedroom), true);  // into the bedroom's floor
});

test("L-shaped rooms: dragging snaps to the inner walls of the notch", () => {
  const rooms = [lounge, bedroom, nook];
  assert.deepEqual(snapRoom(rooms, "nook", 775, 290), [780, 280]);
});

test("L-shaped rooms: placing beside one tucks into the notch when it fits, and connects along the inner wall", async () => {
  const { placeBeside, sharedWalls, doorwayFor } = await import("../src/model/house.ts");
  const rooms = [lounge, bedroom, nook];
  assert.deepEqual(placeBeside(rooms, "nook", "bed1", "right", "end"), [780, 280]);
  assert.deepEqual(placeBeside(rooms, "nook", "bed1", "below", "end"), [780, 280]);
  // aligned with the top it can't tuck in, so it goes outside the bedroom's full width
  assert.deepEqual(placeBeside(rooms, "nook", "bed1", "right", "start"), [910, 0]);
  const placed = rooms.map((r) => (r.id === "nook" ? { ...r, x: 780, z: 280 } : r));
  const sw = sharedWalls(placed).filter((w) => [w.a, w.b].includes("nook"));
  assert.equal(sw.length, 2); // both inner walls of the notch
  const w = sw.find((x) => x.to - x.from >= 100)!;
  const door = doorwayFor(placed, w, "n1")!;
  const joined = placed.map((r) => (r.id === w.a ? { ...r, openings: [...r.openings, door] } : r));
  assert.ok(connections(joined).some((c) => [c.from, c.to].includes("nook")));
});

test("L-shaped rooms: a room too big for the notch lines up with the outer wall instead, with room for a door", async () => {
  const { placeBeside, sharedWalls } = await import("../src/model/house.ts");
  const big: Room = { ...nook, width: 150, length: 150 };
  const rooms = [lounge, bedroom, big];
  const [x, z] = placeBeside(rooms, "nook", "bed1", "right", "end");
  assert.deepEqual([x, z], [910, 110]); // flush with the bottom of the bedroom's right wall (z 0–260)
  const placed = rooms.map((r) => (r.id === "nook" ? { ...r, x, z } : r));
  assert.ok(sharedWalls(placed).some((w) => [w.a, w.b].includes("nook") && w.to - w.from === 150));
});

test("a door that opens partly onto a neighbour's wall is flagged; a full doorway isn't", async () => {
  const { blockedDoors, placeBeside } = await import("../src/model/house.ts");
  assert.deepEqual(blockedDoors(DEFAULT_PLAN.rooms), []);
  // A bigger corner on the bedroom, and an en-suite tucked into it: it covers part of the bedroom's door d2
  const bed = { ...bedroom, notchW: 200, notchL: 190 };
  const suite: Room = { ...nook, id: "suite", width: 170, length: 160 };
  const rooms = [lounge, bed, suite];
  const placed = rooms.map((r) => (r.id === "suite" ? { ...r, x: 710, z: 220 } : r));
  assert.deepEqual(blockedDoors(placed), [{ room: "bed1", door: "d2", by: "suite" }]);
  // placing it "right, bottom" still tucks it into the corner, as asked: the half-covered door is flagged instead
  assert.deepEqual(placeBeside(rooms, "suite", "bed1", "right", "end"), [710, 220]);
});
