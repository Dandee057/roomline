import { useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { CATEGORY_LABELS, product, products, type Category, type Product } from "../model/catalogue.ts";
import { useCatalogue } from "../admin/catalogueStore.ts";
import { CatalogueEditor, IS_ADMIN } from "../admin/CatalogueEditor.tsx";
import { useProductImage } from "../scene/Thumbnails.tsx";
import { check } from "../model/fit.ts";
import { dimsOf, encodePlan, type Item } from "../model/plan.ts";
import { DOOR, FLOORS, WINDOW, floorArea, walls, type Floor, type Room } from "../model/room.ts";
import { BAY_WIDTHS, CASTOR_MAX_HEIGHT, DEPTHS, FRAMES, HEIGHTS, MAX_BAYS, MIN_BAYS, SHELVES, type FrameFinish, type ShelfMaterial } from "../shelving/config.ts";
import { formatRand } from "../shelving/quote.ts";
import { currentRoom, roomItems, useStore, type PanelTab } from "../store.ts";
import { connections, overlappingRooms } from "../model/house.ts";
import { Field, NumberInput, Segmented, Stepper } from "./controls.tsx";
import { toast } from "./toast.ts";

const WALL_COLORS = ["#f2efe9", "#e7e1d6", "#dfe5e1", "#e3e6ec", "#efe3dc", "#d9d3c7"];

export function Panel() {
  const room = useStore(currentRoom);
  const items = useStore(useShallow(roomItems));
  const selected = useStore((s) => s.selected);
  const sel = items.find((i) => i.id === selected) ?? null;
  const tab = useStore((s) => s.tab);
  return (
    <aside className="panel" aria-label="Rooms, furniture and fit">
      <RoomTabs />
      <PanelTabs />
      {(tab === "furniture" || tab === "room") && <FitReport room={room} items={items} />}
      {tab === "furniture" && (sel ? <ItemCard room={room} it={sel} items={items} /> : <Catalogue />)}
      {tab === "furniture" && <Basket items={items} />}
      {tab === "room" && <RoomEditor room={room} />}
      {tab === "house" && <HouseCard />}
      {tab === "catalogue" && IS_ADMIN && <CatalogueEditor />}
      <footer className="panel-foot">
        <button type="button" className="btn primary" onClick={share}>Copy share link</button>
        <button type="button" className="btn" onClick={() => { useStore.getState().reset(); toast("Back to the example rooms"); }}>Start over</button>
      </footer>
    </aside>
  );
}

async function share(): Promise<void> {
  const url = location.origin + location.pathname + "#p=" + encodePlan(useStore.getState().plan);
  try { await navigator.clipboard.writeText(url); toast("Link copied. It opens your rooms and furniture exactly as they are."); }
  catch { prompt("Copy this link:", url); }
}

function RoomTabs() {
  // Strings compare by value, so this list only re-renders when a room is added, removed or renamed
  const rooms = useStore(useShallow((s) => s.plan.rooms.map((r) => r.id + "\u0000" + r.name))).map((k) => k.split("\u0000"));
  const active = useStore((s) => s.room);
  const canUndo = useStore((s) => s.past.length > 0), canRedo = useStore((s) => s.future.length > 0);
  const s = useStore.getState();
  return (
    <header className="panel-head">
      <div className="tabs" role="tablist" aria-label="Rooms">
        {rooms.map(([id, name]) => (
          <button key={id} role="tab" aria-selected={id === active} type="button" onClick={() => s.setRoom(id)}>{name}</button>
        ))}
        <button type="button" className="add" onClick={() => s.addRoom()} aria-label="Add a room">+ Room</button>
      </div>
      <div className="history">
        <button type="button" className="icon" onClick={s.undo} disabled={!canUndo} aria-label="Undo" title="Undo (Ctrl+Z)">↶</button>
        <button type="button" className="icon" onClick={s.redo} disabled={!canRedo} aria-label="Redo" title="Redo (Ctrl+Shift+Z)">↷</button>
      </div>
    </header>
  );
}

function PanelTabs() {
  const tab = useStore((s) => s.tab);
  const { setTab, setScope } = useStore.getState();
  const tabs: [PanelTab, string][] = [["furniture", "Furniture"], ["room", "Room size"], ["house", "House"], ...(IS_ADMIN ? [["catalogue", "Catalogue"] as [PanelTab, string]] : [])];
  return (
    <nav className="panel-tabs" role="tablist" aria-label="Panel">
      {tabs.map(([t, label]) => (
        <button key={t} role="tab" type="button" aria-selected={tab === t}
          onClick={() => { setTab(t); setScope(t === "house" ? "house" : "room"); }}>{label}</button>
      ))}
    </nav>
  );
}

function HouseCard() {
  const rooms = useStore((s) => s.plan.rooms);
  const items = useStore((s) => s.plan.items);
  const current = useStore((s) => s.room);
  const s = useStore.getState();
  const conns = useMemo(() => connections(rooms), [rooms]);
  const overlaps = useMemo(() => overlappingRooms(rooms), [rooms]);
  const name = (id: string) => rooms.find((r) => r.id === id)?.name ?? "?";
  const total = rooms.reduce((a, r) => a + floorArea(r), 0);
  return (
    <>
      <section className="section">
        <div className="fit-head"><h2 className="plain">Your house</h2><span>{rooms.length} rooms · {total.toFixed(1)} m²</span></div>
        <p className="hint">Drag a room's floor to move it. Rooms snap together wall to wall. A door on a shared wall becomes a doorway into the next room, so you can see how the house flows.</p>
        {overlaps.length > 0 && (
          <ul className="issues">{overlaps.map(([a, b]) => <li key={a + b} className="error"><span>{name(a)} and {name(b)} overlap. Drag one of them apart.</span></li>)}</ul>
        )}
        <ul className="rooms">
          {rooms.map((r) => {
            const n = items.filter((i) => i.roomId === r.id).length, rep = check(r, items.filter((i) => i.roomId === r.id));
            const bad = rep.issues.filter((i) => i.severity === "error").length, meh = rep.issues.filter((i) => i.severity === "warning").length;
            return (
              <li key={r.id} className={r.id === current ? "on" : undefined}>
                <button type="button" onClick={() => s.setRoom(r.id)}>
                  <b>{r.name}</b>
                  <small>{r.width} × {r.length} cm{r.shape === "L" ? ", L-shaped" : ""} · {n} piece{n === 1 ? "" : "s"}</small>
                </button>
                <span className={"pill " + (bad ? "bad" : meh ? "meh" : "good")}>{bad ? `${bad} won't fit` : meh ? `${meh} squeeze${meh > 1 ? "s" : ""}` : "Fits"}</span>
                <button type="button" className="btn small" onClick={() => { s.setRoom(r.id); s.setTab("furniture"); s.setScope("room"); }}>Open</button>
              </li>
            );
          })}
        </ul>
        <button type="button" className="btn" onClick={() => s.addRoom()}>+ Add a room</button>
      </section>
      <section className="section">
        <h2>How the rooms connect</h2>
        {conns.length ? (
          <ul className="links">{conns.map((c) => <li key={c.passage.id}><b>{name(c.from)}</b><span aria-hidden="true">⇄</span><b>{name(c.to)}</b><small>through a {Math.round(c.passage.width)} cm doorway</small></li>)}</ul>
        ) : (
          <p className="hint">No rooms are connected yet. Put two rooms wall to wall, then add a door on the shared wall in the Room size tab.</p>
        )}
      </section>
    </>
  );
}

function FitReport({ room, items }: { room: Room; items: Item[] }) {
  const report = useMemo(() => check(room, items), [room, items]);
  const select = useStore((s) => s.select);
  const errors = report.issues.filter((i) => i.severity === "error").length, warnings = report.issues.filter((i) => i.severity === "warning").length;
  const verdict = errors ? `${errors} thing${errors > 1 ? "s" : ""} won't fit` : warnings ? "It fits, with a few squeezes" : "Everything fits";
  return (
    <section className={"section fit " + (errors ? "bad" : warnings ? "meh" : "good")} aria-live="polite">
      <div className="fit-head">
        <h2>{verdict}</h2>
        <span>{floorArea(room).toFixed(1)} m² · {report.freePct}% floor free</span>
      </div>
      {report.issues.length > 0 && (
        <ul className="issues">
          {report.issues.map((is, k) => (
            <li key={k} className={is.severity}>
              <button type="button" onClick={() => select(is.items[0])}>{is.message}</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Catalogue() {
  const [cat, setCat] = useState<Category | "all">("all");
  const add = useStore((s) => s.addItem);
  const version = useCatalogue((s) => s.version);
  const all = useMemo(() => products(), [version]); // eslint-disable-line react-hooks/exhaustive-deps
  const cats = useMemo(() => [...new Set(all.map((p) => p.category))], [all]);
  const list = all.filter((p) => cat === "all" || p.category === cat);
  return (
    <section className="section">
      <h2>Add furniture</h2>
      <div className="chips" role="group" aria-label="Category">
        <button type="button" aria-pressed={cat === "all"} onClick={() => setCat("all")}>All</button>
        {cats.map((c) => <button key={c} type="button" aria-pressed={cat === c} onClick={() => setCat(c)}>{CATEGORY_LABELS[c]}</button>)}
      </div>
      <ul className="products">
        {list.map((p) => (
          <li key={p.id}>
            <ProductImage p={p} />
            <div><b>{p.name}</b><small>{p.kind === "shelving" ? "Design it in Shelfline, see it here" : `${p.w} × ${p.d} × ${p.h} cm · ${formatRand(p.price)}`}</small></div>
            <button type="button" className="btn small" onClick={() => { add(p.id); toast(`${p.name} added. Drag it into place.`); }}>Add</button>
          </li>
        ))}
      </ul>
      <p className="hint">These are generic pieces at typical sizes. A retailer's catalogue plugs in here from a product feed with dimensions.</p>
    </section>
  );
}

/** The product's photo, or a picture rendered from its 3D model. */
function ProductImage({ p, big }: { p: Product; big?: boolean }) {
  const src = useProductImage(p);
  const cls = "thumb" + (big ? " big" : "");
  return src ? <img className={cls} src={src} alt="" /> : <i className={cls + " blank"} style={{ background: p.color }} aria-hidden="true" />;
}

function ItemCard({ room, it, items }: { room: Room; it: Item; items: Item[] }) {
  const s = useStore.getState();
  const d = dimsOf(it), p = product(it.productId)!;
  const issues = useMemo(() => check(room, items).issues.filter((i) => i.items.includes(it.id)), [room, items, it.id]);
  return (
    <section className="section item">
      <div className="item-head">
        <ProductImage p={p} big />
        <div className="grow">
          <p className="eyebrow">{CATEGORY_LABELS[p.category]}</p>
          <h2>{d.name}</h2>
          <p className="sub">{d.w} × {d.d} × {Math.round(d.h)} cm · {formatRand(d.price)}</p>
        </div>
        <button type="button" className="icon" aria-label="Close" onClick={() => s.select(null)}>×</button>
      </div>
      <div className="actions">
        <button type="button" className="btn" onClick={() => s.rotate(it.id)} title="R">Rotate</button>
        <button type="button" className="btn" onClick={() => s.duplicate(it.id)} title="Ctrl+D">Duplicate</button>
        <button type="button" className="btn danger" onClick={() => s.remove(it.id)} title="Delete">Remove</button>
      </div>
      {issues.length > 0 && <ul className="issues">{issues.map((is, k) => <li key={k} className={is.severity}><span>{is.message}</span></li>)}</ul>}
      {p.kind === "shelving" && it.shelving && <ShelvingEditor it={it} />}
      <p className="hint">Drag it on the floor; it snaps to walls. Arrow keys nudge 5 cm (Shift: 1 cm), R rotates.</p>
    </section>
  );
}

/** Shelfline's configurator, compact, for the shelving unit in the room. */
function ShelvingEditor({ it }: { it: Item }) {
  const c = it.shelving!;
  const up = (change: Partial<typeof c>) => useStore.getState().updateShelving(it.id, (x) => ({ ...x, ...change }));
  return (
    <div className="shelving">
      <h3>Design the unit</h3>
      <Field label="Bays"><Stepper label="Bays" value={c.bays.length} min={MIN_BAYS} max={MAX_BAYS}
        onChange={(n) => useStore.getState().updateShelving(it.id, (x) => { const bays = x.bays.slice(0, n); while (bays.length < n) bays.push({ ...bays[bays.length - 1] }); return { ...x, bays }; })} /></Field>
      <Field label="Bay width"><Segmented label="Bay width" value={c.bayWidth} onChange={(v) => up({ bayWidth: v })} choices={BAY_WIDTHS.map((w) => ({ value: w, label: `${w}` }))} /></Field>
      <Field label="Height"><Segmented label="Height" wrap value={c.height} onChange={(v) => up({ height: v })} choices={HEIGHTS.map((h) => ({ value: h, label: `${h}` }))} /></Field>
      <Field label="Depth"><Segmented label="Depth" value={c.depth} onChange={(v) => up({ depth: v })} choices={DEPTHS.map((d) => ({ value: d, label: `${d}` }))} /></Field>
      <Field label="Frame"><Segmented label="Frame" wrap value={c.frame} onChange={(v) => up({ frame: v as FrameFinish })} choices={(Object.keys(FRAMES) as FrameFinish[]).map((k) => ({ value: k, label: FRAMES[k].label, swatch: FRAMES[k].color }))} /></Field>
      <Field label="Shelves"><Segmented label="Shelves" wrap value={c.shelf} onChange={(v) => up({ shelf: v as ShelfMaterial })} choices={(Object.keys(SHELVES) as ShelfMaterial[]).map((k) => ({ value: k, label: SHELVES[k].label, swatch: SHELVES[k].color }))} /></Field>
      <Field label="Base"><Segmented label="Base" value={c.base} onChange={(v) => up({ base: v })} choices={[{ value: "feet", label: "Feet" }, { value: "castors", label: "Castors", disabled: c.height > CASTOR_MAX_HEIGHT }]} /></Field>
    </div>
  );
}

function wallLabel(room: Room, i: number): string {
  const w = walls(room)[i];
  const side = w.normal[1] > 0 ? "Top" : w.normal[1] < 0 ? "Bottom" : w.normal[0] > 0 ? "Left" : "Right";
  return `${side} wall, ${Math.round(w.length)} cm`;
}

function RoomEditor({ room }: { room: Room }) {
  const s = useStore.getState();
  const up = (patch: Partial<Room>) => s.updateRoom(patch);
  const num = (v: string) => Number(v); // for the wall picker
  return (
    <section className="section">
      <div className="room-edit">
        <div className="fit-head"><h2 className="plain">{room.name}</h2><span>{floorArea(room).toFixed(1)} m²</span></div>
        <div className="room-grid">
          <p className="hint">Measure wall to wall at floor level. Every check uses these sizes.</p>
          <Field label="Name"><input className="text" value={room.name} maxLength={40} onChange={(e) => up({ name: e.target.value })} /></Field>
          <Field label="Shape"><Segmented label="Shape" value={room.shape} onChange={(v) => up({ shape: v })} choices={[{ value: "rect", label: "Rectangle" }, { value: "L", label: "L-shape" }]} /></Field>
          <div className="pair">
            <Field label="Width (cm)"><NumberInput label="Width" value={room.width} onCommit={(v) => up({ width: v })} /></Field>
            <Field label="Length (cm)"><NumberInput label="Length" value={room.length} onCommit={(v) => up({ length: v })} /></Field>
          </div>
          {room.shape === "L" && (
            <div className="pair">
              <Field label="Cut-out width"><NumberInput label="Cut-out width" value={room.notchW} onCommit={(v) => up({ notchW: v })} /></Field>
              <Field label="Cut-out length"><NumberInput label="Cut-out length" value={room.notchL} onCommit={(v) => up({ notchL: v })} /></Field>
            </div>
          )}
          <Field label="Floor"><Segmented label="Floor" wrap value={room.floor} onChange={(v) => up({ floor: v as Floor })} choices={(Object.keys(FLOORS) as Floor[]).map((f) => ({ value: f, label: FLOORS[f].label, swatch: FLOORS[f].color }))} /></Field>
          <Field label="Walls"><Segmented label="Wall colour" wrap value={room.wallColor} onChange={(v) => up({ wallColor: v })} choices={WALL_COLORS.map((c) => ({ value: c, label: <span className="sr">{c}</span>, swatch: c }))} /></Field>
          <div className="openings">
            <h3>Doors and windows</h3>
            {room.openings.map((o) => (
              <div key={o.id} className="opening">
                <div className="opening-head"><b>{o.kind === "door" ? "Door" : "Window"}</b><button type="button" className="link" onClick={() => s.removeOpening(o.id)}>Remove</button></div>
                <select value={o.wall} onChange={(e) => s.updateOpening(o.id, { wall: num(e.target.value) })} aria-label="Wall">
                  {walls(room).map((_, i) => <option key={i} value={i}>{wallLabel(room, i)}</option>)}
                </select>
                <div className="pair">
                  <Field label="From corner (cm)"><NumberInput label="Distance from the corner" value={o.offset} onCommit={(v) => s.updateOpening(o.id, { offset: v })} /></Field>
                  <Field label="Width (cm)"><NumberInput label={`${o.kind === "door" ? "Door" : "Window"} width, ${o.kind === "door" ? DOOR.min : WINDOW.min} cm or more`} value={o.width} onCommit={(v) => s.updateOpening(o.id, { width: v })} /></Field>
                </div>
                {o.kind === "door" && <Segmented label="Hinge" value={o.hinge ?? "left"} onChange={(v) => s.updateOpening(o.id, { hinge: v })} choices={[{ value: "left", label: "Hinged left" }, { value: "right", label: "Hinged right" }]} />}
              </div>
            ))}
            <div className="actions">
              <button type="button" className="btn" onClick={() => s.addOpening("door")}>+ Door</button>
              <button type="button" className="btn" onClick={() => s.addOpening("window")}>+ Window</button>
            </div>
          </div>
          {useStore.getState().plan.rooms.length > 1 && <button type="button" className="link danger" onClick={() => s.removeRoom(room.id)}>Delete this room</button>}
        </div>
      </div>
    </section>
  );
}

function Basket({ items }: { items: Item[] }) {
  const all = useStore((s) => s.plan.items);
  const roomTotal = items.reduce((t, i) => t + dimsOf(i).price, 0), planTotal = all.reduce((t, i) => t + dimsOf(i).price, 0);
  const select = useStore((s) => s.select);
  return (
    <section className="section">
      <details className="basket">
        <summary><h2>In this room</h2><span>{items.length} piece{items.length === 1 ? "" : "s"} · {formatRand(roomTotal)}</span></summary>
        <ul>
          {items.map((i) => { const d = dimsOf(i); return <li key={i.id}><button type="button" onClick={() => select(i.id)}>{d.name}</button><span>{formatRand(d.price)}</span></li>; })}
        </ul>
        <p className="hint">All rooms: {formatRand(planTotal)}. Prices are illustrative.</p>
      </details>
    </section>
  );
}
