/**
 * The furniture you can place. These are generic products at typical South African retail sizes (W × D × H in cm,
 * with the front facing +z before rotation). A retailer's catalogue would plug in here from a product feed: any
 * item with dimensions can be placed and checked on day one, and a detailed 3D model can come later.
 * Prices are illustrative.
 */

export type Category = "sofa" | "chair" | "coffeeTable" | "tvUnit" | "diningTable" | "diningChair" | "bed" | "bedside" | "wardrobe" | "desk" | "rug" | "shelving" | "lighting" | "decor";
export type Kind = "sofa" | "armchair" | "table" | "lowTable" | "chair" | "bed" | "cabinet" | "wardrobe" | "rug" | "shelving";

export interface Product {
  id: string;
  name: string;
  category: Category;
  kind: Kind;
  w: number; d: number; h: number;
  price: number;
  color: string;
  /** Space needed in front to use it (open doors, pull out a chair), cm. */
  front?: number;
  /** A product photo: a web address, or "asset:<key>" for one uploaded in the catalogue editor. */
  photo?: string;
  /** A glTF/GLB model that replaces the procedural one, scaled to fit W × D × H. Same address forms as photo. */
  model?: string;
  /** Quarter turns to apply to the model so its front faces forward. */
  modelRot?: 0 | 90 | 180 | 270;
}

export const CATEGORY_LABELS: Record<Category, string> = {
  sofa: "Sofas", chair: "Armchairs", coffeeTable: "Coffee tables", tvUnit: "TV units", diningTable: "Dining tables", diningChair: "Dining chairs",
  bed: "Beds", bedside: "Bedside tables", wardrobe: "Wardrobes", desk: "Desks", rug: "Rugs", shelving: "Shelving", lighting: "Lighting", decor: "Decor and other"
};

export const BUILTIN_PRODUCTS: readonly Product[] = [
  { id: "sofa2", name: "Two-seater sofa", category: "sofa", kind: "sofa", w: 165, d: 88, h: 82, price: 7999, color: "#8a8f86" },
  { id: "sofa3", name: "Three-seater sofa", category: "sofa", kind: "sofa", w: 215, d: 92, h: 82, price: 10999, color: "#8a8f86" },
  { id: "sofaL", name: "Corner sofa", category: "sofa", kind: "sofa", w: 260, d: 165, h: 82, price: 16999, color: "#6f7b85" },
  { id: "arm", name: "Armchair", category: "chair", kind: "armchair", w: 82, d: 86, h: 84, price: 3999, color: "#c08a5b" },
  { id: "coffee", name: "Coffee table", category: "coffeeTable", kind: "lowTable", w: 110, d: 60, h: 42, price: 1999, color: "#a47a55" },
  { id: "coffeeR", name: "Round coffee table", category: "coffeeTable", kind: "lowTable", w: 80, d: 80, h: 40, price: 1499, color: "#d8cfc2" },
  { id: "tv180", name: "TV unit, 180 cm", category: "tvUnit", kind: "cabinet", w: 180, d: 40, h: 50, price: 3499, color: "#b48d67", front: 45 },
  { id: "dine4", name: "Dining table for 4", category: "diningTable", kind: "table", w: 140, d: 80, h: 75, price: 3999, color: "#a47a55" },
  { id: "dine6", name: "Dining table for 6", category: "diningTable", kind: "table", w: 180, d: 90, h: 75, price: 5999, color: "#a47a55" },
  { id: "dchair", name: "Dining chair", category: "diningChair", kind: "chair", w: 46, d: 52, h: 86, price: 899, color: "#3f4347" },
  { id: "single", name: "Single bed", category: "bed", kind: "bed", w: 100, d: 200, h: 95, price: 3499, color: "#e9e4dc" },
  { id: "double", name: "Double bed", category: "bed", kind: "bed", w: 145, d: 200, h: 100, price: 5499, color: "#e9e4dc" },
  { id: "queen", name: "Queen bed", category: "bed", kind: "bed", w: 160, d: 210, h: 105, price: 6999, color: "#e9e4dc" },
  { id: "king", name: "King bed", category: "bed", kind: "bed", w: 190, d: 210, h: 105, price: 8999, color: "#e9e4dc" },
  { id: "bedside", name: "Bedside table", category: "bedside", kind: "cabinet", w: 45, d: 40, h: 55, price: 999, color: "#b48d67", front: 40 },
  { id: "ward2", name: "Two-door wardrobe", category: "wardrobe", kind: "wardrobe", w: 100, d: 58, h: 200, price: 4999, color: "#efece6", front: 70 },
  { id: "ward3", name: "Three-door wardrobe", category: "wardrobe", kind: "wardrobe", w: 150, d: 60, h: 210, price: 6999, color: "#efece6", front: 70 },
  { id: "desk", name: "Desk", category: "desk", kind: "table", w: 120, d: 60, h: 75, price: 2499, color: "#b48d67", front: 70 },
  { id: "rug160", name: "Rug, 160 × 230", category: "rug", kind: "rug", w: 230, d: 160, h: 1, price: 1799, color: "#c9b9a2" },
  { id: "rug200", name: "Rug, 200 × 290", category: "rug", kind: "rug", w: 290, d: 200, h: 1, price: 2999, color: "#b5a58d" },
  // Configurable: its size comes from its Shelfline design
  { id: "shelving", name: "Shelving unit (configurable)", category: "shelving", kind: "shelving", w: 240, d: 40, h: 183, price: 0, color: "#1d1f23", front: 50 }
];

/* ---------- The live catalogue: the built-in products with the catalogue editor's changes on top ---------- */

/**
 * What the catalogue editor has changed. `products` holds a full replacement for each edited built-in product,
 * plus every new product; `hidden` lists products taken off sale. A hidden product still resolves by id, so
 * rooms that already contain it keep working.
 */
export interface CatalogueChanges { products: Record<string, Product>; hidden: string[] }
export const NO_CHANGES: CatalogueChanges = { products: {}, hidden: [] };

const BUILTIN_IDS = new Set(BUILTIN_PRODUCTS.map((p) => p.id));
export const isBuiltIn = (id: string) => BUILTIN_IDS.has(id);

export function applyChanges(changes: CatalogueChanges): Product[] {
  const edited = BUILTIN_PRODUCTS.map((b) => changes.products[b.id] ?? b);
  const added = Object.values(changes.products).filter((p) => !BUILTIN_IDS.has(p.id));
  return [...edited, ...added];
}

let all: Product[] = applyChanges(NO_CHANGES);
let hidden = new Set<string>();
export function setCatalogue(changes: CatalogueChanges): void {
  all = applyChanges(changes);
  hidden = new Set(changes.hidden);
}
/** Products on sale, in catalogue order. */
export const products = (): Product[] => all.filter((p) => !hidden.has(p.id));
/** Every product, including hidden ones, for the catalogue editor. */
export const allProducts = (): Product[] => all;
export const isHidden = (id: string) => hidden.has(id);
export const product = (id: string): Product | undefined => all.find((p) => p.id === id);

/* ---------- Checking what the editor (or an imported file) gives us ---------- */

export const KINDS: Record<Kind, string> = {
  sofa: "Sofa", armchair: "Armchair", table: "Table", lowTable: "Low table", chair: "Chair", bed: "Bed",
  cabinet: "Cabinet", wardrobe: "Wardrobe", rug: "Rug", shelving: "Shelving (Shelfline)"
};
export const SIZE_LIMITS = { min: 1, max: 1000 } as const;

const clamp = (v: unknown, lo: number, hi: number, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : fallback;
};
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const address = (v: unknown) => {
  const t = text(v, 2_000_000);
  return /^(https?:|data:|blob:|asset:)/.test(t) || t.startsWith("/") ? t : undefined;
};

/** A product with every field in range: sizes 1–1000 cm, a #rrggbb colour, a known category and kind. */
export function normaliseProduct(raw: unknown, fallbackId = "custom"): Product {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const category = (Object.keys(CATEGORY_LABELS) as Category[]).includes(r.category as Category) ? (r.category as Category) : "decor";
  const kind = (Object.keys(KINDS) as Kind[]).includes(r.kind as Kind) ? (r.kind as Kind) : "cabinet";
  const id = text(r.id, 40).replace(/[^A-Za-z0-9_-]/g, "") || fallbackId;
  const p: Product = {
    id, name: text(r.name, 60) || "Untitled product", category, kind,
    w: clamp(r.w, SIZE_LIMITS.min, SIZE_LIMITS.max, 100), d: clamp(r.d, SIZE_LIMITS.min, SIZE_LIMITS.max, 60), h: clamp(r.h, SIZE_LIMITS.min, SIZE_LIMITS.max, 80),
    price: clamp(r.price, 0, 10_000_000, 0),
    color: typeof r.color === "string" && /^#[0-9a-f]{6}$/i.test(r.color) ? r.color.toLowerCase() : "#b48d67"
  };
  if (r.front != null && r.front !== "") { const f = clamp(r.front, 0, 300, 0); if (f > 0) p.front = f; }
  const photo = address(r.photo), model = address(r.model);
  if (photo) p.photo = photo;
  if (model) p.model = model;
  const rot = Number(r.modelRot);
  if (rot === 90 || rot === 180 || rot === 270) p.modelRot = rot;
  return p;
}

export function normaliseChanges(raw: unknown): CatalogueChanges {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const products: Record<string, Product> = {};
  const src = r.products && typeof r.products === "object" ? Object.entries(r.products as Record<string, unknown>) : [];
  for (const [key, x] of src) { const p = normaliseProduct(x, key.replace(/[^A-Za-z0-9_-]/g, "") || "custom"); products[p.id] = p; }
  const hiddenIds = Array.isArray(r.hidden) ? r.hidden.filter((h): h is string => typeof h === "string") : [];
  return { products, hidden: [...new Set(hiddenIds)] };
}

/** An id for a new product that isn't taken, from its name: "Oslo sofa" → "oslo-sofa". */
export function newProductId(name: string, taken: (id: string) => boolean): string {
  const base = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "product";
  let id = base, n = 2;
  while (taken(id)) id = `${base}-${n++}`;
  return id;
}

/** Pairs meant to sit close together, so a narrow gap between them isn't a walkway problem. */
const NEIGHBOURS: [Category, Category][] = [
  ["bed", "bedside"], ["diningTable", "diningChair"], ["desk", "diningChair"], ["sofa", "chair"], ["sofa", "bedside"], ["chair", "bedside"], ["diningChair", "diningChair"],
  ["lighting", "sofa"], ["lighting", "chair"], ["lighting", "bedside"], ["lighting", "desk"], ["lighting", "bed"]
];
export function meantToBeClose(a: Category, b: Category): boolean {
  return NEIGHBOURS.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}
