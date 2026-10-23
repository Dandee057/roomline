import { DEFAULT_CONFIG, normalise, type Base, type Config, type FrameFinish, type ShelfMaterial } from "./config.ts";

/**
 * Designs live in the URL, so any configuration can be shared or bookmarked. The format is short and readable:
 *
 *   ?bays=5.4d2.5&w=80&h=180&d=40&frame=black&shelf=oak&back=0&brace=1&base=feet
 *
 * Each bay is its level count, plus `d` and a drawer count when it has drawers. Anything missing falls back to the
 * default, and anything invalid is snapped by `normalise()`, so a hand-edited or truncated link still opens.
 */

export function encode(c: Config): string {
  const p = new URLSearchParams();
  p.set("bays", c.bays.map((b) => (b.drawers ? `${b.levels}d${b.drawers}` : String(b.levels))).join("."));
  p.set("w", String(c.bayWidth));
  p.set("h", String(c.height));
  p.set("d", String(c.depth));
  p.set("frame", c.frame);
  p.set("shelf", c.shelf);
  p.set("back", c.backPanels ? "1" : "0");
  p.set("brace", c.braces ? "1" : "0");
  p.set("base", c.base);
  return p.toString();
}

/** Reads a design from a query string. Returns null when there's no design in it. */
export function decode(query: string): Config | null {
  const p = new URLSearchParams(query.startsWith("?") ? query.slice(1) : query);
  if (!p.has("bays")) return null;
  const num = (k: string, fallback: number) => { const v = Number(p.get(k)); return p.has(k) && Number.isFinite(v) ? v : fallback; };
  const bool = (k: string, fallback: boolean) => (p.has(k) ? p.get(k) === "1" : fallback);
  const bays = (p.get("bays") ?? "")
    .split(".")
    .map((s) => /^(\d+)(?:d(\d+))?$/.exec(s.trim()))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => ({ levels: Number(m[1]), drawers: Number(m[2] ?? 0) }));
  const raw: Config = {
    bays: bays.length ? bays : DEFAULT_CONFIG.bays,
    bayWidth: num("w", DEFAULT_CONFIG.bayWidth),
    height: num("h", DEFAULT_CONFIG.height),
    depth: num("d", DEFAULT_CONFIG.depth),
    frame: (p.get("frame") ?? DEFAULT_CONFIG.frame) as FrameFinish,
    shelf: (p.get("shelf") ?? DEFAULT_CONFIG.shelf) as ShelfMaterial,
    backPanels: bool("back", DEFAULT_CONFIG.backPanels),
    braces: bool("brace", DEFAULT_CONFIG.braces),
    base: (p.get("base") ?? DEFAULT_CONFIG.base) as Base
  };
  return normalise(raw).config;
}
