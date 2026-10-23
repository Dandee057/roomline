/**
 * The product: a modular steel-framed shelving unit, one or more bays wide.
 *
 * Everything the 3D view and the UI show is derived from a `Config`. `normalise()` is the rules engine: it turns
 * any requested config into a buildable one and explains each change it had to make, so the UI can say why
 * (for example, why castors switched off when the unit got too tall).
 */

export const BAY_WIDTHS = [60, 80, 100] as const;          // cm
export const HEIGHTS = [90, 120, 150, 180, 210, 240] as const; // cm
export const DEPTHS = [30, 40, 50] as const;               // cm
export const MIN_BAYS = 1, MAX_BAYS = 6;
export const MIN_LEVELS = 2, MAX_LEVELS = 8;
export const DRAWER_HEIGHT = 20;   // cm per drawer
export const MIN_GAP = 22;         // cm of clear space a shelf needs above it
export const CASTOR_MAX_HEIGHT = 180;
export const BRACE_REQUIRED_ABOVE = 180;

export type FrameFinish = "black" | "white" | "galvanised" | "sage";
export type ShelfMaterial = "oak" | "walnut" | "birch" | "steel";
export type Base = "feet" | "castors";

export interface Bay {
  /** Horizontal surfaces in the bay, counting the top and the bottom. */
  levels: number;
  /** Drawers fitted at the bottom of the bay, each DRAWER_HEIGHT tall. */
  drawers: number;
}

export interface Config {
  bays: Bay[];
  bayWidth: number;
  height: number;
  depth: number;
  frame: FrameFinish;
  shelf: ShelfMaterial;
  backPanels: boolean;
  braces: boolean;
  base: Base;
}

export const FRAMES: Record<FrameFinish, { label: string; color: string; metalness: number; roughness: number; surcharge: number }> = {
  black: { label: "Black", color: "#1d1f23", metalness: 0.35, roughness: 0.55, surcharge: 0 },
  white: { label: "White", color: "#e9e7e2", metalness: 0.2, roughness: 0.5, surcharge: 0 },
  galvanised: { label: "Galvanised", color: "#a7adb3", metalness: 0.85, roughness: 0.35, surcharge: 0.08 },
  sage: { label: "Sage", color: "#8a9a82", metalness: 0.25, roughness: 0.55, surcharge: 0.1 }
};

export const SHELVES: Record<ShelfMaterial, { label: string; color: string; grain: boolean; loadKg: number; pricePerM2: number; kgPerM2: number }> = {
  oak: { label: "Oak", color: "#c49a6c", grain: true, loadKg: 50, pricePerM2: 1150, kgPerM2: 12 },
  walnut: { label: "Walnut", color: "#6b4630", grain: true, loadKg: 45, pricePerM2: 1650, kgPerM2: 11 },
  birch: { label: "Birch ply", color: "#dcc8a4", grain: true, loadKg: 60, pricePerM2: 780, kgPerM2: 10 },
  steel: { label: "Steel", color: "#8c9096", grain: false, loadKg: 120, pricePerM2: 950, kgPerM2: 16 }
};

export const DEFAULT_CONFIG: Config = {
  bays: [{ levels: 5, drawers: 0 }, { levels: 4, drawers: 2 }, { levels: 5, drawers: 0 }],
  bayWidth: 80,
  height: 180,
  depth: 40,
  frame: "black",
  shelf: "oak",
  backPanels: false,
  braces: true,
  base: "feet"
};

/** The most levels a bay can hold at this height with this many drawers. */
export function maxLevels(height: number, drawers: number): number {
  const free = height - drawers * DRAWER_HEIGHT;
  // With drawers, the drawer block's top counts as the lowest surface
  return Math.max(MIN_LEVELS, Math.min(MAX_LEVELS, Math.floor(free / MIN_GAP) + 1));
}

/** The most drawers a bay can hold at this height (always leaving one clear compartment above). */
export function maxDrawers(height: number): number {
  return Math.max(0, Math.min(3, Math.floor((height - MIN_GAP * 1.5) / DRAWER_HEIGHT)));
}

const nearest = <T extends number>(list: readonly T[], v: number): T => list.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
const clampInt = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(Number.isFinite(v) ? v : lo)));

export interface Normalised { config: Config; notes: string[] }

/** Snaps every value to something buildable, and explains each adjustment. */
export function normalise(input: Config): Normalised {
  const notes: string[] = [];
  const height = nearest(HEIGHTS, input.height);
  const c: Config = {
    ...input,
    bayWidth: nearest(BAY_WIDTHS, input.bayWidth),
    height,
    depth: nearest(DEPTHS, input.depth),
    frame: input.frame in FRAMES ? input.frame : DEFAULT_CONFIG.frame,
    shelf: input.shelf in SHELVES ? input.shelf : DEFAULT_CONFIG.shelf,
    base: input.base === "castors" ? "castors" : "feet",
    bays: (input.bays.length ? input.bays : DEFAULT_CONFIG.bays).slice(0, MAX_BAYS).map((b) => {
      const drawers = clampInt(b.drawers, 0, maxDrawers(height));
      return { drawers, levels: clampInt(b.levels, MIN_LEVELS, maxLevels(height, drawers)) };
    })
  };
  if (input.bays.some((b, i) => c.bays[i] && (b.levels !== c.bays[i].levels || b.drawers !== c.bays[i].drawers)))
    notes.push(`Some bays had more shelves or drawers than fit at ${height} cm, so they were reduced.`);
  if (c.base === "castors" && height > CASTOR_MAX_HEIGHT) {
    c.base = "feet";
    notes.push(`Castors are only offered up to ${CASTOR_MAX_HEIGHT} cm tall, for stability. Switched to feet.`);
  }
  if (!c.braces && height > BRACE_REQUIRED_ABOVE) {
    c.braces = true;
    notes.push(`Units over ${BRACE_REQUIRED_ABOVE} cm need cross bracing, so it's been added.`);
  }
  return { config: c, notes };
}

export const totalWidth = (c: Config) => c.bays.length * c.bayWidth;

/** Heights (cm from the base) of each surface in a bay. Drawers fill the bottom; shelves are evenly spaced above. */
export function levelHeights(c: Config, bay: Bay): number[] {
  const bottom = bay.drawers * DRAWER_HEIGHT;
  const top = c.height;
  const n = bay.levels;
  return Array.from({ length: n }, (_, i) => (n === 1 ? bottom : bottom + ((top - bottom) * i) / (n - 1)));
}

/** Safe load per shelf, by material and span: wider shelves carry less. */
export function shelfLoadKg(c: Config): number {
  const span = { 60: 1.25, 80: 1, 100: 0.75 }[c.bayWidth] ?? 1;
  return Math.round((SHELVES[c.shelf].loadKg * span) / 5) * 5;
}
