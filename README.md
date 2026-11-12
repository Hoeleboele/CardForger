# CardForge Studio

A local-first trading card workspace built with React, TypeScript, and Vite.

## Run

```sh
npm install
npm run dev
```

Build with `npm run build` and serve `dist/` from any static host (`npx vite preview` locally). The production build registers a service worker that precaches the whole app — including the designer and PDF engine — so it runs fully offline after the first visit and can be installed as an app. Workspace data lives in this browser's IndexedDB; there is no account or backend.

## Features

- **Template designer** (Konva): text, image, icon, shape, background and frame layers; move, resize and rotate; snap guides, alignment and distribution; grouping, locking, visibility and z-order; opacity and blend modes; zoom and pan; 100-step undo. The canvas preview uses the export renderer, so it matches exported files exactly.
- **Text**: system, uploaded and Google fonts (downloaded once and embedded, so they work offline); size, weight, colour, alignment, letter and line spacing, uppercase, stroke, shadow and glow. Placeholders such as `{Name}`, `{Cost}` and `{Attack}`, plus any custom field (`{Flavor}`), update automatically. Layers can be shown only when a field matches a value, e.g. stats only on Creatures.
- **Images and icons**: PNG, JPG, WEBP and SVG; fill, fit or stretch; crop zoom and pan; rounded or elliptical masks. Icons come from Lucide, Font Awesome and Material Design Icons, or from uploaded SVGs, with colour, scale, rotation, opacity and shadow.
- **Cards**: create, edit, duplicate and delete cards with a live preview; grid and list views; search, filters and sorting; multi-select for bulk duplication (with automatic `#1, #2…` numbering), bulk editing, adding to decks, exporting and deleting. Paging and on-demand rendering keep 10,000+ card projects responsive.
- **CSV import**: columns are mapped to card fields (unknown columns become placeholders); unknown sets are created automatically.
- **Sets, decks and assets**: duplicate a set with all its cards or bulk edit it; build decks with quantities, type and rarity breakdowns and average cost; organise assets by category, folder and tags, and import them by drag and drop.
- **Export** at 300 or 600 DPI:
  - **Card files**: PNG (optionally transparent), JPG or WEBP, named `SetName_CardName.ext`. Multiple cards download as a ZIP.
  - **Print sheets**: A4 PDF or PNG pages, 3 × 3 poker-size (63 × 88 mm) cards, with crop marks, 3 mm bleed and safe-area guides.
  - **Duplex**: fronts, backs or both, with backs mirrored for long-edge printing and a custom back image.
- **Projects**: `.cardforge` backup and restore (templates, cards, sets, decks, assets, fonts and settings); `.cardtemplate` export/import that bundles the template's assets and fonts.
- **Safety**: autosave every 10 seconds, when the tab is hidden, and on Ctrl+S; crash detection with restore of the previous session; a 100-step undo/redo history.

## Keyboard shortcuts

| Keys | Action |
| --- | --- |
| Ctrl+Z / Ctrl+Shift+Z (or Ctrl+Y) | Undo / redo |
| Ctrl+S | Save now |
| Ctrl+K | Search cards |
| N | New card |
| Esc | Close dialog or designer |
| Designer: Ctrl+D, Ctrl+G, Delete | Duplicate, group, delete layers |
| Designer: arrow keys (+Shift) | Nudge 1 px (10 px) |
| Designer: Space or H, + / − / 0 | Pan, zoom, fit |

## CSV format

```csv
Name,Type,Rarity,Cost,Attack,Defense,Description,Artist,Set,Quantity,Flavor
Goblin,Creature,Common,1,1,1,"Small, but loud",A. Painter,Tokens,40,Always hungry
```

Recognised columns: `Name`, `Type`, `Rarity`, `Cost`, `Attack`, `Defense`/`Health`, `Description`, `Artist`, `Set`, `Template`, `Quantity` and `Accent`. Any other column (such as `Flavor` above) becomes a template placeholder.