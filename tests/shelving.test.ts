import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CONFIG, levelHeights, maxDrawers, maxLevels, normalise, shelfLoadKg, type Config } from "../src/shelving/config.ts";
import { quote } from "../src/shelving/quote.ts";
import { decode, encode } from "../src/shelving/url.ts";

const cfg = (over: Partial<Config> = {}): Config => ({ ...DEFAULT_CONFIG, ...over });

test("the default design is already buildable", () => {
  const { config, notes } = normalise(DEFAULT_CONFIG);
  assert.deepEqual(config, DEFAULT_CONFIG);
  assert.deepEqual(notes, []);
});

test("sizes snap to the nearest option", () => {
  const { config } = normalise(cfg({ bayWidth: 73, height: 199, depth: 47 }));
  assert.equal(config.bayWidth, 80);
  assert.equal(config.height, 210);
  assert.equal(config.depth, 50);
});

test("shelf and drawer counts are limited by height", () => {
  assert.equal(maxLevels(90, 0), 5);
  assert.equal(maxLevels(240, 0), 8);
  assert.ok(maxLevels(120, 2) < maxLevels(120, 0));
  assert.equal(maxDrawers(90), 2);
  const { config, notes } = normalise(cfg({ height: 90, bays: [{ levels: 8, drawers: 3 }] }));
  assert.ok(config.bays[0].levels <= maxLevels(90, config.bays[0].drawers));
  assert.ok(config.bays[0].drawers <= 2);
  assert.equal(notes.length, 1);
});

test("tall units can't have castors and must be braced", () => {
  const { config, notes } = normalise(cfg({ height: 240, base: "castors", braces: false }));
  assert.equal(config.base, "feet");
  assert.equal(config.braces, true);
  assert.equal(notes.length, 2);
});

test("bays are capped at six", () => {
  const many = Array.from({ length: 9 }, () => ({ levels: 4, drawers: 0 }));
  assert.equal(normalise(cfg({ bays: many })).config.bays.length, 6);
});

test("shelves are evenly spaced above the drawers", () => {
  const h = levelHeights(cfg({ height: 180 }), { levels: 4, drawers: 2 });
  assert.deepEqual(h.map((v) => Math.round(v * 10) / 10), [40, 86.7, 133.3, 180]);
  assert.deepEqual(levelHeights(cfg({ height: 120 }), { levels: 2, drawers: 0 }), [0, 120]);
});

test("wider shelves carry less", () => {
  assert.ok(shelfLoadKg(cfg({ bayWidth: 60 })) > shelfLoadKg(cfg({ bayWidth: 100 })));
  assert.ok(shelfLoadKg(cfg({ shelf: "steel" })) > shelfLoadKg(cfg({ shelf: "walnut" })));
});

test("the quote counts every part", () => {
  const q = quote(DEFAULT_CONFIG);
  const qty = (prefix: string) => q.lines.find((l) => l.sku.startsWith(prefix))?.qty ?? 0;
  assert.equal(qty("UP-"), 8);   // 3 bays → 4 frames × 2 uprights
  assert.equal(qty("SH-"), 14);  // 5 + 4 + 5 levels
  assert.equal(qty("DW-"), 2);
  assert.equal(qty("XB-"), 3);
  assert.equal(qty("BP-"), 0);   // no back panels by default
  assert.equal(qty("FT-"), 8);
  assert.equal(q.total, q.lines.reduce((t, l) => t + l.total, 0));
  assert.equal(q.widthCm, 240);
});

test("options change the price in the expected direction", () => {
  const base = quote(DEFAULT_CONFIG).total;
  assert.ok(quote(cfg({ shelf: "walnut" })).total > base);
  assert.ok(quote(cfg({ backPanels: true })).total > base);
  assert.ok(quote(cfg({ bays: DEFAULT_CONFIG.bays.slice(0, 2) })).total < base);
  assert.ok(quote(cfg({ frame: "galvanised" })).total > base);
});

test("SKUs follow the options", () => {
  const skus = quote(cfg({ frame: "white", shelf: "steel", bayWidth: 100, depth: 30, height: 120 })).lines.map((l) => l.sku);
  assert.ok(skus.includes("UP-120-WHT"));
  assert.ok(skus.includes("SH-10030-STL"));
});

test("a design survives a round trip through the URL", () => {
  const c = normalise(cfg({ bays: [{ levels: 6, drawers: 0 }, { levels: 3, drawers: 2 }], frame: "sage", shelf: "walnut", backPanels: true, base: "castors", height: 150 })).config;
  const q = encode(c);
  assert.match(q, /bays=6\.3d2/);
  assert.deepEqual(decode("?" + q), c);
});

test("a broken or partial link still opens a valid design", () => {
  assert.equal(decode("?foo=1"), null);
  const c = decode("?bays=9.x.3d9&w=999&frame=purple&h=abc")!;
  assert.deepEqual(c.bays.map((b) => b.levels), [8, 3].map((n, i) => Math.min(n, maxLevels(c.height, c.bays[i].drawers))));
  assert.equal(c.bayWidth, 100);
  assert.equal(c.frame, DEFAULT_CONFIG.frame);
  assert.equal(c.height, DEFAULT_CONFIG.height);
});
