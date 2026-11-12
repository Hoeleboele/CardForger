import { useMemo, useState, type ReactNode } from "react";
import { Check, Copy, Plus, Upload, X } from "lucide-react";
import type { Card, CardSet, Template } from "../model";
import { uid } from "../model";
import { useWorkspace } from "../store";

export function Modal({
  kicker,
  title,
  onClose,
  children,
  wide = false,
}: {
  kicker: string;
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className={`modal ${wide ? "modal-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-heading">
          <div>
            <span className="section-kicker">{kicker}</span>
            <h2>{title}</h2>
          </div>
          <button className="round-icon" onClick={onClose} title="Close (Esc)">
            <X size={17} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

type DialogProps = { cardIds: string[]; onClose: () => void; notify: (message: string) => void };

export function DuplicateDialog({ cardIds, onClose, notify }: DialogProps) {
  const update = useWorkspace((state) => state.update);
  const cards = useWorkspace((state) => state.cards);
  const sources = useMemo(() => cards.filter((card) => cardIds.includes(card.id)), [cards, cardIds]);
  const [copies, setCopies] = useState("1");
  const [numbering, setNumbering] = useState(sources.length === 1);
  const [start, setStart] = useState("1");
  const count = Math.min(1000, Math.max(1, Number(copies) || 1));
  const firstNumber = Math.max(0, Number(start) || 1);

  const apply = () => {
    const now = Date.now();
    const additions: Card[] = sources.flatMap((card) =>
      Array.from({ length: count }, (_, index) => ({
        ...card,
        id: uid("card"),
        name: numbering ? `${card.name} #${firstNumber + index}` : card.name,
        quantity: 1,
        createdAt: now,
      })),
    );
    update((project) => ({ ...project, cards: [...additions, ...project.cards] }));
    notify(`${additions.length} card${additions.length === 1 ? "" : "s"} created`);
    onClose();
  };

  return (
    <Modal kicker="DUPLICATION" title={`Duplicate ${sources.length} card${sources.length === 1 ? "" : "s"}`} onClose={onClose}>
      <div className="dialog-body">
        <label className="field-label">
          Copies of each card
          <input type="number" min="1" max="1000" value={copies} onChange={(event) => setCopies(event.target.value)} autoFocus />
        </label>
        <label className="check-row">
          <input type="checkbox" checked={numbering} onChange={(event) => setNumbering(event.target.checked)} />
          Automatic numbering
        </label>
        {numbering && (
          <label className="field-label">
            Start numbering at
            <input type="number" min="0" value={start} onChange={(event) => setStart(event.target.value)} />
          </label>
        )}
        <p className="dialog-summary">
          Creates <strong>{sources.length * count}</strong> new card{sources.length * count === 1 ? "" : "s"}
          {numbering && sources[0] ? <> — e.g. “{sources[0].name} #{firstNumber}”, “{sources[0].name} #{firstNumber + 1}”</> : null}.
          Use <em>Copies in collection</em> on a card instead when the copies should share one design.
        </p>
      </div>
      <div className="modal-footer">
        <button className="button secondary" onClick={onClose}>Cancel</button>
        <button className="button primary" onClick={apply} disabled={!sources.length}><Copy size={14} /> Duplicate</button>
      </div>
    </Modal>
  );
}

const KEEP = "__keep__";

export function BulkEditDialog({ cardIds, onClose, notify }: DialogProps) {
  const { sets, templates, cards, update } = useWorkspace();
  const [values, setValues] = useState({
    setId: KEEP,
    templateId: KEEP,
    type: "",
    rarity: KEEP,
    artist: "",
    cost: "",
    attack: "",
    health: "",
    quantity: "",
    accent: "",
  });
  const types = useMemo(() => [...new Set(cards.map((card) => card.type))].sort(), [cards]);
  const set = (key: keyof typeof values, value: string) => setValues((current) => ({ ...current, [key]: value }));
  const number = (value: string) => (value.trim() === "" ? undefined : Number(value));

  const apply = () => {
    const ids = new Set(cardIds);
    update((project) => ({
      ...project,
      cards: project.cards.map((card) => {
        if (!ids.has(card.id)) return card;
        const next = { ...card };
        if (values.setId !== KEEP) next.setId = values.setId;
        if (values.templateId !== KEEP) next.templateId = values.templateId;
        if (values.type.trim()) next.type = values.type.trim();
        if (values.rarity !== KEEP) next.rarity = values.rarity;
        if (values.artist.trim()) next.artist = values.artist.trim();
        if (values.accent) next.accent = values.accent;
        const cost = number(values.cost);
        const attack = number(values.attack);
        const health = number(values.health);
        const quantity = number(values.quantity);
        if (cost !== undefined && Number.isFinite(cost)) next.cost = cost;
        if (attack !== undefined && Number.isFinite(attack)) next.attack = attack;
        if (health !== undefined && Number.isFinite(health)) next.health = health;
        if (quantity !== undefined && Number.isFinite(quantity)) next.quantity = Math.max(1, Math.round(quantity));
        return next;
      }),
    }));
    notify(`${cardIds.length} card${cardIds.length === 1 ? "" : "s"} updated`);
    onClose();
  };

  return (
    <Modal kicker="BULK EDIT" title={`Edit ${cardIds.length} card${cardIds.length === 1 ? "" : "s"}`} onClose={onClose}>
      <div className="dialog-body">
        <p className="dialog-summary">Only the fields you change are applied; everything else is kept.</p>
        <div className="field-pair">
          <label className="field-label">
            Set
            <select value={values.setId} onChange={(event) => set("setId", event.target.value)}>
              <option value={KEEP}>Keep current</option>
              {sets.map((item: CardSet) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label className="field-label">
            Template
            <select value={values.templateId} onChange={(event) => set("templateId", event.target.value)}>
              <option value={KEEP}>Keep current</option>
              {templates.map((item: Template) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
        </div>
        <div className="field-pair">
          <label className="field-label">
            Type
            <input list="bulk-types" placeholder="Keep current" value={values.type} onChange={(event) => set("type", event.target.value)} />
            <datalist id="bulk-types">{types.map((type) => <option key={type} value={type} />)}</datalist>
          </label>
          <label className="field-label">
            Rarity
            <select value={values.rarity} onChange={(event) => set("rarity", event.target.value)}>
              <option value={KEEP}>Keep current</option>
              {["Common", "Uncommon", "Rare", "Legendary"].map((rarity) => <option key={rarity}>{rarity}</option>)}
            </select>
          </label>
        </div>
        <div className="field-triple">
          <label className="field-label">Cost<input type="number" placeholder="Keep" value={values.cost} onChange={(event) => set("cost", event.target.value)} /></label>
          <label className="field-label">Attack<input type="number" placeholder="Keep" value={values.attack} onChange={(event) => set("attack", event.target.value)} /></label>
          <label className="field-label">Health<input type="number" placeholder="Keep" value={values.health} onChange={(event) => set("health", event.target.value)} /></label>
        </div>
        <div className="field-triple">
          <label className="field-label">Artist<input placeholder="Keep current" value={values.artist} onChange={(event) => set("artist", event.target.value)} /></label>
          <label className="field-label">Copies<input type="number" min="1" placeholder="Keep" value={values.quantity} onChange={(event) => set("quantity", event.target.value)} /></label>
          <label className="field-label">
            Accent
            <span className="inline-color">
              <input type="color" value={values.accent || "#d78957"} onChange={(event) => set("accent", event.target.value)} />
              {values.accent && <button className="text-button" onClick={() => set("accent", "")}>Keep</button>}
            </span>
          </label>
        </div>
      </div>
      <div className="modal-footer">
        <button className="button secondary" onClick={onClose}>Cancel</button>
        <button className="button primary" onClick={apply}><Check size={14} /> Apply to {cardIds.length}</button>
      </div>
    </Modal>
  );
}

export function AddToDeckDialog({ cardIds, onClose, notify }: DialogProps) {
  const { decks, update } = useWorkspace();
  const [deckId, setDeckId] = useState(decks[0]?.id ?? "__new__");
  const [newName, setNewName] = useState("");
  const [copies, setCopies] = useState("1");
  const count = Math.min(60, Math.max(1, Number(copies) || 1));

  const apply = () => {
    const additions = cardIds.flatMap((id) => Array.from({ length: count }, () => id));
    if (deckId === "__new__") {
      if (!newName.trim()) return;
      update((project) => ({ ...project, decks: [...project.decks, { id: uid("deck"), name: newName.trim(), cardIds: additions }] }));
    } else {
      update((project) => ({
        ...project,
        decks: project.decks.map((deck) => (deck.id === deckId ? { ...deck, cardIds: [...deck.cardIds, ...additions] } : deck)),
      }));
    }
    notify(`${additions.length} card${additions.length === 1 ? "" : "s"} added to deck`);
    onClose();
  };

  return (
    <Modal kicker="DECK BUILDER" title="Add to deck" onClose={onClose}>
      <div className="dialog-body">
        <label className="field-label">
          Deck
          <select value={deckId} onChange={(event) => setDeckId(event.target.value)}>
            {decks.map((deck) => <option key={deck.id} value={deck.id}>{deck.name}</option>)}
            <option value="__new__">+ New deck…</option>
          </select>
        </label>
        {deckId === "__new__" && (
          <label className="field-label">
            New deck name
            <input autoFocus value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="e.g. Ember Aggro" />
          </label>
        )}
        <label className="field-label">
          Copies of each card
          <input type="number" min="1" max="60" value={copies} onChange={(event) => setCopies(event.target.value)} />
        </label>
      </div>
      <div className="modal-footer">
        <button className="button secondary" onClick={onClose}>Cancel</button>
        <button className="button primary" onClick={apply} disabled={deckId === "__new__" && !newName.trim()}><Plus size={14} /> Add {cardIds.length * count}</button>
      </div>
    </Modal>
  );
}

const knownColumns = new Set(["name", "type", "rarity", "cost", "attack", "defense", "health", "description", "artist", "quantity", "set", "template", "accent", "artwork"]);

export function CsvImportDialog({
  fileName,
  rows,
  onClose,
  notify,
}: {
  fileName: string;
  rows: string[][];
  onClose: () => void;
  notify: (message: string) => void;
}) {
  const { sets, templates, update } = useWorkspace();
  const [defaultSetId, setDefaultSetId] = useState(sets[0]?.id ?? "");
  const [defaultTemplateId, setDefaultTemplateId] = useState(templates[0]?.id ?? "");
  const headers = rows[0] ?? [];
  const dataRows = rows.slice(1);
  const lower = headers.map((header) => header.trim().toLowerCase());
  const customColumns = headers.filter((_, index) => !knownColumns.has(lower[index]));
  const missingName = !lower.includes("name");

  const apply = () => {
    const now = Date.now();
    const newSets: CardSet[] = [];
    const findSet = (value: string) => {
      const key = value.trim().toLowerCase();
      if (!key) return defaultSetId;
      const match = [...sets, ...newSets].find((item) => item.name.toLowerCase() === key || item.code.toLowerCase() === key);
      if (match) return match.id;
      const created: CardSet = { id: uid("set"), name: value.trim(), code: value.trim().slice(0, 3).toUpperCase(), color: "#d78957" };
      newSets.push(created);
      return created.id;
    };
    const findTemplate = (value: string) =>
      templates.find((item) => item.name.toLowerCase() === value.trim().toLowerCase())?.id ?? defaultTemplateId;
    const additions: Card[] = dataRows.map((values, index) => {
      const row: Record<string, string> = {};
      const fields: Record<string, string> = {};
      headers.forEach((header, column) => {
        const value = values[column] ?? "";
        if (knownColumns.has(lower[column])) row[lower[column]] = value;
        else if (header.trim()) fields[header.trim()] = value;
      });
      const number = (value: string | undefined) => (Number.isFinite(Number(value)) ? Number(value) : 0);
      return {
        id: uid("card"),
        name: row.name || `Card ${index + 1}`,
        type: row.type || "Creature",
        rarity: row.rarity || "Common",
        cost: number(row.cost),
        attack: number(row.attack),
        health: number(row.health || row.defense),
        description: row.description ?? "",
        artist: row.artist || undefined,
        setId: findSet(row.set ?? ""),
        templateId: row.template ? findTemplate(row.template) : defaultTemplateId,
        quantity: Math.max(1, Math.round(Number(row.quantity) || 1)),
        accent: /^#[0-9a-f]{6}$/i.test(row.accent ?? "") ? row.accent : "#d78957",
        artwork: row.artwork?.startsWith("data:image/") ? row.artwork : undefined,
        fields: Object.keys(fields).length ? fields : undefined,
        createdAt: now,
      };
    });
    update((project) => ({ ...project, sets: [...project.sets, ...newSets], cards: [...additions, ...project.cards] }));
    notify(`${additions.length} cards imported${newSets.length ? ` · ${newSets.length} new set${newSets.length === 1 ? "" : "s"}` : ""}`);
    onClose();
  };

  return (
    <Modal kicker="CSV IMPORT" title={`Import ${dataRows.length} card${dataRows.length === 1 ? "" : "s"}`} onClose={onClose} wide>
      <div className="dialog-body">
        <p className="dialog-summary">
          <strong>{fileName}</strong> · {headers.length} columns. Recognised columns map to card fields; other columns become
          template placeholders such as {customColumns.slice(0, 2).map((column) => `{${column}}`).join(", ") || "{Flavor}"}.
        </p>
        <div className="csv-columns">
          {headers.map((header, index) => (
            <span key={`${header}-${index}`} className={knownColumns.has(lower[index]) ? "known" : "custom"}>{header || "(blank)"}</span>
          ))}
        </div>
        {missingName && <p className="dialog-warning">No “Name” column found — cards will be numbered automatically.</p>}
        <div className="csv-preview">
          <table>
            <thead><tr>{headers.map((header, index) => <th key={index}>{header}</th>)}</tr></thead>
            <tbody>
              {dataRows.slice(0, 5).map((values, rowIndex) => (
                <tr key={rowIndex}>{headers.map((_, column) => <td key={column}>{values[column]}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="field-pair">
          <label className="field-label">
            Default set {lower.includes("set") && <small>(rows with a Set value use or create that set)</small>}
            <select value={defaultSetId} onChange={(event) => setDefaultSetId(event.target.value)}>
              {sets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label className="field-label">
            Template
            <select value={defaultTemplateId} onChange={(event) => setDefaultTemplateId(event.target.value)}>
              {templates.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
        </div>
      </div>
      <div className="modal-footer">
        <button className="button secondary" onClick={onClose}>Cancel</button>
        <button className="button primary" onClick={apply} disabled={!dataRows.length}><Upload size={14} /> Import {dataRows.length} cards</button>
      </div>
    </Modal>
  );
}
