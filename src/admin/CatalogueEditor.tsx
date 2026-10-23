import { useEffect, useRef, useState } from "react";
import { CATEGORY_LABELS, KINDS, allProducts, isBuiltIn, isHidden, newProductId, product, type Category, type Kind, type Product } from "../model/catalogue.ts";
import { formatRand } from "../shelving/quote.ts";
import { useStore } from "../store.ts";
import { useProductImage } from "../scene/Thumbnails.tsx";
import { Field, NumberInput, Segmented } from "../ui/controls.tsx";
import { toast } from "../ui/toast.ts";
import { useCatalogue } from "./catalogueStore.ts";
import { isAsset } from "./assets.ts";
import { download, exportCatalogue, importCatalogue, storeModel, storePhoto, type ModelInfo } from "./transfer.ts";

/**
 * The back office for the demo: edit or add products, give them a photo, swap the procedural 3D model for a
 * real one. Opened with ?admin. Changes are kept in this browser; a retailer would plug in its product system.
 */
export const IS_ADMIN = typeof location !== "undefined" && new URLSearchParams(location.search).has("admin");

/** After any catalogue change, the plan re-reads sizes and models. */
const refresh = () => useStore.getState().refreshProducts();

/** Products used anywhere in the plan, including its undo history, which must not disappear from under it. */
function inUse(): Set<string> {
  const s = useStore.getState();
  return new Set([s.plan, ...s.past, ...s.future].flatMap((p) => p.items.map((i) => i.productId)));
}

export function CatalogueEditor() {
  useCatalogue((s) => s.version);
  const [editing, setEditing] = useState<{ draft: Product; isNew: boolean } | null>(null);
  const [q, setQ] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const changes = useCatalogue((s) => s.changes);
  const list = allProducts().filter((p) => !q || (p.name + " " + p.id).toLowerCase().includes(q.toLowerCase()));

  if (editing) return <ProductForm key={editing.draft.id} draft={editing.draft} isNew={editing.isNew} done={() => setEditing(null)} />;

  const blank = (): Product => ({ id: "", name: "", category: "decor", kind: "cabinet", w: 60, d: 40, h: 75, price: 0, color: "#b48d67" });
  return (
    <section className="section admin">
      <div className="fit-head"><h2 className="plain">Catalogue editor</h2><span className="pill meh">Admin</span></div>
      <p className="hint">
        Edit sizes, prices and looks, add new products, give them a photo, or replace a product's 3D model with a .glb file.
        Changes are saved <b>in this browser only</b> and aren't protected by a sign-in. In production this list would come from the retailer's product system.
      </p>
      <div className="actions">
        <button type="button" className="btn primary" onClick={() => setEditing({ draft: blank(), isNew: true })}>+ New product</button>
        <button type="button" className="btn" onClick={async () => download(await exportCatalogue(changes), "roomline-catalogue.json")}>Export</button>
        <button type="button" className="btn" onClick={() => file.current?.click()}>Import</button>
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={async (e) => {
          const f = e.target.files?.[0]; e.target.value = "";
          if (!f) return;
          try { useCatalogue.getState().replace(await importCatalogue(f), inUse()); refresh(); toast("Catalogue imported."); }
          catch (err) { toast(err instanceof Error ? err.message : "Couldn't read that file."); }
        }} />
      </div>
      <input className="text search" type="search" placeholder="Find a product" aria-label="Find a product" value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="products admin-list">
        {list.map((p) => <AdminRow key={p.id} p={p} edit={() => setEditing({ draft: { ...p }, isNew: false })} />)}
      </ul>
      {(Object.keys(changes.products).length > 0 || changes.hidden.length > 0) && (
        <button type="button" className="link danger" onClick={() => {
          if (!confirm("Undo every catalogue change, including new products, photos and models?")) return;
          useCatalogue.getState().resetAll(inUse()); refresh(); toast("Catalogue back to the original products.");
        }}>Reset the whole catalogue</button>
      )}
    </section>
  );
}

function Thumb({ p, big }: { p: Product; big?: boolean }) {
  const src = useProductImage(p);
  return src
    ? <img className={big ? "thumb big" : "thumb"} src={src} alt="" />
    : <i className={big ? "thumb big blank" : "thumb blank"} style={{ background: p.color }} aria-hidden="true" />;
}

function AdminRow({ p, edit }: { p: Product; edit: () => void }) {
  const changed = useCatalogue((s) => !!s.changes.products[p.id]);
  const tags = [!isBuiltIn(p.id) ? "New" : changed ? "Edited" : null, p.model ? "3D model" : null, isHidden(p.id) ? "Hidden" : null].filter(Boolean);
  return (
    <li className={isHidden(p.id) ? "off" : undefined}>
      <Thumb p={p} />
      <div>
        <b>{p.name}</b>
        <small>{p.kind === "shelving" ? "Sized by its Shelfline design" : `${p.w} × ${p.d} × ${p.h} cm · ${formatRand(p.price)}`}</small>
        {tags.length > 0 && <span className="tags">{tags.map((t) => <em key={t}>{t}</em>)}</span>}
      </div>
      <button type="button" className="btn small" onClick={edit}>Edit</button>
    </li>
  );
}

function ProductForm({ draft: start, isNew, done }: { draft: Product; isNew: boolean; done: () => void }) {
  const [p, setP] = useState<Product>(start);
  const [model, setModel] = useState<ModelInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null), modelInput = useRef<HTMLInputElement>(null);
  const up = (patch: Partial<Product>) => setP((x) => ({ ...x, ...patch }));
  const cat = useCatalogue.getState();
  const inPlan = useStore((s) => s.plan.items.filter((i) => i.productId === start.id).length);
  useStore((s) => s.past.length); // re-check whether it's still in the undo history
  const used = !isNew && inUse().has(start.id);
  const edited = useCatalogue((s) => !!s.changes.products[start.id]);
  const shelving = p.kind === "shelving";
  // The thumbnail renderer draws the draft too, so the picture follows the form before it's saved
  useEffect(() => { useCatalogue.getState().setPreview(p); }, [p]);
  useEffect(() => () => useCatalogue.getState().setPreview(null), []);

  const save = (andPlace = false) => {
    if (!p.name.trim()) { toast("Give the product a name."); return; }
    const id = isNew ? newProductId(p.name, (x) => !!product(x)) : p.id;
    cat.save({ ...p, id });
    refresh();
    if (andPlace) {
      useStore.getState().addItem(id);
      useStore.getState().setTab("furniture");
      toast(`${p.name} placed in the room.`);
    } else toast(isNew ? `${p.name} added to the catalogue.` : `${p.name} saved.`);
    done();
  };

  const upload = async (kind: "photo" | "model", f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    try {
      if (kind === "photo") up({ photo: await storePhoto(f) });
      else { const info = await storeModel(f); setModel(info); up({ model: info.ref }); toast(`Model loaded: ${info.triangles.toLocaleString()} triangles.`); }
    } catch (err) { toast(err instanceof Error ? err.message : "Couldn't read that file."); }
    finally { setBusy(false); }
  };

  const turned = p.modelRot === 90 || p.modelRot === 270;
  const modelSize = model && (turned ? { w: model.size.d, d: model.size.w, h: model.size.h } : model.size);

  return (
    <section className="section admin">
      <div className="item-head">
        <div>
          <p className="eyebrow">{isNew ? "New product" : `Product id: ${p.id}`}</p>
          <h2>{p.name || "Untitled product"}</h2>
          <p className="sub">{shelving ? "Size and price come from its Shelfline design" : `${p.w} × ${p.d} × ${p.h} cm · ${formatRand(p.price)}`}</p>
        </div>
        <button type="button" className="icon" aria-label="Close without saving" onClick={done}>×</button>
      </div>

      <div className="media">
        <Thumb p={p} big />
        <div className="media-actions">
          <h3>Photo</h3>
          <div className="actions">
            <button type="button" className="btn small" disabled={busy} onClick={() => photoInput.current?.click()}>Upload photo</button>
            {p.photo && <button type="button" className="link" onClick={() => up({ photo: undefined })}>Remove</button>}
          </div>
          <input ref={photoInput} type="file" accept="image/*" hidden onChange={(e) => { void upload("photo", e.target.files?.[0]); e.target.value = ""; }} />
          <input className="text" placeholder="…or paste an image address" aria-label="Photo address"
            value={p.photo && !isAsset(p.photo) ? p.photo : ""} onChange={(e) => up({ photo: e.target.value || undefined })} />
          <small className="hint">{p.photo ? "The photo shows in the catalogue." : "No photo: the catalogue shows a picture rendered from the 3D model."}</small>
        </div>
      </div>

      {!shelving && (
        <div className="model-box">
          <h3>3D model</h3>
          <p className="hint">{p.model ? "Uses an uploaded model, scaled to fit inside the size below so every fit check stays exact." : `Uses the built-in ${KINDS[p.kind].toLowerCase()} model, drawn to the size below.`}</p>
          <div className="actions">
            <button type="button" className="btn small" disabled={busy} onClick={() => modelInput.current?.click()}>{p.model ? "Replace .glb" : "Upload .glb"}</button>
            {p.model && <button type="button" className="link" onClick={() => { up({ model: undefined, modelRot: undefined }); setModel(null); }}>Use the built-in model</button>}
          </div>
          <input ref={modelInput} type="file" accept=".glb,model/gltf-binary" hidden onChange={(e) => { void upload("model", e.target.files?.[0]); e.target.value = ""; }} />
          {p.model && (
            <Field label="Turn the model" hint="so its front faces you in the picture">
              <Segmented label="Turn the model" value={p.modelRot ?? 0} onChange={(v) => up({ modelRot: v === 0 ? undefined : v })}
                choices={([0, 90, 180, 270] as const).map((r) => ({ value: r, label: `${r}°` }))} />
            </Field>
          )}
          {modelSize && (
            <div className="measured">
              <span>The model measures {modelSize.w} × {modelSize.d} × {modelSize.h} cm</span>
              <button type="button" className="link" onClick={() => up({ w: Math.max(1, modelSize.w), d: Math.max(1, modelSize.d), h: Math.max(1, modelSize.h) })}>Use this size</button>
            </div>
          )}
        </div>
      )}

      <div className="room-grid">
        <Field label="Name"><input className="text" value={p.name} maxLength={60} onChange={(e) => up({ name: e.target.value })} /></Field>
        <div className="pair">
          <Field label="Category">
            <select value={p.category} onChange={(e) => up({ category: e.target.value as Category })} aria-label="Category">
              {(Object.keys(CATEGORY_LABELS) as Category[]).map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
            </select>
          </Field>
          <Field label="Built-in model">
            <select value={p.kind} onChange={(e) => up({ kind: e.target.value as Kind })} aria-label="Built-in model" disabled={!isNew && start.kind === "shelving"}>
              {(Object.keys(KINDS) as Kind[]).filter((k) => k !== "shelving" || start.kind === "shelving").map((k) => <option key={k} value={k}>{KINDS[k]}</option>)}
            </select>
          </Field>
        </div>
        {!shelving && (
          <div className="triple">
            <Field label="Width"><NumberInput label="Width in cm" value={p.w} onCommit={(v) => up({ w: Math.max(1, Math.min(1000, v)) })} /></Field>
            <Field label="Depth"><NumberInput label="Depth in cm" value={p.d} onCommit={(v) => up({ d: Math.max(1, Math.min(1000, v)) })} /></Field>
            <Field label="Height"><NumberInput label="Height in cm" value={p.h} onCommit={(v) => up({ h: Math.max(1, Math.min(1000, v)) })} /></Field>
          </div>
        )}
        <div className="pair">
          {!shelving && <Field label="Price (R)"><NumberInput label="Price in rand" value={p.price} onCommit={(v) => up({ price: v })} /></Field>}
          <Field label="Space in front (cm)" hint="doors, drawers">
            <NumberInput label="Space needed in front, in cm" value={p.front ?? 0} onCommit={(v) => up({ front: v > 0 ? Math.min(300, v) : undefined })} />
          </Field>
        </div>
        <Field label="Colour">
          <div className="color-row">
            <input type="color" value={p.color} onChange={(e) => up({ color: e.target.value })} aria-label="Colour" />
            <code>{p.color}</code>
            {p.model && <small className="hint">Used for the built-in model and the placeholder while the .glb loads.</small>}
          </div>
        </Field>
      </div>

      <div className="actions">
        <button type="button" className="btn primary" disabled={busy} onClick={() => save()}>{isNew ? "Add to catalogue" : "Save"}</button>
        <button type="button" className="btn" disabled={busy} onClick={() => save(true)}>{isNew ? "Add and place in room" : "Save and place in room"}</button>
        <button type="button" className="btn" onClick={done}>Cancel</button>
      </div>

      {!isNew && (
        <div className="danger-zone">
          {isBuiltIn(p.id) && edited && (
            <button type="button" className="link" onClick={() => { cat.reset(p.id); refresh(); toast(`${start.name} is back to the original.`); done(); }}>Reset to the original product</button>
          )}
          <button type="button" className="link" onClick={() => { cat.setHidden(p.id, !isHidden(p.id)); toast(isHidden(p.id) ? "Hidden from shoppers. Rooms that already have it keep it." : "Back in the catalogue."); done(); }}>
            {isHidden(p.id) ? "Show in the catalogue again" : "Hide from the catalogue"}
          </button>
          {!isBuiltIn(p.id) && (
            used
              ? <small className="hint">{inPlan ? `It's in your rooms (${inPlan}×)` : "It's in your undo history"}, so it can be hidden but not deleted.</small>
              : <button type="button" className="link danger" onClick={() => { if (confirm(`Delete ${start.name}?`)) { cat.remove(p.id); refresh(); toast("Deleted."); done(); } }}>Delete product</button>
          )}
        </div>
      )}
    </section>
  );
}
