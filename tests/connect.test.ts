import { test } from "node:test";
import assert from "node:assert/strict";
// The store keeps the plan in the page address and the browser's storage: give it stand-ins
const g = globalThis as Record<string, unknown>;
g.location ??= { hash: "", search: "", pathname: "/", origin: "http://localhost" };
g.history ??= { replaceState() {} };
const { useStore } = await import("../src/store.ts");
import { blockedDoors, connections, sharedWalls } from "../src/model/house.ts";
import type { Room } from "../src/model/room.ts";

const s = () => useStore.getState();

test("Add doorway turns a half-covered door into a doorway to the neighbour", () => {
  s().reset();
  // A bigger corner on the L-shaped bedroom, and an en-suite tucked into it, half over the bedroom's door d2
  s().setRoom("bed1");
  s().updateRoom({ notchW: 200, notchL: 190 });
  s().addRoom();
  const id = s().room;
  s().updateRoom({ width: 170, length: 160, openings: [] } as Partial<Room>);
  s().placeRoom(id, "bed1", "right", "end");
  assert.equal(blockedDoors(s().plan.rooms).length, 1);
  const ws = sharedWalls(s().plan.rooms).filter((w) => [w.a, w.b].includes(id) && [w.a, w.b].includes("bed1"));
  assert.deepEqual(s().connectRooms(ws), { room: "bed1", moved: true });
  assert.equal(blockedDoors(s().plan.rooms).length, 0);
  assert.ok(connections(s().plan.rooms).some((c) => c.from === "bed1" && c.to === id && c.door === "d2"));
  // one undo step puts the door back
  s().undo();
  assert.equal(blockedDoors(s().plan.rooms).length, 1);
});

test("a room placed over the lounge's front door: Add doorway uses that door rather than adding another", () => {
  s().reset();
  s().addRoom();
  const id = s().room;
  s().updateRoom({ openings: [] } as Partial<Room>);
  s().placeRoom(id, "lounge", "below", "centre");
  const lounge = () => s().plan.rooms.find((r) => r.id === "lounge")!;
  const before = lounge().openings.length;
  assert.deepEqual(s().connectRooms(sharedWalls(s().plan.rooms).filter((w) => [w.a, w.b].includes(id))), { room: "lounge", moved: true });
  assert.equal(lounge().openings.length, before);
  assert.ok(connections(s().plan.rooms).some((c) => c.from === "lounge" && c.to === id && c.door === "d1"));
});

test("Add doorway adds a new door when no door is in the way", () => {
  s().reset();
  s().addRoom();
  const id = s().room;
  s().updateRoom({ openings: [] } as Partial<Room>);
  s().placeRoom(id, "bed1", "below", "start");
  assert.equal(blockedDoors(s().plan.rooms).length, 0);
  const done = s().connectRooms(sharedWalls(s().plan.rooms).filter((w) => [w.a, w.b].includes(id)));
  assert.ok(done && !done.moved);
  assert.ok(connections(s().plan.rooms).some((c) => [c.from, c.to].includes(id) && [c.from, c.to].includes("bed1")));
});
