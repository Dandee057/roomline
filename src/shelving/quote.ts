import { FRAMES, SHELVES, shelfLoadKg, totalWidth, type Config } from "./config.ts";

/**
 * The bill of materials and the price. Each part has a SKU built from its options (so the same part always has
 * the same code) and a unit price in rand. The quote is a pure function of the config.
 */

export interface Line { sku: string; name: string; qty: number; unit: number; total: number; kg: number }
export interface Quote { lines: Line[]; total: number; weightKg: number; loadPerShelfKg: number; shelves: number; widthCm: number }

const FRAME_CODE = { black: "BLK", white: "WHT", galvanised: "GAL", sage: "SGE" } as const;
const SHELF_CODE = { oak: "OAK", walnut: "WAL", birch: "BIR", steel: "STL" } as const;

export function quote(c: Config): Quote {
  const lines: Line[] = [];
  const add = (sku: string, name: string, qty: number, unit: number, unitKg: number) => {
    if (qty > 0) lines.push({ sku, name, qty, unit: Math.round(unit), total: Math.round(unit) * qty, kg: unitKg * qty });
  };
  const f = FRAMES[c.frame], s = SHELVES[c.shelf], fc = FRAME_CODE[c.frame];
  const bays = c.bays.length;

  // Frame: two uprights per side of every bay, priced by length
  add(`UP-${c.height}-${fc}`, `Upright, ${c.height} cm, ${f.label.toLowerCase()}`, (bays + 1) * 2, (120 + c.height * 2.1) * (1 + f.surcharge), (c.height / 100) * 1.1);
  // Depth rails tie each pair of uprights together, top and bottom
  add(`DR-${c.depth}-${fc}`, `Depth rail, ${c.depth} cm`, (bays + 1) * 2, (45 + c.depth * 0.9) * (1 + f.surcharge), (c.depth / 100) * 0.6);

  // Shelves: every level of every bay, priced by area
  const shelves = c.bays.reduce((n, b) => n + b.levels, 0);
  const area = (c.bayWidth / 100) * (c.depth / 100);
  add(`SH-${c.bayWidth}${c.depth}-${SHELF_CODE[c.shelf]}`, `Shelf, ${s.label.toLowerCase()}, ${c.bayWidth} × ${c.depth} cm`, shelves, 90 + area * s.pricePerM2, area * s.kgPerM2);

  const drawers = c.bays.reduce((n, b) => n + b.drawers, 0);
  add(`DW-${c.bayWidth}${c.depth}`, `Drawer, ${c.bayWidth} cm, soft-close`, drawers, 520 + c.bayWidth * 3.2 + c.depth * 2, 4.5 + area * 6);

  if (c.braces) add(`XB-${c.bayWidth}${c.height}`, `Cross brace pair, ${c.bayWidth} × ${c.height} cm`, bays, 140 + (c.bayWidth + c.height) * 0.55, 1.4);
  if (c.backPanels) {
    const panelArea = (c.bayWidth / 100) * (c.height / 100);
    add(`BP-${c.bayWidth}${c.height}-${fc}`, `Back panel, perforated steel`, bays, 160 + panelArea * 420, panelArea * 4.2);
  }
  if (c.base === "castors") add("CS-50", "Locking castor, 50 mm", (bays + 1) * 2, 145, 0.35);
  else add("FT-ADJ", "Levelling foot", (bays + 1) * 2, 28, 0.08);
  add("FX-KIT", "Fixings and wall strap", 1, 85 + bays * 15, 0.4);

  const total = lines.reduce((t, l) => t + l.total, 0);
  const weightKg = Math.round(lines.reduce((t, l) => t + l.kg, 0) * 10) / 10;
  return { lines, total, weightKg, loadPerShelfKg: shelfLoadKg(c), shelves, widthCm: totalWidth(c) };
}

const rand = new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 });
export const formatRand = (n: number) => rand.format(n);
