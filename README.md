# Roomline

Plan your rooms to their real measurements, place furniture at its real size in 3D, and see what fits. Roomline checks walkways, door swings and the space wardrobe doors need to open as you go, and it tells you in plain words what won't work.

**[Live demo →](https://dandee057.github.io/roomline/)**

Built with **React 19**, **React Three Fiber**, **drei**, **zustand**, **TypeScript** and **Vite**. It includes the shelving configurator from [Shelfline](https://github.com/Dandee057/shelfline) as one of its products.

<!-- Add a screenshot or GIF, e.g. docs/roomline.gif:
![Roomline](docs/roomline.gif) -->

## What it does

- **Rooms:** rectangular or L-shaped rooms to your own measurements, in a *Room size* tab: width and length, the cut-out of an L, doors (with hinge side), windows, floor and wall colour. The plan view labels every wall with its length.
- **The whole house:** the *House* view lays your rooms out together. Drag a room and it snaps wall to wall with its neighbours; a door on a shared wall opens a doorway into the next room, so you can walk through the house in 3D and see how it flows. The panel lists every connection and flags rooms that overlap.
- **Furniture:** sofas, armchairs, tables, chairs, beds, bedside tables, wardrobes, desks, rugs, and a shelving unit you design with Shelfline's configurator.
- **Placing:** drag pieces across the floor. They snap flush to walls and to a 5 cm grid. Arrow keys nudge by 5 cm (Shift: 1 cm), R rotates, Ctrl+D duplicates, Delete removes. New pieces land in the first free spot.
- **Does it fit?** A live report with plain-language reasons. Click any line to select the piece it's about:
  - **Won't fit:** goes through a wall, overlaps another piece, or blocks a door from opening.
  - **Squeezes:** a walkway under 60 cm (75 cm is comfortable), or not enough room in front of a wardrobe, desk or TV unit to use it.
  - **Tips:** a coffee table too close or too far from the sofa (40–50 cm is ideal), or a tall piece blocking a window.
- **Measurements:** the selected piece shows its footprint and its distance to every wall.
- **Views:** a plan view from above, and a 3D view with dollhouse cutaway walls, for one room or the whole house.
- **Pictures:** every product shows a photo, or a picture rendered from its 3D model.
- **Share and keep:** the whole plan is in the link, so *Copy share link* sends someone your exact rooms. It's also kept in the browser, with full undo and redo.

## For a retailer

The catalogue here is generic, at typical South African retail sizes, and the prices are illustrative. The design is meant to take a real catalogue:

- **Every product works on day one.** Placement and every fit check use only width × depth × height. Any product listing with dimensions can appear as a correctly sized piece straight away.
- **Better models can come later.** Each product draws from its dimensions through a simple procedural model. A detailed glTF model can replace it, one bestseller at a time, without changing any rules.
- **It's an embed.** A "See it in my room" button on a product page links to Roomline with `?add=<product id>` (try `?add=sofa3`). The product lands in the shopper's room, selected and ready to drag. Their rooms are remembered, so the second product is one click.
- **A catalogue editor for the back office.** Open Roomline with [`?admin`](https://dandee057.github.io/roomline/?admin) for a *Catalogue* tab: edit a product's name, category, size, price and colour, add new products, give them a photo, or replace the procedural 3D model with a `.glb` file (it's scaled to fit the product's W × D × H, so the fit checks stay exact). Products without a photo get a thumbnail rendered from their 3D model. Hide products from shoppers without breaking rooms that already contain them, and export or import the whole catalogue as one JSON file with its photos and models inside.
- **The rules are data.** Walkway widths, clearances and neighbour pairs (a bed and bedside table belong close together) live in [`src/model/fit.ts`](src/model/fit.ts) and [`src/model/catalogue.ts`](src/model/catalogue.ts).

## How it works

**Plan first, 3D second.** Everything is decided on the floor plan in centimetres. Furniture turns in quarter turns, so every footprint is an axis-aligned rectangle, and so is every wall, even in L-shaped rooms. That keeps the fit checks exact, fast and testable. The 3D scene just draws the plan. ([`src/model/`](src/model/))

**A fit engine you can read.** `check(room, items)` returns issues by severity, each with a plain-language message and the pieces involved:

- the door swing zone is the square the door sweeps into the room;
- walkways use the clear gap between pieces that sit side by side;
- the space in front of a piece is probed in its facing direction until it meets a wall or another piece.

Unit tests cover each rule. ([`src/model/fit.ts`](src/model/fit.ts), [`tests/fit.test.ts`](tests/fit.test.ts))

**Walls with real openings.** Each wall is split into boxes around its doors and windows. The walls stand outside the floor outline, so the floor's inner size is exactly what you measured. Corners are filled only where they're convex, so the inner corner of an L doesn't poke into the room. In 3D, walls facing the camera drop to a skirting, dollhouse style. ([`src/scene/Room3D.tsx`](src/scene/Room3D.tsx))

**Dragging on the floor.** Pointer events from React Three Fiber are captured on the piece. Each move intersects the pointer ray with the floor plane, snaps the result to walls and a grid, and updates the store. A whole drag is a single undo step. ([`src/scene/Stage.tsx`](src/scene/Stage.tsx))

**Two cameras.** The plan view is an orthographic camera looking straight down; 3D is a perspective camera. drei's `CameraControls` binds to whichever camera is the default when it mounts, so it's mounted only after the right camera has taken over. Otherwise it keeps steering the old one, which was a real bug while building this.

**Rooms in a house.** Each room has a position in the house, in centimetres. Rooms snap back to back (with a 20 cm gap for both walls) or flush with a neighbour's edge. A door's opening is projected through both walls; where it lands on a neighbour's wall that faces back, that wall gets a matching opening, which is how doorways appear between rooms. All of it is plain geometry with unit tests. ([`src/model/house.ts`](src/model/house.ts), [`tests/house.test.ts`](tests/house.test.ts))

**An editable catalogue.** The built-in products are a base layer; the editor's changes (replacements and new products) sit on top and are saved in `localStorage`, read before the saved plan so rooms with custom products open correctly. Uploaded photos and models are stored in IndexedDB and referenced as `asset:<key>`. Thumbnails are rendered inside the main canvas, a few per frame, into an offscreen render target, so there's no second WebGL context. ([`src/model/catalogue.ts`](src/model/catalogue.ts), [`src/admin/`](src/admin/), [`src/scene/Thumbnails.tsx`](src/scene/Thumbnails.tsx))

> The editor is a demo of the back office, not a real one: changes live in that one browser, there's no sign-in, and a share link with a custom product only shows that piece in the admin's own browser (elsewhere it's left out). In production the products would come from the retailer's product system, and photos and models from its asset store.

**Shelfline inside.** The shelving unit is Shelfline's model, layout and rules, driven by a prop instead of a store. Its size and price come from its own design, and it slides back inside the walls if you make it bigger than the space. ([`src/shelving/`](src/shelving/))

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (Node's built-in test runner)
npm run build      # type-checks, then builds to dist/
```

**Deploying:** in the repository, go to *Settings → Pages* and set *Source* to **GitHub Actions**. Every push to `main` then tests, builds and deploys through [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

## Project structure

```
src/
  App.tsx, main.tsx        layout and keyboard shortcuts
  store.ts                 plan, rooms, selection, drag, undo/redo, link and storage sync
  model/room.ts            room outlines, walls, openings and their limits
  model/catalogue.ts       products, sizes, clearances, which pieces belong together
  model/fit.ts             the fit engine
  model/plan.ts            plan types, the example rooms, share-link encoding
  model/house.ts           rooms in a house: snapping, overlaps, doorways between rooms
  admin/                   the catalogue editor (?admin): storage, uploads, export and import
  scene/Stage.tsx          canvas, cameras, dragging and snapping, measurements
  scene/Room3D.tsx         floor, walls with openings, doors, windows, cutaway
  scene/Furniture.tsx      procedural furniture at true size
  scene/ProductModel.tsx   a product's uploaded .glb, scaled to its size, or the procedural model
  scene/Thumbnails.tsx     product pictures rendered from the 3D models
  shelving/                Shelfline's configurator model and 3D unit
  ui/                      panel, controls, toolbar, toasts
tests/                     unit tests for rooms, the house, plans, fit rules, the catalogue and the shelving
```

## Licence

MIT. See [LICENSE](LICENSE). Roomline is a demo: the products, prices and clearance guidelines are illustrative.
