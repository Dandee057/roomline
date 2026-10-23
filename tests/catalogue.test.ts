import { test } from "node:test";
import assert from "node:assert/strict";
import { BUILTIN_PRODUCTS, NO_CHANGES, applyChanges, newProductId, normaliseChanges, normaliseProduct, product, products, setCatalogue } from "../src/model/catalogue.ts";
import { decodePlan, encodePlan, dimsOf, type Plan } from "../src/model/plan.ts";
import { DEFAULT_PLAN } from "../src/model/plan.ts";

test("no changes gives the built-in catalogue", () => {
  assert.deepEqual(applyChanges(NO_CHANGES).map((p) => p.id), BUILTIN_PRODUCTS.map((p) => p.id));
});

test("an edit replaces a built-in product in place; a new product goes at the end", () => {
  const sofa = { ...BUILTIN_PRODUCTS.find((p) => p.id === "sofa3")!, w: 230, name: "Oslo sofa" };
  const lamp = normaliseProduct({ id: "lamp", name: "Floor lamp", category: "chair", kind: "cabinet", w: 40, d: 40, h: 160, price: 999, color: "#222222" });
  const list = applyChanges({ products: { sofa3: sofa, lamp }, hidden: [] });
  assert.equal(list.length, BUILTIN_PRODUCTS.length + 1);
  assert.equal(list.findIndex((p) => p.id === "sofa3"), BUILTIN_PRODUCTS.findIndex((p) => p.id === "sofa3"));
  assert.equal(list.find((p) => p.id === "sofa3")!.w, 230);
  assert.equal(list.at(-1)!.id, "lamp");
});

test("hidden products leave the shop but still resolve, so saved rooms keep working", () => {
  setCatalogue({ products: {}, hidden: ["king"] });
  assert.ok(!products().some((p) => p.id === "king"));
  assert.equal(product("king")!.name, "King bed");
  const plan = decodePlan(encodePlan({ ...DEFAULT_PLAN, items: [{ id: "a", roomId: "bed1", productId: "king", x: 150, z: 150, rot: 0 }] }));
  assert.equal(plan?.items.length, 1);
  setCatalogue(NO_CHANGES);
});

test("edited sizes flow into every item using the product", () => {
  setCatalogue({ products: { coffee: { ...product("coffee")!, w: 130, price: 2499 } }, hidden: [] });
  const d = dimsOf({ id: "x", roomId: "lounge", productId: "coffee", x: 0, z: 0, rot: 0 });
  assert.deepEqual([d.w, d.price], [130, 2499]);
  setCatalogue(NO_CHANGES);
});

test("a custom product can be placed and survives a share link", () => {
  const lamp = normaliseProduct({ id: "lamp", name: "Floor lamp", category: "chair", kind: "cabinet", w: 40, d: 40, h: 160 });
  setCatalogue({ products: { lamp }, hidden: [] });
  const plan: Plan = { ...DEFAULT_PLAN, items: [{ id: "a", roomId: "lounge", productId: "lamp", x: 100, z: 100, rot: 0 }] };
  assert.equal(decodePlan(encodePlan(plan))?.items[0].productId, "lamp");
  setCatalogue(NO_CHANGES);
  // Without it (someone else's browser) the piece is dropped instead of breaking the plan
  assert.equal(decodePlan(encodePlan(plan))?.items.length, 0);
});

test("product input is cleaned: sizes clamped, colour checked, unknown kinds fall back, unsafe addresses dropped", () => {
  const p = normaliseProduct({ id: "a b!c", name: "  Big  ", category: "nope", kind: "spaceship", w: -5, d: 5000, h: "75", price: -1, color: "red", front: 0, photo: "javascript:alert(1)", model: "asset:model-1", modelRot: 45 });
  assert.equal(p.id, "abc");
  assert.equal(p.name, "Big");
  assert.equal(p.category, "decor");
  assert.equal(p.kind, "cabinet");
  assert.deepEqual([p.w, p.d, p.h, p.price], [1, 1000, 75, 0]);
  assert.equal(p.color, "#b48d67");
  assert.equal(p.front, undefined);
  assert.equal(p.photo, undefined);
  assert.equal(p.model, "asset:model-1");
  assert.equal(p.modelRot, undefined);
  assert.equal(normaliseProduct({ modelRot: 270, photo: "https://example.com/a.jpg" }).modelRot, 270);
});

test("a whole changes object is cleaned too, including junk", () => {
  assert.deepEqual(normaliseChanges("nonsense"), NO_CHANGES);
  const c = normaliseChanges({ products: { lamp: { name: "Lamp", w: 40 } }, hidden: ["king", "king", 3] });
  assert.equal(c.products.lamp.id, "lamp");
  assert.deepEqual(c.hidden, ["king"]);
});

test("new ids come from the name and never clash", () => {
  const taken = new Set(["oslo-sofa", "oslo-sofa-2"]);
  assert.equal(newProductId("Oslo sofa", (x) => taken.has(x)), "oslo-sofa-3");
  assert.equal(newProductId("Café Tisch", () => false), "cafe-tisch");
  assert.equal(newProductId("!!!", () => false), "product");
});
