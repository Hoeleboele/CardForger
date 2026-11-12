import { useEffect, useMemo, useState } from "react";
import { Archive, Download, FileText, History, Loader2, Printer } from "lucide-react";
import type { Card } from "../model";
import {
  exportCard,
  exportCardsZip,
  exportPrintPdf,
  exportPrintSheet,
  exportScale,
  CARD_HEIGHT,
  CARD_WIDTH,
  type PrintOptions,
} from "../render";
import { useWorkspace } from "../store";
import { CardArtwork } from "../components/CardArtwork";

type Target = "single" | "selected" | "set" | "deck" | "collection";

const dateFormat = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

export function ExportsView({
  presetIds,
  notify,
  onExportProject,
}: {
  presetIds: string[];
  notify: (message: string) => void;
  onExportProject: () => void;
}) {
  const project = useWorkspace();
  const { cards, sets, decks, settings, assets, exportHistory, selectedCardId, logExport } = project;
  const [target, setTarget] = useState<Target>(presetIds.length ? "selected" : "single");
  const [cardId, setCardId] = useState(selectedCardId || cards[0]?.id || "");
  const [setId, setSetId] = useState(sets[0]?.id ?? "");
  const [deckId, setDeckId] = useState(decks[0]?.id ?? "");
  const [format, setFormat] = useState<string>(settings.defaultFormat);
  const [dpi, setDpi] = useState<number>(settings.exportDpi);
  const [transparent, setTransparent] = useState(false);
  const [print, setPrint] = useState<PrintOptions>({ cropMarks: true, safeArea: false, bleed: false, sides: "front" });
  const [backAssetId, setBackAssetId] = useState(settings.cardBackAssetId ?? "");
  const [busy, setBusy] = useState<{ label: string; done: number; total: number } | null>(null);

  useEffect(() => {
    if (presetIds.length) setTarget("selected");
  }, [presetIds]);

  const cardById = useMemo(() => new Map(cards.map((card) => [card.id, card])), [cards]);
  const targetCards: Card[] = useMemo(() => {
    if (target === "single") return cardById.get(cardId) ? [cardById.get(cardId)!] : [];
    if (target === "selected") return presetIds.map((id) => cardById.get(id)).filter(Boolean) as Card[];
    if (target === "set") return cards.filter((card) => card.setId === setId);
    if (target === "deck") {
      const deck = decks.find((item) => item.id === deckId);
      const counts = new Map<string, number>();
      deck?.cardIds.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1));
      return [...counts].flatMap(([id, quantity]) => (cardById.get(id) ? [{ ...cardById.get(id)!, quantity }] : []));
    }
    return cards;
  }, [target, cardId, presetIds, setId, deckId, cards, decks, cardById]);

  const copies = targetCards.reduce((sum, card) => sum + card.quantity, 0);
  const pages = Math.ceil(copies / 9);
  const scale = exportScale(dpi);
  const pixelSize = `${Math.round(CARD_WIDTH * scale)} × ${Math.round(CARD_HEIGHT * scale)} px`;
  const previewCard = targetCards[0];
  const backImage = assets.find((asset) => asset.id === backAssetId)?.data;
  const targetLabel =
    target === "set"
      ? sets.find((set) => set.id === setId)?.name ?? "Set"
      : target === "deck"
        ? decks.find((deck) => deck.id === deckId)?.name ?? "Deck"
        : target === "collection"
          ? "Collection"
          : target === "selected"
            ? "Selection"
            : previewCard?.name ?? "Card";
  const zipName = `${targetLabel.replace(/[^\w-]+/g, "_")}_${format.toUpperCase()}.zip`;

  const run = async (label: string, task: (progress: (done: number, total: number) => void) => Promise<unknown>) => {
    if (busy) return;
    setBusy({ label, done: 0, total: 1 });
    try {
      await task((done, total) => setBusy({ label, done, total }));
    } catch (error) {
      notify(`Export failed: ${error instanceof Error ? error.message : "unknown error"}`);
    } finally {
      setBusy(null);
    }
  };

  const exportImages = () =>
    run("Rendering cards", async (progress) => {
      const options = { format, dpi, transparent };
      if (targetCards.length === 1) {
        await exportCard(targetCards[0], project, options);
        logExport({ label: `${targetCards[0].name} · ${format.toUpperCase()}`, kind: "card" });
      } else {
        await exportCardsZip(targetCards, project, options, zipName, progress);
        logExport({ label: `${targetLabel} · ${targetCards.length} ${format.toUpperCase()} files`, kind: "zip" });
      }
      notify("Export complete");
    });
  const exportSheets = (kind: "pdf" | "sheet") =>
    run(kind === "pdf" ? "Building PDF" : "Rendering sheets", async (progress) => {
      const options = { ...print, backImage };
      const count = kind === "pdf"
        ? await exportPrintPdf(targetCards, project, options, progress)
        : await exportPrintSheet(targetCards, project, options, progress);
      logExport({ label: `${targetLabel} · ${count} A4 page${count === 1 ? "" : "s"} (${kind === "pdf" ? "PDF" : "PNG"})`, kind });
      notify(`${count} print page${count === 1 ? "" : "s"} exported`);
    });

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow"><span className="eyebrow-line" /> OUTPUT STUDIO</div>
          <h1>Exports</h1>
          <p className="page-subtitle">Print-quality card files and ready-to-cut A4 sheets, rendered entirely on this device.</p>
        </div>
        <div className="heading-actions">
          <button className="button secondary" onClick={onExportProject}><Archive size={15} /> Project backup</button>
        </div>
      </div>
      <div className="export-layout">
        <section className="export-config">
          <div className="export-setting">
            <label>What to export</label>
            <div className="format-options target-options">
              {([
                ["single", "Single card"],
                ["selected", `Selected (${presetIds.length})`],
                ["set", "Set"],
                ["deck", "Deck"],
                ["collection", "Everything"],
              ] as const).map(([value, label]) => (
                <button key={value} className={target === value ? "active" : ""} disabled={value === "selected" && !presetIds.length} onClick={() => setTarget(value)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          {target === "single" && (
            <div className="export-setting">
              <label>Card</label>
              <select value={cardId} onChange={(event) => setCardId(event.target.value)}>
                {cards.slice(0, 2000).map((card) => <option key={card.id} value={card.id}>{card.name}</option>)}
              </select>
            </div>
          )}
          {target === "set" && (
            <div className="export-setting">
              <label>Set</label>
              <select value={setId} onChange={(event) => setSetId(event.target.value)}>
                {sets.map((set) => <option key={set.id} value={set.id}>{set.name}</option>)}
              </select>
            </div>
          )}
          {target === "deck" && (
            <div className="export-setting">
              <label>Deck</label>
              <select value={deckId} onChange={(event) => setDeckId(event.target.value)}>
                {decks.map((deck) => <option key={deck.id} value={deck.id}>{deck.name}</option>)}
              </select>
            </div>
          )}
          <div className="export-summary">
            <span><strong>{targetCards.length.toLocaleString()}</strong> unique</span>
            <span><strong>{copies.toLocaleString()}</strong> copies</span>
            <span><strong>{pages.toLocaleString()}</strong> A4 page{pages === 1 ? "" : "s"}</span>
          </div>

          <h3 className="export-group-title">Individual card files</h3>
          <div className="export-setting">
            <label>Format</label>
            <div className="format-options">
              {["png", "jpg", "webp"].map((item) => (
                <button key={item} className={format === item ? "active" : ""} onClick={() => setFormat(item)}>{item.toUpperCase()}</button>
              ))}
            </div>
          </div>
          <div className="export-setting">
            <label>Resolution</label>
            <div className="format-options">
              {[300, 600].map((value) => (
                <button key={value} className={dpi === value ? "active" : ""} onClick={() => setDpi(value)}>{value} DPI</button>
              ))}
              <span className="resolution-note">{pixelSize}</span>
            </div>
          </div>
          <label className="check-row">
            <input type="checkbox" checked={transparent && format !== "jpg"} disabled={format === "jpg"} onChange={(event) => setTransparent(event.target.checked)} />
            Transparent background (hides layers with the Background role)
          </label>
          <button className="button primary export-button" disabled={!targetCards.length || !!busy} onClick={() => void exportImages()}>
            <Download size={16} /> {targetCards.length > 1 ? `Export ${targetCards.length.toLocaleString()} files (ZIP)` : "Export card"}
          </button>
          <div className="export-footnote">Files are named SetName_CardName.{format}</div>

          <h3 className="export-group-title">Print sheets · A4 · 3 × 3 · 63 × 88 mm</h3>
          <div className="print-options">
            {([
              ["cropMarks", "Crop marks"],
              ["safeArea", "Safe-area guides"],
              ["bleed", "3 mm bleed"],
            ] as const).map(([key, label]) => (
              <label key={key}>
                <input type="checkbox" checked={Boolean(print[key])} onChange={(event) => setPrint({ ...print, [key]: event.target.checked })} />
                <span>{label}</span>
              </label>
            ))}
          </div>
          <div className="export-setting">
            <label>Sides</label>
            <div className="format-options">
              {([
                ["front", "Fronts"],
                ["back", "Backs"],
                ["both", "Duplex (front + back)"],
              ] as const).map(([value, label]) => (
                <button key={value} className={print.sides === value ? "active" : ""} onClick={() => setPrint({ ...print, sides: value })}>{label}</button>
              ))}
            </div>
          </div>
          {print.sides !== "front" && (
            <div className="export-setting">
              <label>Card back</label>
              <select value={backAssetId} onChange={(event) => setBackAssetId(event.target.value)}>
                <option value="">CardForge default back</option>
                {assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name} · {asset.category}</option>)}
              </select>
              <small className="export-hint">Backs are mirrored so they line up with fronts on long-edge duplex printing.</small>
            </div>
          )}
          <div className="export-actions">
            <button className="button secondary export-button" disabled={!copies || !!busy} onClick={() => void exportSheets("sheet")}><Printer size={16} /> PNG sheets</button>
            <button className="button primary export-button" disabled={!copies || !!busy} onClick={() => void exportSheets("pdf")}><FileText size={16} /> Print-ready PDF</button>
          </div>
          {busy && (
            <div className="export-progress" role="status">
              <Loader2 size={14} className="spin" /> {busy.label}… {busy.done}/{busy.total}
              <div className="progress-track"><i style={{ width: `${(busy.done / Math.max(1, busy.total)) * 100}%` }} /></div>
            </div>
          )}
        </section>

        <div className="export-side">
          <div className="export-preview">
            <span className="preview-label">PREVIEW <span className="preview-dpi">{dpi} DPI</span></span>
            {previewCard ? <CardArtwork card={previewCard} project={project} className="export-card-preview" scale={1.4} /> : <p className="export-hint">Nothing to export yet.</p>}
            {previewCard && <span className="export-filename">{targetCards.length > 1 ? zipName : `${previewCard.name.replace(/\s+/g, "_")}.${format}`}</span>}
          </div>
          <section className="export-history">
            <h3><History size={14} /> Recent exports</h3>
            {exportHistory.length ? (
              <ul>
                {exportHistory.slice(0, 8).map((record) => (
                  <li key={record.id}><span>{record.label}</span><small>{dateFormat.format(record.date)}</small></li>
                ))}
              </ul>
            ) : (
              <p className="export-hint">Your exports will be listed here.</p>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
