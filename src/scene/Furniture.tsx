import { useMemo } from "react";
import * as THREE from "three";
import type { Product } from "../model/catalogue.ts";
import type { Dims } from "../model/plan.ts";
import type { Config as ShelvingConfig } from "../shelving/config.ts";
import { ShelvingModel } from "../shelving/ShelvingModel.tsx";

/**
 * Furniture drawn from its dimensions. Each kind is a few simple shapes in proportion: recognisable at a glance and
 * exactly the right size, which is what matters for "will it fit?". A retailer could swap in detailed models per
 * product later without touching anything else. Local units are metres; the item's front faces +z.
 */

const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 32);

const mats = new Map<string, THREE.MeshStandardMaterial>();
function mat(color: string, roughness = 0.75, metalness = 0): THREE.MeshStandardMaterial {
  const key = `${color}|${roughness}|${metalness}`;
  let m = mats.get(key);
  if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness, metalness }); mats.set(key, m); }
  return m;
}
const shade = (hex: string, k: number) => "#" + new THREE.Color(hex).multiplyScalar(k).getHexString();

/** A box by its min/max corners, in metres. */
function B({ x0, x1, y0, y1, z0, z1, m, cyl }: { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number; m: THREE.Material; cyl?: boolean }) {
  return (
    <mesh geometry={cyl ? CYL : BOX} material={m} position={[(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2]} scale={[x1 - x0, y1 - y0, z1 - z0]} castShadow receiveShadow />
  );
}

function Legs({ w, d, h, inset, size, m }: { w: number; d: number; h: number; inset: number; size: number; m: THREE.Material }) {
  const xs = [-w / 2 + inset, w / 2 - inset], zs = [-d / 2 + inset, d / 2 - inset];
  return <>{xs.flatMap((x) => zs.map((z) => <B key={`${x}${z}`} x0={x - size / 2} x1={x + size / 2} y0={0} y1={h} z0={z - size / 2} z1={z + size / 2} m={m} />))}</>;
}

function Sofa({ w, d, h, color, arms = true }: { w: number; d: number; h: number; color: string; arms?: boolean }) {
  const body = mat(color, 0.9), cushion = mat(shade(color, 1.12), 0.95), leg = mat("#3a3128", 0.6);
  const seatH = h * 0.5, arm = Math.min(0.2, w * 0.12), back = Math.min(0.22, d * 0.26);
  const corner = d > 1.3; // corner sofas: a chaise on the right
  const mainD = corner ? Math.min(0.95, d * 0.58) : d;
  const seats = Math.max(1, Math.round((w - 2 * arm) / 0.62));
  const seatW = (w - 2 * arm) / seats;
  return (
    <group>
      <B x0={-w / 2} x1={w / 2} y0={0.06} y1={seatH * 0.72} z0={-d / 2} z1={-d / 2 + mainD} m={body} />
      {corner && <B x0={w / 2 - Math.min(0.95, w * 0.38)} x1={w / 2} y0={0.06} y1={seatH * 0.72} z0={-d / 2 + mainD - 0.01} z1={d / 2} m={body} />}
      <B x0={-w / 2} x1={w / 2} y0={0.06} y1={h} z0={-d / 2} z1={-d / 2 + back} m={body} />
      {arms && <B x0={-w / 2} x1={-w / 2 + arm} y0={0.06} y1={h * 0.72} z0={-d / 2} z1={-d / 2 + mainD} m={body} />}
      {arms && !corner && <B x0={w / 2 - arm} x1={w / 2} y0={0.06} y1={h * 0.72} z0={-d / 2} z1={d / 2} m={body} />}
      {Array.from({ length: seats }, (_, i) => {
        const x0 = -w / 2 + arm + i * seatW + 0.01, x1 = x0 + seatW - 0.02;
        const z1 = corner && x1 > w / 2 - Math.min(0.95, w * 0.38) ? d / 2 - 0.03 : -d / 2 + mainD - 0.02;
        return <B key={i} x0={x0} x1={x1} y0={seatH * 0.72} y1={seatH} z0={-d / 2 + back} z1={z1} m={cushion} />;
      })}
      <Legs w={w} d={d} h={0.06} inset={0.06} size={0.04} m={leg} />
    </group>
  );
}

function Bed({ w, d, h, color }: { w: number; d: number; h: number; color: string }) {
  const frame = mat("#8d6e52", 0.7), mattress = mat("#f4f1ec", 0.95), duvet = mat(color, 0.95), pillow = mat("#ffffff", 0.95);
  return (
    <group>
      <B x0={-w / 2} x1={w / 2} y0={0.05} y1={0.32} z0={-d / 2 + 0.06} z1={d / 2} m={frame} />
      <B x0={-w / 2 + 0.03} x1={w / 2 - 0.03} y0={0.32} y1={0.52} z0={-d / 2 + 0.08} z1={d / 2 - 0.02} m={mattress} />
      <B x0={-w / 2 + 0.01} x1={w / 2 - 0.01} y0={0.5} y1={0.56} z0={-d / 2 + 0.55} z1={d / 2 - 0.01} m={duvet} />
      <B x0={-w / 2} x1={w / 2} y0={0.05} y1={h} z0={-d / 2} z1={-d / 2 + 0.07} m={frame} />
      {(w > 1.2 ? [-w / 4, w / 4] : [0]).map((x) => <B key={x} x0={x - Math.min(0.32, w * 0.21)} x1={x + Math.min(0.32, w * 0.21)} y0={0.52} y1={0.62} z0={-d / 2 + 0.12} z1={-d / 2 + 0.46} m={pillow} />)}
      <Legs w={w} d={d} h={0.05} inset={0.05} size={0.05} m={frame} />
    </group>
  );
}

function Table({ w, d, h, color, low }: { w: number; d: number; h: number; color: string; low?: boolean }) {
  const top = mat(color, 0.6), leg = mat(low ? shade(color, 0.7) : "#2b2b2e", 0.5, low ? 0 : 0.4);
  const round = Math.abs(w - d) < 1e-6 && low;
  if (round) return (
    <group>
      <B cyl x0={-w / 2} x1={w / 2} y0={h - 0.035} y1={h} z0={-d / 2} z1={d / 2} m={top} />
      <B cyl x0={-w / 2 + 0.08} x1={w / 2 - 0.08} y0={0} y1={0.05} z0={-d / 2 + 0.08} z1={d / 2 - 0.08} m={leg} />
      <B cyl x0={-0.04} x1={0.04} y0={0} y1={h} z0={-0.04} z1={0.04} m={leg} />
    </group>
  );
  return (
    <group>
      <B x0={-w / 2} x1={w / 2} y0={h - 0.035} y1={h} z0={-d / 2} z1={d / 2} m={top} />
      {low && <B x0={-w / 2 + 0.05} x1={w / 2 - 0.05} y0={0.1} y1={0.12} z0={-d / 2 + 0.05} z1={d / 2 - 0.05} m={top} />}
      <Legs w={w} d={d} h={h - 0.035} inset={0.05} size={low ? 0.04 : 0.035} m={leg} />
    </group>
  );
}

function Chair({ w, d, h, color }: { w: number; d: number; h: number; color: string }) {
  const m = mat(color, 0.6, 0.1), seat = 0.46;
  return (
    <group>
      <B x0={-w / 2} x1={w / 2} y0={seat - 0.04} y1={seat} z0={-d / 2} z1={d / 2} m={m} />
      <B x0={-w / 2} x1={w / 2} y0={seat} y1={h} z0={-d / 2} z1={-d / 2 + 0.03} m={m} />
      <Legs w={w} d={d} h={seat - 0.04} inset={0.025} size={0.03} m={m} />
    </group>
  );
}

function Cabinet({ w, d, h, color, tall }: { w: number; d: number; h: number; color: string; tall?: boolean }) {
  const body = mat(color, 0.55), line = mat(shade(color, 0.72), 0.6), handle = mat("#9da3a8", 0.3, 0.9);
  const doors = tall ? Math.max(2, Math.round(w / 0.5)) : Math.max(1, Math.round(w / 0.6));
  const foot = tall ? 0.05 : 0.08;
  return (
    <group>
      <B x0={-w / 2} x1={w / 2} y0={foot} y1={h} z0={-d / 2} z1={d / 2} m={body} />
      <B x0={-w / 2 + 0.02} x1={w / 2 - 0.02} y0={0} y1={foot} z0={-d / 2 + 0.02} z1={d / 2 - 0.03} m={line} />
      {Array.from({ length: doors - 1 }, (_, i) => { const x = -w / 2 + ((i + 1) * w) / doors; return <B key={i} x0={x - 0.003} x1={x + 0.003} y0={foot + 0.01} y1={h - 0.01} z0={d / 2} z1={d / 2 + 0.002} m={line} />; })}
      {Array.from({ length: doors }, (_, i) => {
        const x = -w / 2 + ((i + 0.5) * w) / doors + (tall ? (i % 2 ? -1 : 1) * (w / doors) * 0.38 : 0);
        const y = tall ? foot + (h - foot) * 0.52 : h - 0.06;
        return tall
          ? <B key={i} x0={x - 0.008} x1={x + 0.008} y0={y - 0.12} y1={y + 0.12} z0={d / 2} z1={d / 2 + 0.02} m={handle} />
          : <B key={i} x0={x - 0.07} x1={x + 0.07} y0={y - 0.006} y1={y + 0.006} z0={d / 2} z1={d / 2 + 0.02} m={handle} />;
      })}
    </group>
  );
}

function Rug({ w, d, color }: { w: number; d: number; color: string }) {
  const field = mat(color, 1), border = mat(shade(color, 0.8), 1);
  return (
    <group>
      <B x0={-w / 2} x1={w / 2} y0={0.001} y1={0.009} z0={-d / 2} z1={d / 2} m={border} />
      <B x0={-w / 2 + 0.08} x1={w / 2 - 0.08} y0={0.009} y1={0.011} z0={-d / 2 + 0.08} z1={d / 2 - 0.08} m={field} />
    </group>
  );
}

export function FurnitureModel({ p, dims, shelving }: { p: Product; dims: Dims; shelving?: ShelvingConfig }) {
  const w = dims.w / 100, d = dims.d / 100, h = dims.h / 100;
  const model = useMemo(() => {
    switch (p.kind) {
      case "sofa": return <Sofa w={w} d={d} h={h} color={p.color} />;
      case "armchair": return <Sofa w={w} d={d} h={h} color={p.color} />;
      case "bed": return <Bed w={w} d={d} h={h} color={p.color} />;
      case "table": return <Table w={w} d={d} h={h} color={p.color} />;
      case "lowTable": return <Table w={w} d={d} h={h} color={p.color} low />;
      case "chair": return <Chair w={w} d={d} h={h} color={p.color} />;
      case "cabinet": return <Cabinet w={w} d={d} h={h} color={p.color} />;
      case "wardrobe": return <Cabinet w={w} d={d} h={h} color={p.color} tall />;
      case "rug": return <Rug w={w} d={d} color={p.color} />;
      default: return null;
    }
  }, [p, w, d, h]);
  if (p.kind === "shelving" && shelving) return <ShelvingModel config={shelving} />;
  return model;
}
