import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CONFIG, normalise, type Config } from "../src/shelving/config.ts";
import { quote } from "../src/shelving/quote.ts";
import { layout } from "../src/shelving/layout.ts";

const designs: Config[] = [
  DEFAULT_CONFIG,
  normalise({ ...DEFAULT_CONFIG, bays: [{ levels: 2, drawers: 0 }], height: 90, base: "castors", braces: false, backPanels: true }).config,
  normalise({ ...DEFAULT_CONFIG, bays: Array.from({ length: 6 }, (_, i) => ({ levels: 3 + i, drawers: i % 3 })), height: 240, bayWidth: 100, depth: 50, backPanels: true }).config
];

test("the 3D model has exactly the parts on the quote", () => {
  for (const c of designs) {
    const parts = layout(c).parts, q = quote(c);
    const count = (kind: string) => parts.filter((p) => p.kind === kind).length;
    const qty = (prefix: string) => q.lines.find((l) => l.sku.startsWith(prefix))?.qty ?? 0;
    assert.equal(count("upright"), qty("UP-"));
    assert.equal(count("rail"), qty("DR-"));
    assert.equal(count("shelf"), qty("SH-"));
    assert.equal(count("drawer"), qty("DW-"));
    assert.equal(count("brace"), qty("XB-") * 2);
    assert.equal(count("panel"), qty("BP-"));
    assert.equal(count("foot") + count("castor"), qty("FT-") + qty("CS-"));
  }
});

test("every part sits inside the unit's bounding box", () => {
  for (const c of designs) {
    const l = layout(c);
    for (const p of l.parts) {
      if (p.kind === "brace" || p.kind === "handle") continue; // braces are rotated; handles stand proud of the front
      for (const [axis, half] of [[0, l.width / 2], [2, l.depth / 2]] as const)
        assert.ok(Math.abs(p.pos[axis]) + p.size[axis] / 2 <= half + 1e-9, `${p.key} pokes out along axis ${axis}`);
      assert.ok(p.pos[1] - p.size[1] / 2 >= -1e-9 && p.pos[1] + p.size[1] / 2 <= l.height + 1e-9, `${p.key} pokes out vertically`);
    }
  }
});

test("part keys are unique, so animations track the right part", () => {
  for (const c of designs) {
    const keys = layout(c).parts.map((p) => p.key);
    assert.equal(new Set(keys).size, keys.length);
  }
});
