import { useDeferredValue, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  BookOpen,
  Copy,
  Download,
  Ellipsis,
  FileText,
  Grid2X2,
  List,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  SquareCheck,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import type { Card } from "../model";
import { useWorkspace } from "../store";
import { CardArtwork } from "../components/CardArtwork";

const PAGE_SIZE = 60;
const rarityRank: Record<string, number> = { Common: 0, Uncommon: 1, Rare: 2, Legendary: 3 };

type Props = {
  filterSet: string;
  setFilterSet: (value: string) => void;
  searchRef: RefObject<HTMLInputElement>;
  onNewCard: () => void;
  onEditCard: (card: Card) => void;
  onImportCsv: (file: File) => void;
  onOpenDialog: (kind: "duplicate" | "bulk-edit" | "add-to-deck", ids: string[]) => void;
  onExportSelection: (ids: string[]) => void;
  onDeleteCards: (ids: string[]) => void;
};

export function CardsView({
  filterSet,
  setFilterSet,
  searchRef,
  onNewCard,
  onEditCard,
  onImportCsv,
  onOpenDialog,
  onExportSelection,
  onDeleteCards,
}: Props) {
  const project = useWorkspace();
  const { cards, sets, templates, selectedCardId, select } = project;
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [type, setType] = useState("all");
  const [rarity, setRarity] = useState("all");
  const [sort, setSort] = useState("recent");
  const [view, setView] = useState<"grid" | "list">(() => (localStorage.getItem("cardforge-card-view") === "list" ? "list" : "grid"));
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState(PAGE_SIZE);
  const sentinel = useRef<HTMLDivElement>(null);
  const csvInput = useRef<HTMLInputElement>(null);

  const setById = useMemo(() => new Map(sets.map((set) => [set.id, set])), [sets]);
  const templateById = useMemo(() => new Map(templates.map((template) => [template.id, template])), [templates]);
  const types = useMemo(() => [...new Set(cards.map((card) => card.type))].sort(), [cards]);
  const rarities = useMemo(() => [...new Set(cards.map((card) => card.rarity))].sort((a, b) => (rarityRank[a] ?? 9) - (rarityRank[b] ?? 9)), [cards]);

  const filtered = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();
    const matches = cards.filter((card) => {
      if (filterSet !== "all" && card.setId !== filterSet) return false;
      if (type !== "all" && card.type !== type) return false;
      if (rarity !== "all" && card.rarity !== rarity) return false;
      if (!query) return true;
      return `${card.name} ${card.type} ${card.rarity} ${card.description} ${card.artist ?? ""} ${Object.values(card.fields ?? {}).join(" ")}`
        .toLowerCase()
        .includes(query);
    });
    const byName = (a: Card, b: Card) => a.name.localeCompare(b.name, undefined, { numeric: true });
    if (sort === "name") matches.sort(byName);
    else if (sort === "cost") matches.sort((a, b) => a.cost - b.cost || byName(a, b));
    else if (sort === "rarity") matches.sort((a, b) => (rarityRank[b.rarity] ?? -1) - (rarityRank[a.rarity] ?? -1) || byName(a, b));
    else if (sort === "set") matches.sort((a, b) => (setById.get(a.setId)?.name ?? "").localeCompare(setById.get(b.setId)?.name ?? "") || byName(a, b));
    else if (sort === "type") matches.sort((a, b) => a.type.localeCompare(b.type) || byName(a, b));
    return matches;
  }, [cards, deferredSearch, filterSet, type, rarity, sort, setById]);

  useEffect(() => setLimit(PAGE_SIZE), [deferredSearch, filterSet, type, rarity, sort, view]);

  useEffect(() => {
    const node = sentinel.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setLimit((current) => current + (view === "list" ? PAGE_SIZE * 4 : PAGE_SIZE));
      },
      { rootMargin: "600px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [view, filtered.length]);

  useEffect(() => {
    // Drop selections for cards that were deleted elsewhere (e.g. undo).
    setSelection((current) => {
      const ids = new Set(cards.map((card) => card.id));
      const next = new Set([...current].filter((id) => ids.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [cards]);

  const visible = filtered.slice(0, limit);
  const totalCopies = useMemo(() => cards.reduce((sum, card) => sum + card.quantity, 0), [cards]);
  const selectedIds = [...selection];
  const toggle = (id: string) =>
    setSelection((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allFilteredSelected = filtered.length > 0 && filtered.every((card) => selection.has(card.id));
  const changeView = (next: "grid" | "list") => {
    setView(next);
    localStorage.setItem("cardforge-card-view", next);
  };

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow"><span className="eyebrow-line" /> COLLECTION MANAGER</div>
          <h1>Your cards</h1>
          <p className="page-subtitle">{cards.length.toLocaleString()} unique designs · {totalCopies.toLocaleString()} total copies</p>
        </div>
        <div className="heading-actions">
          <button className="button secondary" onClick={() => csvInput.current?.click()}>
            <Upload size={15} /> Import CSV
          </button>
          <input
            ref={csvInput}
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) onImportCsv(file);
            }}
          />
          <button className="button primary" onClick={onNewCard} title="New card (N)">
            <Plus size={16} /> New card
          </button>
        </div>
      </div>

      <div className="toolbar-row">
        <div className="search-box">
          <Search size={16} />
          <input
            ref={searchRef}
            placeholder="Search names, rules text, artists…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          {search ? (
            <button className="search-clear" title="Clear search" onClick={() => setSearch("")}><X size={13} /></button>
          ) : (
            <kbd>Ctrl K</kbd>
          )}
        </div>
        <div className="filter-group">
          <SlidersHorizontal size={15} />
          <select value={filterSet} onChange={(event) => setFilterSet(event.target.value)} aria-label="Filter by set">
            <option value="all">All sets</option>
            {sets.map((set) => <option key={set.id} value={set.id}>{set.name}</option>)}
          </select>
          <select value={type} onChange={(event) => setType(event.target.value)} aria-label="Filter by type">
            <option value="all">All types</option>
            {types.map((item) => <option key={item}>{item}</option>)}
          </select>
          <select value={rarity} onChange={(event) => setRarity(event.target.value)} aria-label="Filter by rarity">
            <option value="all">All rarities</option>
            {rarities.map((item) => <option key={item}>{item}</option>)}
          </select>
          <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort cards">
            <option value="recent">Newest first</option>
            <option value="name">Name</option>
            <option value="cost">Cost</option>
            <option value="rarity">Rarity</option>
            <option value="type">Type</option>
            <option value="set">Set</option>
          </select>
          <button className={`view-toggle ${view === "grid" ? "active" : ""}`} title="Grid view" onClick={() => changeView("grid")}><Grid2X2 size={15} /></button>
          <button className={`view-toggle ${view === "list" ? "active" : ""}`} title="List view" onClick={() => changeView("list")}><List size={15} /></button>
        </div>
      </div>

      <div className={`bulk-bar ${selection.size ? "is-active" : ""}`}>
        <button
          className="bulk-select-all"
          onClick={() => setSelection(allFilteredSelected ? new Set() : new Set(filtered.map((card) => card.id)))}
          disabled={!filtered.length}
        >
          <SquareCheck size={14} /> {allFilteredSelected ? "Clear selection" : `Select all ${filtered.length.toLocaleString()}`}
        </button>
        <span className="bulk-count">{selection.size ? `${selection.size.toLocaleString()} selected` : `${filtered.length.toLocaleString()} shown`}</span>
        {selection.size > 0 && (
          <div className="bulk-actions">
            <button onClick={() => onOpenDialog("duplicate", selectedIds)}><Copy size={13} /> Duplicate</button>
            <button onClick={() => onOpenDialog("bulk-edit", selectedIds)}><Pencil size={13} /> Edit</button>
            <button onClick={() => onOpenDialog("add-to-deck", selectedIds)}><BookOpen size={13} /> Add to deck</button>
            <button onClick={() => onExportSelection(selectedIds)}><Download size={13} /> Export</button>
            <button className="danger" onClick={() => onDeleteCards(selectedIds)}><Trash2 size={13} /> Delete</button>
            <button title="Clear selection" onClick={() => setSelection(new Set())}><X size={13} /></button>
          </div>
        )}
      </div>

      {view === "grid" ? (
        <div className="card-gallery">
          {visible.map((card) => (
            <article className={`gallery-card ${selectedCardId === card.id ? "chosen" : ""} ${selection.has(card.id) ? "selected" : ""}`} key={card.id}>
              <label className="card-check" title="Select card">
                <input type="checkbox" checked={selection.has(card.id)} onChange={() => toggle(card.id)} />
              </label>
              <button
                className="gallery-preview"
                onClick={(event) => {
                  if (event.shiftKey || event.ctrlKey || event.metaKey) toggle(card.id);
                  else select(card.id);
                }}
                onDoubleClick={() => onEditCard(card)}
              >
                <CardArtwork card={card} project={project} className="gallery-art" />
              </button>
              <div className="gallery-info">
                <div className="gallery-title">
                  <strong title={card.name}>{card.name}</strong>
                  <span className="card-actions">
                    <button className="tiny-menu" title="Duplicate card" onClick={() => onOpenDialog("duplicate", [card.id])}><Copy size={14} /></button>
                    <button className="tiny-menu" title="Edit card" onClick={() => onEditCard(card)}><Ellipsis size={17} /></button>
                  </span>
                </div>
                <div className="gallery-meta">
                  <span className={`rarity rarity-${card.rarity.toLowerCase()}`}>{card.rarity}</span>
                  <span>{setById.get(card.setId)?.code ?? "—"}</span>
                  <span className="copy-count">× {card.quantity}</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="card-table-wrap">
          <table className="card-table">
            <thead>
              <tr>
                <th aria-label="Selected" />
                <th>Name</th><th>Type</th><th>Rarity</th><th className="num">Cost</th><th className="num">ATK / HP</th>
                <th>Set</th><th>Template</th><th className="num">Copies</th><th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {visible.map((card) => (
                <tr key={card.id} className={`${selection.has(card.id) ? "selected" : ""} ${selectedCardId === card.id ? "chosen" : ""}`} onDoubleClick={() => onEditCard(card)}>
                  <td><input type="checkbox" checked={selection.has(card.id)} onChange={() => toggle(card.id)} aria-label={`Select ${card.name}`} /></td>
                  <td className="card-table-name"><span className="accent-dot" style={{ background: card.accent }} />{card.name}</td>
                  <td>{card.type}</td>
                  <td><span className={`rarity rarity-${card.rarity.toLowerCase()}`}>{card.rarity}</span></td>
                  <td className="num">{card.cost}</td>
                  <td className="num">{card.attack} / {card.health}</td>
                  <td>{setById.get(card.setId)?.name ?? "—"}</td>
                  <td>{templateById.get(card.templateId)?.name ?? "—"}</td>
                  <td className="num">{card.quantity}</td>
                  <td className="row-actions">
                    <button className="tiny-menu" title="Duplicate" onClick={() => onOpenDialog("duplicate", [card.id])}><Copy size={13} /></button>
                    <button className="tiny-menu" title="Edit" onClick={() => onEditCard(card)}><Pencil size={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {visible.length < filtered.length && (
        <div ref={sentinel} className="load-more">
          <button className="button secondary" onClick={() => setLimit((current) => current + PAGE_SIZE * 4)}>
            Showing {visible.length.toLocaleString()} of {filtered.length.toLocaleString()} · load more
          </button>
        </div>
      )}
      {filtered.length === 0 && (
        <div className="empty-state">
          {cards.length ? <Search size={24} /> : <FileText size={24} />}
          <strong>{cards.length ? "No cards match" : "No cards yet"}</strong>
          <span>{cards.length ? "Try another search or filter." : "Create a card or import a CSV to get started."}</span>
        </div>
      )}
    </>
  );
}
