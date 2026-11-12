import { useMemo, useRef, useState } from "react";
import { FolderOpen, ImagePlus, Search, Tag, Trash2, Upload, X } from "lucide-react";
import { assetCategories, uid, type Asset } from "../model";
import { readFileAsDataUrl } from "../fonts";
import { useWorkspace } from "../store";

const ACCEPT = "image/png,image/jpeg,image/webp,image/svg+xml";
const MAX_BYTES = 25 * 1024 * 1024;

export function AssetsView({ notify }: { notify: (message: string) => void }) {
  const { assets, templates, cards, update } = useWorkspace();
  const [category, setCategory] = useState<string>("All");
  const [folder, setFolder] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const folders = useMemo(() => [...new Set(assets.map((asset) => asset.folder?.trim()).filter(Boolean) as string[])].sort(), [assets]);
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return assets.filter((asset) => {
      if (category !== "All" && asset.category !== category) return false;
      if (folder !== "all" && (asset.folder ?? "") !== folder) return false;
      if (!query) return true;
      return `${asset.name} ${asset.folder ?? ""} ${(asset.tags ?? []).join(" ")}`.toLowerCase().includes(query);
    });
  }, [assets, category, folder, search]);
  const selected = assets.find((asset) => asset.id === selectedId);
  const usage = useMemo(() => {
    if (!selected) return { templates: 0, cards: 0 };
    return {
      templates: templates.filter((template) => template.layers.some((layer) => layer.assetId === selected.id || layer.imageData === selected.data)).length,
      cards: cards.filter((card) => card.artwork === selected.data).length,
    };
  }, [selected, templates, cards]);

  const importFiles = async (files: FileList | File[]) => {
    const accepted = [...files].filter((file) => /^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type) && file.size <= MAX_BYTES);
    const skipped = files.length - accepted.length;
    if (!accepted.length) {
      notify("Only PNG, JPG, WEBP or SVG images up to 25 MB can be imported");
      return;
    }
    const target = category === "All" ? undefined : category;
    const additions: Asset[] = await Promise.all(
      accepted.map(async (file) => ({
        id: uid("asset"),
        name: file.name,
        category: target ?? (file.type === "image/svg+xml" ? "Icons" : "Artwork"),
        data: await readFileAsDataUrl(file),
        size: file.size,
        tags: [],
        folder: folder === "all" ? "" : folder,
      })),
    );
    update((project) => ({ ...project, assets: [...additions, ...project.assets] }));
    notify(`${additions.length} asset${additions.length === 1 ? "" : "s"} imported${skipped ? ` · ${skipped} skipped` : ""}`);
    if (additions.length === 1) setSelectedId(additions[0].id);
  };

  const patchAsset = (id: string, patch: Partial<Asset>) =>
    update((project) => ({ ...project, assets: project.assets.map((asset) => (asset.id === id ? { ...asset, ...patch } : asset)) }));

  const deleteAsset = (asset: Asset) => {
    const inUse = usage.templates + usage.cards;
    if (inUse && !window.confirm(`“${asset.name}” is used by ${usage.templates} template(s) and ${usage.cards} card(s). Delete it anyway?`)) return;
    update((project) => ({
      ...project,
      assets: project.assets.filter((item) => item.id !== asset.id),
      templates: project.templates.map((template) => ({
        ...template,
        layers: template.layers.map((layer) => (layer.assetId === asset.id ? { ...layer, assetId: undefined } : layer)),
      })),
    }));
    setSelectedId(null);
    notify("Asset deleted");
  };

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow"><span className="eyebrow-line" /> STUDIO LIBRARY</div>
          <h1>Assets</h1>
          <p className="page-subtitle">Artwork, frames, icons and symbols — stored on this device and reusable in any template.</p>
        </div>
        <div className="heading-actions">
          <button className="button primary" onClick={() => input.current?.click()}><Upload size={15} /> Import assets</button>
          <input
            ref={input}
            type="file"
            accept={ACCEPT}
            multiple
            hidden
            onChange={(event) => {
              if (event.target.files) void importFiles(event.target.files);
              event.target.value = "";
            }}
          />
        </div>
      </div>

      <div className="asset-toolbar">
        <div className="asset-categories">
          {["All", ...assetCategories].map((item) => (
            <button key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>
              {item === "All" ? "All assets" : item}
              <span>{item === "All" ? assets.length : assets.filter((asset) => asset.category === item).length}</span>
            </button>
          ))}
        </div>
        <div className="asset-filters">
          <label className="folder-filter">
            <FolderOpen size={14} />
            <select value={folder} onChange={(event) => setFolder(event.target.value)} aria-label="Folder">
              <option value="all">All folders</option>
              <option value="">Unfiled</option>
              {folders.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <div className="search-box asset-search">
            <Search size={15} />
            <input placeholder="Search names and tags…" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
        </div>
      </div>

      <div
        className={`asset-workspace ${dragging ? "is-dragging" : ""} ${selected ? "has-details" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void importFiles(event.dataTransfer.files);
        }}
      >
        {visible.length ? (
          <div className="asset-grid">
            {visible.map((asset) => (
              <button
                key={asset.id}
                className={`asset-item ${selectedId === asset.id ? "active" : ""}`}
                onClick={() => setSelectedId(asset.id)}
              >
                <img src={asset.data} alt={asset.name} loading="lazy" />
                <span>{asset.name}</span>
                <small>{asset.category}{asset.folder ? ` · ${asset.folder}` : ""}</small>
              </button>
            ))}
          </div>
        ) : (
          <div className="asset-empty">
            <div className="asset-empty-icon"><ImagePlus size={22} /></div>
            <h3>{assets.length ? "No matching assets" : "Your library is a blank canvas."}</h3>
            <p>{assets.length ? "Try another category, folder or search." : "Drop PNG, JPG, WEBP or SVG files here, or import them."}</p>
            <button className="button secondary" onClick={() => input.current?.click()}><Upload size={15} /> Choose files</button>
          </div>
        )}

        {selected && (
          <aside className="asset-details">
            <div className="asset-details-head">
              <strong>Asset details</strong>
              <button className="tiny-menu" title="Close details" onClick={() => setSelectedId(null)}><X size={14} /></button>
            </div>
            <div className="asset-details-preview"><img src={selected.data} alt={selected.name} /></div>
            <label className="field-label">Name<input value={selected.name} onChange={(event) => patchAsset(selected.id, { name: event.target.value })} /></label>
            <label className="field-label">
              Category
              <select value={selected.category} onChange={(event) => patchAsset(selected.id, { category: event.target.value })}>
                {assetCategories.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label className="field-label">
              <span><FolderOpen size={11} /> Folder</span>
              <input list="asset-folders" placeholder="e.g. Core Set / Creatures" value={selected.folder ?? ""} onChange={(event) => patchAsset(selected.id, { folder: event.target.value })} />
              <datalist id="asset-folders">{folders.map((item) => <option key={item} value={item} />)}</datalist>
            </label>
            <label className="field-label">
              <span><Tag size={11} /> Tags (comma separated)</span>
              <input
                defaultValue={(selected.tags ?? []).join(", ")}
                key={selected.id}
                placeholder="fire, dragon, legendary"
                onBlur={(event) =>
                  patchAsset(selected.id, {
                    tags: event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean),
                  })
                }
              />
            </label>
            {!!selected.tags?.length && <div className="tag-list">{selected.tags.map((tag) => <button key={tag} onClick={() => setSearch(tag)}>#{tag}</button>)}</div>}
            <p className="asset-meta">
              {(selected.size / 1024).toFixed(0)} KB · used by {usage.templates} template{usage.templates === 1 ? "" : "s"} and {usage.cards} card{usage.cards === 1 ? "" : "s"}
            </p>
            <button className="button danger" onClick={() => deleteAsset(selected)}><Trash2 size={14} /> Delete asset</button>
          </aside>
        )}
      </div>
    </>
  );
}
