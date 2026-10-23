import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import { FLOORS, walls, outline, type Floor, type Opening, type Room } from "../model/room.ts";
import type { ViewMode } from "../store.ts";

/**
 * The room in metres, centred on the origin. Walls stand outside the floor outline, so the floor's inner size is
 * exactly what was measured. Doors and windows are real gaps in the walls. In 3D the walls nearest the camera drop
 * to a low skirting, like a dollhouse, so you can always see in.
 */

export const T = 0.1;            // wall thickness, m
export const DOOR_H = 2.05, WINDOW_TOP = 2.1, SILL = 0.9;

/** Floor plan cm → world metres, with the room centred. */
export const toWorld = (r: Room, x: number, z: number): [number, number] => [(x - r.width / 2) / 100, (z - r.length / 2) / 100];

const floorTextures = new Map<Floor, THREE.CanvasTexture>();
function floorTexture(kind: Floor): THREE.CanvasTexture {
  let t = floorTextures.get(kind);
  if (t) return t;
  const s = 512, c = document.createElement("canvas");
  c.width = c.height = s;
  const g = c.getContext("2d")!;
  const f = FLOORS[kind];
  g.fillStyle = f.color; g.fillRect(0, 0, s, s);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  if (kind === "oak" || kind === "ash") {
    // Boards 16 cm wide (this texture covers 1 m), with staggered joints and faint grain
    const rows = 6;
    for (let r = 0; r < rows; r++) {
      const y = (r * s) / rows;
      g.fillStyle = `rgba(0,0,0,${0.02 + rnd() * 0.05})`; g.fillRect(0, y, s, s / rows);
      for (let i = 0; i < 14; i++) {
        g.strokeStyle = `rgba(70,45,20,${0.04 + rnd() * 0.05})`; g.lineWidth = 1;
        const yy = y + rnd() * (s / rows); g.beginPath(); g.moveTo(0, yy); g.bezierCurveTo(s * 0.3, yy + 3, s * 0.6, yy - 3, s, yy + rnd() * 2); g.stroke();
      }
      g.fillStyle = "rgba(60,40,20,0.35)"; g.fillRect(0, y, s, 2);
      const joint = ((r * 0.37) % 1) * s; g.fillRect(joint, y, 2, s / rows);
    }
  } else if (kind === "tiles") {
    g.strokeStyle = "rgba(90,90,90,0.5)"; g.lineWidth = 3;
    for (let i = 0; i <= 2; i++) { const p = (i * s) / 2; g.beginPath(); g.moveTo(p, 0); g.lineTo(p, s); g.moveTo(0, p); g.lineTo(s, p); g.stroke(); }
  } else {
    for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(${rnd() > 0.5 ? "255,255,255" : "0,0,0"},0.05)`; g.fillRect(rnd() * s, rnd() * s, 2, 2); }
  }
  t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  floorTextures.set(kind, t);
  return t;
}

export interface FloorHandlers {
  onPointerDown?: (e: ThreeEvent<PointerEvent>) => void;
  onPointerMove?: (e: ThreeEvent<PointerEvent>) => void;
  onPointerUp?: (e: ThreeEvent<PointerEvent>) => void;
}

function FloorMesh({ room, handlers }: { room: Room; handlers?: FloorHandlers }) {
  const geo = useMemo(() => {
    // Shape in metres with z negated, then laid flat: ShapeGeometry's UVs are its coordinates, so 1 texture = 1 m
    const shape = new THREE.Shape(outline(room).map(([x, z]) => { const [wx, wz] = toWorld(room, x, z); return new THREE.Vector2(wx, -wz); }));
    return new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
  }, [room]);
  return (
    <mesh geometry={geo} receiveShadow {...handlers} onPointerCancel={handlers?.onPointerUp}>
      <meshStandardMaterial map={floorTexture(room.floor)} roughness={room.floor === "carpet" ? 1 : 0.7} />
    </mesh>
  );
}

interface Piece { x: number; z: number; sx: number; sz: number; y0: number; y1: number; wall: number }

/** Wall boxes, with gaps for doors, windows and doorways from neighbouring rooms, and the corners filled. */
function wallPieces(room: Room, passages: Opening[]): { pieces: Piece[]; glass: Piece[]; sills: Piece[] } {
  const ws = walls(room), n = ws.length, H = room.height / 100;
  const pieces: Piece[] = [], glass: Piece[] = [], sills: Piece[] = [];
  const dir = (i: number) => { const w = ws[(i + n) % n]; return [(w.b[0] - w.a[0]) / w.length, (w.b[1] - w.a[1]) / w.length]; };
  const convex = (i: number) => { const d1 = dir(i - 1), d2 = dir(i); return d1[0] * d2[1] - d1[1] * d2[0] > 0; }; // corner at the start of wall i
  ws.forEach((w, i) => {
    const t = dir(i), len = w.length / 100;
    const ext0 = convex(i) ? T : 0, ext1 = convex(i + 1) ? T : 0;
    const add = (list: Piece[], s0: number, s1: number, y0: number, y1: number, depth = T, inset = 0) => {
      if (s1 - s0 < 1e-4 || y1 - y0 < 1e-4) return;
      const [ax, az] = toWorld(room, w.a[0], w.a[1]);
      const mid = (s0 + s1) / 2;
      const off = -depth / 2 + inset; // positive = into the room
      const x = ax + t[0] * mid + w.normal[0] * off, z = az + t[1] * mid + w.normal[1] * off;
      const along = s1 - s0;
      list.push({ x, z, sx: Math.abs(t[0]) * along + Math.abs(w.normal[0]) * depth, sz: Math.abs(t[1]) * along + Math.abs(w.normal[1]) * depth, y0, y1, wall: i });
    };
    const ops = [...room.openings, ...passages].filter((o) => o.wall === i).sort((a, b) => a.offset - b.offset);
    let cursor = -ext0;
    for (const o of ops) {
      const s0 = o.offset / 100, s1 = (o.offset + o.width) / 100;
      if (s0 < cursor) { cursor = Math.max(cursor, s1); continue; } // overlapping openings (a doorway over a door)
      add(pieces, cursor, s0, 0, H);
      if (o.kind === "door") add(pieces, s0, s1, DOOR_H, H);
      else {
        add(pieces, s0, s1, 0, SILL); add(pieces, s0, s1, WINDOW_TOP, H);
        add(glass, s0, s1, SILL, WINDOW_TOP, 0.012, -T / 2 + 0.006);
        add(sills, s0 - 0.03, s1 + 0.03, SILL - 0.03, SILL, 0.06, 0.03);
      }
      cursor = s1;
    }
    add(pieces, cursor, len + ext1, 0, H);
  });
  return { pieces, glass, sills };
}

const BOX = new THREE.BoxGeometry(1, 1, 1);

function Doors({ room, cut }: { room: Room; cut: boolean[] }) {
  const ws = walls(room);
  const leaf = useMemo(() => new THREE.MeshStandardMaterial({ color: "#f7f5f0", roughness: 0.6 }), []);
  return (
    <>
      {room.openings.filter((o) => o.kind === "door").map((o) => {
        const w = ws[o.wall], len = w.length;
        const t = [(w.b[0] - w.a[0]) / len, (w.b[1] - w.a[1]) / len];
        const right = o.hinge === "right";
        const s = right ? o.offset + o.width : o.offset;
        const hinge = [w.a[0] + t[0] * s, w.a[1] + t[1] * s];
        const closedDir = right ? [-t[0], -t[1]] : t;
        // Leaf open at 90°, standing into the room from the hinge
        const r = o.width / 100, [hx, hz] = toWorld(room, hinge[0], hinge[1]);
        const nx = w.normal[0], nz = w.normal[1];
        const arc: [number, number, number][] = [];
        for (let k = 0; k <= 24; k++) {
          const a = (k / 24) * (Math.PI / 2);
          arc.push([hx + (closedDir[0] * Math.cos(a) + nx * Math.sin(a)) * r, 0.006, hz + (closedDir[1] * Math.cos(a) + nz * Math.sin(a)) * r]);
        }
        const lx = hx + nx * (r / 2) + closedDir[0] * 0.02, lz = hz + nz * (r / 2) + closedDir[1] * 0.02;
        return (
          <group key={o.id}>
            {/* The open leaf only while its wall stands: with the wall cut away it would be a confusing fin */}
            {!cut[o.wall] && <mesh geometry={BOX} material={leaf} position={[lx, DOOR_H / 2, lz]} scale={[Math.abs(nx) * r + Math.abs(nz) * 0.04, DOOR_H - 0.01, Math.abs(nz) * r + Math.abs(nx) * 0.04]} castShadow />}
            <Line points={arc} color="#8b8478" lineWidth={1} dashed dashSize={0.05} gapSize={0.035} />
          </group>
        );
      })}
    </>
  );
}

export function RoomMesh({ room, mode, passages = [], centre = [0, 0], handlers, highlight }: {
  room: Room; mode: ViewMode;
  /** Doorways cut by a neighbouring room's door. */
  passages?: Opening[];
  /** Where this room's centre is in the world (it differs from the origin on the house plan). */
  centre?: [number, number];
  handlers?: FloorHandlers;
  highlight?: boolean;
}) {
  const { pieces, glass, sills } = useMemo(() => wallPieces(room, passages), [room, passages]);
  const ws = useMemo(() => walls(room), [room]);
  const wallMat = useMemo(() => new THREE.MeshStandardMaterial({ color: room.wallColor, roughness: 0.92 }), [room.wallColor]);
  const lowMat = useMemo(() => new THREE.MeshStandardMaterial({ color: room.wallColor, roughness: 0.92 }), [room.wallColor]);
  const glassMat = useMemo(() => new THREE.MeshPhysicalMaterial({ color: "#cfe3ee", transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0, depthWrite: false }), []);
  const sillMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.5 }), []);

  // Which walls face the camera (3D only): those drop to a skirting so you can see in
  const [cut, setCut] = useState<boolean[]>([]);
  const cam = useRef(new THREE.Vector3());
  useFrame(({ camera }) => {
    if (mode === "plan") { if (cut.some(Boolean)) setCut([]); return; }
    cam.current.set(camera.position.x - centre[0], 0, camera.position.z - centre[1]).normalize();
    const next = ws.map((w) => w.normal[0] * -cam.current.x + w.normal[1] * -cam.current.z > 0.25);
    if (next.length !== cut.length || next.some((v, i) => v !== cut[i])) setCut(next);
  });

  const SKIRT = 0.12;
  return (
    <group>
      <FloorMesh room={room} handlers={handlers} />
      {highlight && <Line points={outline(room).concat([outline(room)[0]]).map(([x, z]) => { const [wx, wz] = toWorld(room, x, z); return [wx, 0.012, wz] as [number, number, number]; })} color="#2f6bff" lineWidth={2.5} />}
      {pieces.map((p, k) => {
        const low = cut[p.wall];
        if (low && p.y0 > SKIRT) return null;
        const y1 = low ? Math.min(p.y1, SKIRT) : p.y1;
        return <mesh key={k} geometry={BOX} material={low ? lowMat : wallMat} position={[p.x, (p.y0 + y1) / 2, p.z]} scale={[p.sx, y1 - p.y0, p.sz]} castShadow={!low} receiveShadow />;
      })}
      {glass.map((p, k) => !cut[p.wall] && <mesh key={k} geometry={BOX} material={glassMat} position={[p.x, (p.y0 + p.y1) / 2, p.z]} scale={[p.sx, p.y1 - p.y0, p.sz]} renderOrder={5} />)}
      {sills.map((p, k) => !cut[p.wall] && <mesh key={k} geometry={BOX} material={sillMat} position={[p.x, (p.y0 + p.y1) / 2, p.z]} scale={[p.sx, p.y1 - p.y0, p.sz]} castShadow />)}
      <Doors room={room} cut={cut} />
    </group>
  );
}
