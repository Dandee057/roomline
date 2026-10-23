import { DRAWER_HEIGHT, levelHeights, type Config } from "./config.ts";

/**
 * Where every physical part goes, in metres: the unit stands on y = 0, centred on x = 0, front facing +z.
 * The scene draws this list; nothing in the scene knows the product rules. Keys are stable per part, so the
 * renderer can animate a part from where it was to where it is now.
 */

export type PartKind = "upright" | "rail" | "shelf" | "carcass" | "drawer" | "handle" | "brace" | "panel" | "foot" | "castor";

export interface Part {
  key: string;
  kind: PartKind;
  bay?: number;
  pos: [number, number, number];
  size: [number, number, number];
  /** Rotation about z, for the diagonal braces. */
  rotZ?: number;
}

export const POST = 0.032;        // upright section
export const SHELF_T = 0.022;     // shelf thickness
const RAIL_T = 0.028;

export interface Layout {
  parts: Part[];
  width: number; height: number; depth: number;
  /** Height of the frame's underside above the floor (feet or castors). */
  base: number;
  /** Centre x and width of each bay, for picking and highlighting. */
  bays: { x: number; w: number }[];
}

export function layout(c: Config): Layout {
  const bw = c.bayWidth / 100, H = c.height / 100, D = c.depth / 100, n = c.bays.length, W = n * bw;
  const base = c.base === "castors" ? 0.085 : 0.025;
  const parts: Part[] = [];
  const frameX = (i: number) => Math.max(-W / 2 + POST / 2, Math.min(W / 2 - POST / 2, -W / 2 + i * bw));
  const bayX = (j: number) => -W / 2 + (j + 0.5) * bw;

  // Frames: a front and back upright on every bay line, tied by depth rails top and bottom
  for (let i = 0; i <= n; i++) {
    const x = frameX(i);
    for (const side of [1, -1]) {
      parts.push({ key: `up-${i}-${side}`, kind: "upright", pos: [x, base + H / 2, side * (D / 2 - POST / 2)], size: [POST, H, POST] });
      if (c.base === "castors") parts.push({ key: `cs-${i}-${side}`, kind: "castor", pos: [x, base / 2, side * (D / 2 - POST / 2)], size: [POST, base, POST] });
      else parts.push({ key: `ft-${i}-${side}`, kind: "foot", pos: [x, base / 2, side * (D / 2 - POST / 2)], size: [0.026, base, 0.026] });
    }
    for (const [k, y] of [["b", base + RAIL_T / 2 + 0.02], ["t", base + H - RAIL_T / 2]] as const)
      parts.push({ key: `rl-${i}-${k}`, kind: "rail", pos: [x, y, 0], size: [POST * 0.7, RAIL_T, D - POST * 2] });
  }

  c.bays.forEach((bay, j) => {
    const x = bayX(j), inner = bw - POST;
    // Shelves at each level; the top one sits flush with the frame
    levelHeights(c, bay).forEach((hcm, k) => {
      const y = base + Math.max(SHELF_T / 2, Math.min(H - SHELF_T / 2, hcm / 100 + (k === 0 && !bay.drawers ? 0.03 : 0)));
      parts.push({ key: `sh-${j}-${k}`, kind: "shelf", bay: j, pos: [x, y, 0], size: [inner, SHELF_T, D - 0.012] });
    });
    // Drawers fill the bottom of the bay, inside a steel carcass
    if (bay.drawers) {
      const dh = DRAWER_HEIGHT / 100, block = dh * bay.drawers;
      parts.push({ key: `cc-${j}`, kind: "carcass", bay: j, pos: [x, base + block / 2, -0.004], size: [inner - 0.004, block, D - 0.02] });
      for (let k = 0; k < bay.drawers; k++) {
        const y = base + dh * (k + 0.5);
        parts.push({ key: `dw-${j}-${k}`, kind: "drawer", bay: j, pos: [x, y, D / 2 - 0.012], size: [inner - 0.014, dh - 0.01, 0.018] });
        parts.push({ key: `hd-${j}-${k}`, kind: "handle", bay: j, pos: [x, y + dh * 0.22, D / 2 + 0.006], size: [Math.min(0.22, inner * 0.4), 0.012, 0.014] });
      }
    }
    if (c.braces) {
      const span = inner, rise = H - 0.12, len = Math.hypot(span, rise), a = Math.atan2(rise, span);
      for (const s of [1, -1])
        parts.push({ key: `xb-${j}-${s}`, kind: "brace", bay: j, pos: [x, base + H / 2, -D / 2 + POST / 2], size: [len, 0.012, 0.004], rotZ: s * a });
    }
    if (c.backPanels) parts.push({ key: `bp-${j}`, kind: "panel", bay: j, pos: [x, base + H / 2, -D / 2 + 0.006], size: [inner, H - 0.02, 0.003] });
  });

  return { parts, width: W, height: H + base, depth: D, base, bays: c.bays.map((_, j) => ({ x: bayX(j), w: bw })) };
}
