import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { CameraControls, CameraControlsImpl, ContactShadows, Edges, Environment, Lightformer, Line, OrthographicCamera, PerspectiveCamera } from "@react-three/drei";

const { ACTION } = CameraControlsImpl;
import { useShallow } from "zustand/react/shallow";
import { product } from "../model/catalogue.ts";
import { check, footprint, wallDistances, type Severity } from "../model/fit.ts";
import { dimsOf, type Item } from "../model/plan.ts";
import { walls, type Room } from "../model/room.ts";
import { connections, houseBounds, snapRoom } from "../model/house.ts";
import { currentRoom, roomItems, useStore } from "../store.ts";
import { ProductModel } from "./ProductModel.tsx";
import { Thumbnails } from "./Thumbnails.tsx";
import { RoomMesh, T, toWorld } from "./Room3D.tsx";

const STATUS: Record<Severity | "ok" | "selected", string> = { error: "#e5484d", warning: "#f2a03d", tip: "#3e9bdc", ok: "#9aa3ad", selected: "#2f6bff" };
const SNAP_GRID = 5, SNAP_WALL = 12; // cm

/** A text label drawn on a canvas and shown as a sprite: always faces the camera, constant size on screen. */
function Label({ text, position, color = "#1f2937", bg = "rgba(255,255,255,0.92)" }: { text: string; position: [number, number, number]; color?: string; bg?: string }) {
  const { texture, aspect } = useMemo(() => {
    const k = 3, font = 12 * k, pad = 5 * k, c = document.createElement("canvas"), g = c.getContext("2d")!;
    g.font = `600 ${font}px Inter, system-ui, sans-serif`;
    c.width = Math.ceil(g.measureText(text).width + pad * 2); c.height = font + pad * 1.3;
    g.font = `600 ${font}px Inter, system-ui, sans-serif`;
    g.fillStyle = bg; g.beginPath(); g.roundRect(0, 0, c.width, c.height, 4 * k); g.fill();
    g.fillStyle = color; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, c.width / 2, c.height / 2 + k);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return { texture: t, aspect: c.width / c.height };
  }, [text, color, bg]);
  useEffect(() => () => texture.dispose(), [texture]);
  // A fraction of the view's height. In perspective, sizeAttenuation=false does that; in the orthographic plan view
  // sprites are sized in world units, so scale by how much of the world the view shows at this zoom.
  const h = 0.026, ref = useRef<THREE.Sprite>(null!);
  useFrame(({ camera }) => {
    const k = (camera as THREE.OrthographicCamera).isOrthographicCamera ? h * ((camera as THREE.OrthographicCamera).top - (camera as THREE.OrthographicCamera).bottom) / (camera as THREE.OrthographicCamera).zoom : h;
    ref.current.scale.set(k * aspect, k, 1);
  });
  return (
    <sprite ref={ref} position={position} scale={[h * aspect, h, 1]} renderOrder={20}>
      <spriteMaterial map={texture} sizeAttenuation={false} depthTest={false} transparent toneMapped={false} />
    </sprite>
  );
}

const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

/** Snaps a centre so the footprint sits on a 5 cm grid, and flush against any wall it's within 12 cm of. */
function snapPosition(room: Room, it: Item, x: number, z: number): [number, number] {
  let nx = Math.round(x / SNAP_GRID) * SNAP_GRID, nz = Math.round(z / SNAP_GRID) * SNAP_GRID;
  const r = footprint({ ...it, x: nx, z: nz }), hw = (r.x1 - r.x0) / 2, hd = (r.z1 - r.z0) / 2;
  for (const w of walls(room)) {
    if (w.a[0] === w.b[0]) { // vertical wall
      const wx = w.a[0], lo = Math.min(w.a[1], w.b[1]), hi = Math.max(w.a[1], w.b[1]);
      if (Math.min(hi, r.z1) - Math.max(lo, r.z0) <= 0) continue;
      if (w.normal[0] > 0 && Math.abs(r.x0 - wx) < SNAP_WALL) nx = wx + hw;
      if (w.normal[0] < 0 && Math.abs(r.x1 - wx) < SNAP_WALL) nx = wx - hw;
    } else {
      const wz = w.a[1], lo = Math.min(w.a[0], w.b[0]), hi = Math.max(w.a[0], w.b[0]);
      if (Math.min(hi, r.x1) - Math.max(lo, r.x0) <= 0) continue;
      if (w.normal[1] > 0 && Math.abs(r.z0 - wz) < SNAP_WALL) nz = wz + hd;
      if (w.normal[1] < 0 && Math.abs(r.z1 - wz) < SNAP_WALL) nz = wz - hd;
    }
  }
  return [nx, nz];
}

/** One piece of furniture. In the house view it isn't draggable: clicking it just picks its room. */
function Piece({ room, it, status, interactive = true }: { room: Room; it: Item; status: Severity | undefined; interactive?: boolean }) {
  const selected = useStore((s) => s.selected === it.id);
  const mode = useStore((s) => s.mode);
  const p = product(it.productId)!, d = dimsOf(it);
  const [wx, wz] = toWorld(room, it.x, it.z);
  const grab = useRef<{ dx: number; dz: number } | null>(null);
  const controls = useThree((s) => s.controls) as unknown as CameraControls | null;

  const toPlan = (e: ThreeEvent<PointerEvent>): [number, number] | null => {
    const hit = e.ray.intersectPlane(floorPlane, new THREE.Vector3());
    return hit ? [hit.x * 100 + room.width / 2, hit.z * 100 + room.length / 2] : null;
  };
  const onDown = (e: ThreeEvent<PointerEvent>) => {
    if (!interactive) return; // let the room's floor handle it
    e.stopPropagation();
    const s = useStore.getState();
    s.select(it.id);
    const pt = toPlan(e);
    if (!pt) return;
    grab.current = { dx: it.x - pt[0], dz: it.z - pt[1] };
    (e.target as Element).setPointerCapture(e.pointerId);
    if (controls) controls.enabled = false;
    s.beginDrag();
  };
  const onMove = (e: ThreeEvent<PointerEvent>) => {
    if (!grab.current) return;
    const pt = toPlan(e);
    if (!pt) return;
    const s = useStore.getState();
    let x = pt[0] + grab.current.dx, z = pt[1] + grab.current.dz;
    if (s.snap) [x, z] = snapPosition(room, it, x, z);
    s.moveItem(it.id, Math.round(x), Math.round(z));
  };
  const onUp = (e: ThreeEvent<PointerEvent>) => {
    if (!grab.current) return;
    grab.current = null;
    (e.target as Element).releasePointerCapture(e.pointerId);
    if (controls) controls.enabled = true;
    useStore.getState().endDrag();
  };

  const color = selected ? STATUS.selected : status ? STATUS[status] : STATUS.ok;
  const showOutline = interactive && (selected || status === "error" || status === "warning" || mode === "plan");
  const W = d.w / 100, D = d.d / 100, H = Math.max(0.02, d.h / 100);
  return (
    <group position={[wx, 0, wz]} rotation-y={(it.rot * Math.PI) / 180}>
      <group onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        onPointerOver={() => { if (interactive) document.body.style.cursor = "grab"; }} onPointerOut={() => (document.body.style.cursor = "")}>
        <ProductModel p={p} dims={d} shelving={it.shelving} />
        {/* An easy-to-grab volume over the whole piece */}
        <mesh position={[0, H / 2, 0]} scale={[W, H, D]}>
          <boxGeometry />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>
      {/* Footprint on the floor: colour says how it fits */}
      {showOutline && (
        <mesh position={[0, 0.004, 0]} rotation-x={-Math.PI / 2} renderOrder={4}>
          <planeGeometry args={[W, D]} />
          <meshBasicMaterial color={color} transparent opacity={selected ? 0.16 : status === "error" ? 0.22 : 0.08} depthWrite={false} />
          <Edges color={color} lineWidth={selected ? 2 : 1.2} />
        </mesh>
      )}
    </group>
  );
}

/** Distance lines from the selected piece to the walls, and its size. */
function Measurements({ room, it }: { room: Room; it: Item }) {
  const r = footprint(it), d = wallDistances(room, r), dims = dimsOf(it);
  const y = 0.02, col = "#2f6bff";
  const P = (x: number, z: number): [number, number, number] => { const [wx, wz] = toWorld(room, x, z); return [wx, y, wz]; };
  const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
  const lines: { a: [number, number, number]; b: [number, number, number]; v: number }[] = [];
  if (d.left !== null && d.left > 0.5) lines.push({ a: P(r.x0, cz), b: P(r.x0 - d.left, cz), v: d.left });
  if (d.right !== null && d.right > 0.5) lines.push({ a: P(r.x1, cz), b: P(r.x1 + d.right, cz), v: d.right });
  if (d.up !== null && d.up > 0.5) lines.push({ a: P(cx, r.z0), b: P(cx, r.z0 - d.up), v: d.up });
  if (d.down !== null && d.down > 0.5) lines.push({ a: P(cx, r.z1), b: P(cx, r.z1 + d.down), v: d.down });
  const turned = it.rot === 90 || it.rot === 270;
  return (
    <group>
      {lines.map((l, k) => (
        <group key={k}>
          <Line points={[l.a, l.b]} color={col} lineWidth={1.4} dashed dashSize={0.04} gapSize={0.025} />
          <Label text={`${Math.round(l.v)} cm`} position={[(l.a[0] + l.b[0]) / 2, 0.05, (l.a[2] + l.b[2]) / 2]} color="#1d4ed8" />
        </group>
      ))}
      <Label text={`${turned ? dims.d : dims.w} × ${turned ? dims.w : dims.d} cm`} position={[...P(cx, cz).slice(0, 1), dims.h / 100 + 0.12, P(cx, cz)[2]] as [number, number, number]} color="#ffffff" bg="rgba(47,107,255,0.95)" />
    </group>
  );
}

/**
 * Plan view is an orthographic camera looking straight down; 3D is a perspective camera orbiting the room.
 * CameraControls binds to whichever camera is the default when it mounts, so it's only mounted once the right camera
 * has taken over (and remounted per camera), otherwise it would keep steering the previous one.
 */
function Cameras() {
  const mode = useStore((s) => s.mode);
  const camera = useThree((s) => s.camera);
  const ready = (mode === "plan") === (camera.type === "OrthographicCamera");
  return (
    <>
      {mode === "plan"
        ? <OrthographicCamera key="ortho" makeDefault position={[0, 20, 0]} near={0.1} far={60} />
        : <PerspectiveCamera key="persp" makeDefault fov={38} near={0.05} far={80} position={[5, 5, 5]} />}
      {ready && <Controls key={camera.uuid} mode={mode} />}
    </>
  );
}

function Controls({ mode }: { mode: "plan" | "3d" }) {
  const room = useStore(currentRoom);
  const scope = useStore((s) => s.scope);
  const rooms = useStore((s) => s.plan.rooms);
  const dragging = useStore((s) => s.dragging);
  const nonce = useStore((s) => s.frameNonce);
  // What to frame: this room, or the whole house (sized when not mid-drag, so the camera doesn't chase a moving room)
  const frameKey = useRef("");
  if (!dragging) { const b = houseBounds(rooms); frameKey.current = scope === "room" ? `${room.id}|${room.width}|${room.length}` : `house|${b.x1 - b.x0}|${b.z1 - b.z0}`; }
  const ref = useRef<CameraControls>(null!);
  const { size, camera } = useThree();

  // Frame the whole room whenever the room, the view or the window changes
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const b = houseBounds(rooms);
    const W = (scope === "room" ? room.width : b.x1 - b.x0) / 100 + 2 * T, L = (scope === "room" ? room.length : b.z1 - b.z0) / 100 + 2 * T, Hm = room.height / 100;
    if (mode === "plan") {
      void c.setLookAt(0, 20, 0.0001, 0, 0, 0, false);
      void c.zoomTo(Math.min(size.width / (W * 1.2), size.height / (L * 1.2)), false);
    } else {
      const persp = camera as THREE.PerspectiveCamera;
      const r = 0.5 * Math.hypot(W, L, Hm * 0.6);
      const vfov = THREE.MathUtils.degToRad(persp.fov), hfov = 2 * Math.atan(Math.tan(vfov / 2) * (size.width / Math.max(1, size.height)));
      const dist = (r / Math.sin(Math.min(vfov, hfov) / 2)) * 0.95;
      const pos = new THREE.Vector3().setFromSphericalCoords(dist, 0.95, 0.6);
      void c.setLookAt(pos.x, pos.y, pos.z, 0, 0.35, 0, nonce > 0);
    }
  }, [mode, frameKey.current, nonce, size.width, size.height]); // re-frame on these only

  return mode === "plan"
    ? <CameraControls ref={ref} makeDefault azimuthRotateSpeed={0} polarRotateSpeed={0} dollyToCursor minZoom={20} maxZoom={800}
        mouseButtons={{ left: ACTION.TRUCK, middle: ACTION.ZOOM, right: ACTION.TRUCK, wheel: ACTION.ZOOM }}
        touches={{ one: ACTION.TOUCH_TRUCK, two: ACTION.TOUCH_ZOOM_TRUCK, three: ACTION.NONE }} />
    : <CameraControls ref={ref} makeDefault minDistance={1} maxDistance={22} maxPolarAngle={Math.PI / 2 - 0.08} dollyToCursor smoothTime={0.35} />;
}

/** One room on its own: the editable view. */
function RoomScene() {
  const room = useStore(currentRoom);
  const items = useStore(useShallow(roomItems));
  const rooms = useStore((s) => s.plan.rooms);
  const selected = useStore((s) => s.selected);
  const mode = useStore((s) => s.mode);
  const report = useMemo(() => check(room, items), [room, items]);
  const passages = useMemo(() => connections(rooms).filter((c) => c.to === room.id).map((c) => c.passage), [rooms, room.id]);
  const sel = items.find((i) => i.id === selected);
  // Rugs first, so pieces standing on them draw on top
  const ordered = useMemo(() => [...items].sort((a, b) => Number(product(b.productId)?.kind === "rug") - Number(product(a.productId)?.kind === "rug")), [items]);
  return (
    <>
      <RoomMesh room={room} mode={mode} passages={passages} />
      {ordered.map((it) => <Piece key={it.id} room={room} it={it} status={report.byItem.get(it.id)} />)}
      {sel && <Measurements room={room} it={sel} />}
      {mode === "plan" && !sel && <WallLengths room={room} />}
    </>
  );
}

/** Each wall's length, just outside it, in the plan view. */
function WallLengths({ room }: { room: Room }) {
  return (
    <>
      {walls(room).map((w, i) => {
        const mx = (w.a[0] + w.b[0]) / 2 - w.normal[0] * 28, mz = (w.a[1] + w.b[1]) / 2 - w.normal[1] * 28;
        const [x, z] = toWorld(room, mx, mz);
        return <Label key={i} text={`${Math.round(w.length)} cm`} position={[x, 0.05, z]} color="#4b5563" />;
      })}
    </>
  );
}

/** Every room on one plan. Drag a room's floor to move it; it snaps against its neighbours. */
function HouseScene() {
  const rooms = useStore((s) => s.plan.rooms);
  const items = useStore((s) => s.plan.items);
  const current = useStore((s) => s.room);
  const mode = useStore((s) => s.mode);
  const dragging = useStore((s) => s.dragging);
  const controls = useThree((s) => s.controls) as unknown as CameraControls | null;
  // The house is centred on the origin; the centre is frozen during a drag so the world doesn't slide under the pointer
  const centre = useRef<[number, number]>([0, 0]);
  if (!dragging) { const b = houseBounds(rooms); centre.current = [(b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2]; }
  const conns = useMemo(() => connections(rooms), [rooms]);
  const grab = useRef<{ id: string; dx: number; dz: number } | null>(null);

  const toHouse = (e: ThreeEvent<PointerEvent>): [number, number] | null => {
    const hit = e.ray.intersectPlane(floorPlane, new THREE.Vector3());
    return hit ? [hit.x * 100 + centre.current[0], hit.z * 100 + centre.current[1]] : null;
  };
  const handlers = (r: Room) => ({
    onPointerDown: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      const s = useStore.getState(), pt = toHouse(e);
      s.setRoom(r.id);
      if (!pt) return;
      grab.current = { id: r.id, dx: r.x - pt[0], dz: r.z - pt[1] };
      (e.target as Element).setPointerCapture(e.pointerId);
      if (controls) controls.enabled = false;
      s.beginDrag();
    },
    onPointerMove: (e: ThreeEvent<PointerEvent>) => {
      const g = grab.current, pt = toHouse(e);
      if (!g || g.id !== r.id || !pt) return;
      const s = useStore.getState();
      let x = Math.round(pt[0] + g.dx), z = Math.round(pt[1] + g.dz);
      if (s.snap) [x, z] = snapRoom(s.plan.rooms, r.id, x, z);
      s.moveRoom(r.id, x, z);
    },
    onPointerUp: (e: ThreeEvent<PointerEvent>) => {
      if (!grab.current) return;
      grab.current = null;
      (e.target as Element).releasePointerCapture(e.pointerId);
      if (controls) controls.enabled = true;
      useStore.getState().endDrag();
    }
  });

  return (
    <>
      {rooms.map((r) => {
        const cx = (r.x + r.width / 2 - centre.current[0]) / 100, cz = (r.z + r.length / 2 - centre.current[1]) / 100;
        const its = items.filter((i) => i.roomId === r.id);
        const report = check(r, its);
        return (
          <group key={r.id} position={[cx, 0, cz]}>
            <RoomMesh room={r} mode={mode} centre={[cx, cz]} passages={conns.filter((c) => c.to === r.id).map((c) => c.passage)} handlers={handlers(r)} highlight={r.id === current} />
            {its.map((it) => <Piece key={it.id} room={r} it={it} status={report.byItem.get(it.id)} interactive={false} />)}
            <Label text={r.name} position={[0, mode === "plan" ? 0.3 : r.height / 100 + 0.25, 0]} color={r.id === current ? "#ffffff" : "#1f2937"} bg={r.id === current ? "rgba(47,107,255,0.95)" : "rgba(255,255,255,0.92)"} />
          </group>
        );
      })}
    </>
  );
}

export function Stage() {
  const mode = useStore((s) => s.mode);
  const scope = useStore((s) => s.scope);
  return (
    <Canvas shadows={{ type: THREE.PCFShadowMap }} dpr={[1, 2]} gl={{ preserveDrawingBuffer: true, antialias: true }}
      onPointerMissed={(e) => { if (e.type === "click") useStore.getState().select(null); }}>
      <color attach="background" args={["#e9e6e0"]} />
      <ambientLight intensity={0.45} />
      <directionalLight position={[3, 7, 4]} intensity={1.25} castShadow={mode === "3d"} shadow-mapSize={[1024, 1024]} shadow-bias={-0.0004}>
        <orthographicCamera attach="shadow-camera" args={[-10, 10, 10, -10, 0.5, 25]} />
      </directionalLight>
      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={2} position={[0, 5, 0]} rotation-x={Math.PI / 2} scale={[10, 10, 1]} />
        <Lightformer form="rect" intensity={0.8} position={[-6, 2, 3]} rotation-y={Math.PI / 2} scale={[6, 3, 1]} />
        <Lightformer form="rect" intensity={0.6} position={[6, 2, -3]} rotation-y={-Math.PI / 2} scale={[6, 3, 1]} />
      </Environment>
      {scope === "room" ? <RoomScene /> : <HouseScene />}
      {/* Soft contact shadows only in 3D; the plan view doesn't need the extra render pass every frame */}
      {mode === "3d" && <ContactShadows position={[0, -0.001, 0]} opacity={0.35} scale={30} blur={2.5} far={3} resolution={512} color="#3a3328" />}
      <Cameras />
      <Thumbnails />
    </Canvas>
  );
}
