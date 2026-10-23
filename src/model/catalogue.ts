/**
 * The furniture you can place. These are generic products at typical South African retail sizes (W × D × H in cm,
 * with the front facing +z before rotation). A retailer's catalogue would plug in here from a product feed: any
 * item with dimensions can be placed and checked on day one, and a detailed 3D model can come later.
 * Prices are illustrative.
 */

export type Category = "sofa" | "chair" | "coffeeTable" | "tvUnit" | "diningTable" | "diningChair" | "bed" | "bedside" | "wardrobe" | "desk" | "rug" | "shelving";
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
}

export const CATEGORY_LABELS: Record<Category, string> = {
  sofa: "Sofas", chair: "Armchairs", coffeeTable: "Coffee tables", tvUnit: "TV units", diningTable: "Dining tables", diningChair: "Dining chairs",
  bed: "Beds", bedside: "Bedside tables", wardrobe: "Wardrobes", desk: "Desks", rug: "Rugs", shelving: "Shelving"
};

export const PRODUCTS: Product[] = [
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

export const product = (id: string): Product | undefined => PRODUCTS.find((p) => p.id === id);

/** Pairs meant to sit close together, so a narrow gap between them isn't a walkway problem. */
const NEIGHBOURS: [Category, Category][] = [
  ["bed", "bedside"], ["diningTable", "diningChair"], ["desk", "diningChair"], ["sofa", "chair"], ["sofa", "bedside"], ["chair", "bedside"], ["diningChair", "diningChair"]
];
export function meantToBeClose(a: Category, b: Category): boolean {
  return NEIGHBOURS.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}
