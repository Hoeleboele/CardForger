import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  Copy,
  Download,
  Flame,
  Grid2X2,
  History,
  ImagePlus,
  Layers3,
  LayoutDashboard,
  Package,
  Paintbrush,
  Pencil,
  Plus,
  Redo2,
  Search,
  Settings2,
  Shield,
  Sparkles,
  Trash2,
  Undo2,
  Upload,
  X,
} from "lucide-react";
import type { Asset, Card, CardSet, Deck, FontAsset, Project, Template } from "./model";
import { createStarterLayers, initialProject, normalizeProject, toProject, uid } from "./model";
import {
  beginSession,
  endSession,
  lastSavedAt,
  loadPreviousSession,
  loadProject,
  savePreviousSession,
  saveProject,
} from "./storage";
import { downloadBlob } from "./render";
import { readFileAsDataUrl, registerFonts } from "./fonts";
import { useWorkspace } from "./store";
import { CardArtwork } from "./components/CardArtwork";
import { AddToDeckDialog, BulkEditDialog, CsvImportDialog, DuplicateDialog } from "./components/BulkDialogs";
import { CardsView } from "./views/CardsView";
import { AssetsView } from "./views/AssetsView";
import { ExportsView } from "./views/ExportsView";
import { SettingsView } from "./views/SettingsView";
const TemplateDesigner = lazy(() => import("./TemplateDesigner"));

const AUTOSAVE_INTERVAL = 10_000;

type Section =
  | "Dashboard"
  | "Cards"
  | "Templates"
  | "Sets"
  | "Decks"
  | "Assets"
  | "Exports"
  | "Settings";

type CardForm = {
  name: string;
  type: string;
  rarity: string;
  cost: string;
  attack: string;
  health: string;
  description: string;
  setId: string;
  templateId: string;
  artist: string;
  accent: string;
  fields: string;
};

/** Template files carry the assets and fonts they reference so they work in another workspace. */
type TemplatePackage = Template & { assets?: Asset[]; fonts?: FontAsset[] };

const navItems: { name: Section; icon: typeof LayoutDashboard }[] = [
  { name: "Dashboard", icon: LayoutDashboard },
  { name: "Cards", icon: Grid2X2 },
  { name: "Templates", icon: Layers3 },
  { name: "Sets", icon: Package },
  { name: "Decks", icon: BookOpen },
  { name: "Assets", icon: ImagePlus },
];

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        value += '"';
        index++;
      } else quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(value.trim());
      value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index++;
      row.push(value.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      value = "";
    } else value += character;
  }
  row.push(value.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

const parseFields = (text: string) =>
  Object.fromEntries(
    text
      .split("\n")
      .map((line) => line.split(/:(.*)/s))
      .filter(([key]) => key?.trim())
      .map(([key, value]) => [key.trim(), (value ?? "").trim()]),
  );
const formatFields = (fields?: Record<string, string>) =>
  Object.entries(fields ?? {})
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });
const longDate = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" });

function App() {
  const state = useWorkspace();
  const [section, setSection] = useState<Section>("Dashboard");
  const [cardSetFilter, setCardSetFilter] = useState("all");
  const [modal, setModal] = useState<"card" | "set" | "deck" | "template" | "rename" | null>(null);
  const [dialog, setDialog] = useState<{ kind: "duplicate" | "bulk-edit" | "add-to-deck"; ids: string[] } | null>(null);
  const [csvImport, setCsvImport] = useState<{ fileName: string; rows: string[][] } | null>(null);
  const [renameTarget, setRenameTarget] = useState<{
    kind: "set" | "deck" | "template";
    id: string;
  } | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [activeDeck, setActiveDeck] = useState("");
  const [deckSearch, setDeckSearch] = useState("");
  const [deckType, setDeckType] = useState("all");
  const [exportIds, setExportIds] = useState<string[]>([]);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"saved" | "dirty" | "saving" | "error">("saved");
  const [lastSaved, setLastSaved] = useState<number | undefined>(() => lastSavedAt());
  const [previousSession, setPreviousSession] = useState<number>();
  const [recovered, setRecovered] = useState(false);
  const [storageUse, setStorageUse] = useState<number>();
  const savedRevision = useRef(-1);
  const searchRef = useRef<HTMLInputElement>(null);
  const artworkInput = useRef<HTMLInputElement>(null);
  const templateInput = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<CardForm>({
    name: "",
    type: "Creature",
    rarity: "Common",
    cost: "1",
    attack: "1",
    health: "1",
    description: "",
    setId: "",
    templateId: "",
    artist: "",
    accent: "#d78957",
    fields: "",
  });
  const [quantity, setQuantity] = useState("1");
  const [selectedArtwork, setSelectedArtwork] = useState<string>();
  const notify = useCallback((message: string) => setToast(message), []);

  const flush = useCallback(async () => {
    const current = useWorkspace.getState();
    if (!current.ready || current.revision === savedRevision.current) return;
    const revision = current.revision;
    setSaveState("saving");
    try {
      await saveProject(toProject(current));
      savedRevision.current = revision;
      setLastSaved(Date.now());
      setSaveState(useWorkspace.getState().revision === revision ? "saved" : "dirty");
    } catch {
      setSaveState("error");
    }
  }, []);

  useEffect(() => {
    const crashed = beginSession();
    let cancelled = false;
    void (async () => {
      const stored = await loadProject();
      const project = stored ?? initialProject;
      await registerFonts(project.fonts);
      if (stored) await savePreviousSession(stored, lastSavedAt() ?? Date.now());
      const previous = await loadPreviousSession();
      if (cancelled) return;
      setPreviousSession(previous?.savedAt);
      useWorkspace.getState().replace(project);
      savedRevision.current = useWorkspace.getState().revision;
      if (crashed && stored) setRecovered(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => void flush(), AUTOSAVE_INTERVAL);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (useWorkspace.getState().revision !== savedRevision.current) {
        void flush();
        event.preventDefault();
      }
    };
    const onPageHide = () => endSession();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [flush]);

  useEffect(() => {
    if (state.ready && state.revision !== savedRevision.current) {
      setSaveState((current) => (current === "saving" ? current : "dirty"));
    }
  }, [state.revision, state.ready]);

  useEffect(() => {
    void registerFonts(state.fonts);
  }, [state.fonts]);

  useEffect(() => {
    void navigator.storage?.estimate?.().then(({ usage = 0, quota = 1 }) => setStorageUse(usage / quota));
  }, [lastSaved]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (editingTemplateId) return;
      const target = event.target as HTMLElement;
      const typing = target.matches?.("input, textarea, select, [contenteditable]");
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (mod && key === "s") {
        event.preventDefault();
        void flush().then(() => notify("Workspace saved"));
      } else if (mod && key === "k") {
        event.preventDefault();
        setSection("Cards");
        window.setTimeout(() => searchRef.current?.focus(), 0);
      } else if (event.key === "Escape") {
        if (dialog) setDialog(null);
        else if (csvImport) setCsvImport(null);
        else if (modal) setModal(null);
      } else if (typing) {
        return;
      } else if (mod && key === "z") {
        event.preventDefault();
        if (event.shiftKey) state.redo();
        else state.undo();
      } else if (mod && key === "y") {
        event.preventDefault();
        state.redo();
      } else if (!mod && !event.altKey && key === "n" && !modal && !dialog && !csvImport) {
        event.preventDefault();
        openNewCard();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const currentCard =
    state.cards.find((card) => card.id === state.selectedCardId) ?? state.cards[0];
  const totalCopies = useMemo(() => state.cards.reduce((total, card) => total + card.quantity, 0), [state.cards]);
  const currentDeck =
    state.decks.find((deck) => deck.id === activeDeck) ?? state.decks[0];
  const activeTemplate = state.templates.find(
    (template) => template.id === editingTemplateId,
  );
  const editorCard = useMemo(() => {
    const sample =
      state.cards.find((card) => card.templateId === editingTemplateId) ??
      currentCard ??
      initialProject.cards[0];
    return { ...sample, templateId: editingTemplateId ?? sample.templateId };
  }, [state.cards, editingTemplateId, currentCard]);
  const templateSamples = useMemo(
    () =>
      new Map(
        state.templates.map((template) => {
          const sample = state.cards.find((card) => card.templateId === template.id) ?? state.cards[0] ?? initialProject.cards[0];
          return [template.id, { ...sample, templateId: template.id }];
        }),
      ),
    [state.templates, state.cards],
  );
  const cardById = useMemo(() => new Map(state.cards.map((card) => [card.id, card])), [state.cards]);
  const deckEntries = useMemo(() => {
    const counts = new Map<string, number>();
    currentDeck?.cardIds.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1));
    return [...counts].map(([id, quantity]) => ({ id, quantity }));
  }, [currentDeck]);
  const deckBreakdown = useMemo(() => {
    const types = new Map<string, number>();
    const rarities = new Map<string, number>();
    let cost = 0;
    let counted = 0;
    for (const id of currentDeck?.cardIds ?? []) {
      const card = cardById.get(id);
      if (!card) continue;
      types.set(card.type, (types.get(card.type) ?? 0) + 1);
      rarities.set(card.rarity, (rarities.get(card.rarity) ?? 0) + 1);
      cost += card.cost;
      counted++;
    }
    return { types: [...types], rarities: [...rarities], averageCost: counted ? cost / counted : undefined };
  }, [currentDeck, cardById]);
  const deckCandidates = useMemo(() => {
    const query = deckSearch.trim().toLowerCase();
    return state.cards
      .filter(
        (card) =>
          (deckType === "all" || card.type === deckType) &&
          (!query || `${card.name} ${card.type} ${card.rarity}`.toLowerCase().includes(query)),
      )
      .slice(0, 40);
  }, [state.cards, deckSearch, deckType]);
  const cardTypes = useMemo(() => [...new Set(state.cards.map((card) => card.type))].sort(), [state.cards]);
  const recentTemplates = useMemo(
    () => [...state.templates].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)).slice(0, 4),
    [state.templates],
  );
  const draftCard: Card = {
    id: editingId ?? "draft",
    name: form.name || "Untitled card",
    type: form.type,
    rarity: form.rarity,
    cost: Number(form.cost) || 0,
    attack: Number(form.attack) || 0,
    health: Number(form.health) || 0,
    description: form.description,
    setId: form.setId,
    templateId: form.templateId,
    quantity: Math.max(1, Number(quantity) || 1),
    artwork: selectedArtwork,
    accent: form.accent,
    artist: form.artist.trim() || undefined,
    fields: parseFields(form.fields),
  };

  const openNewCard = (card?: Card, templateId?: string) => {
    setEditingId(card?.id ?? null);
    setSelectedArtwork(card?.artwork);
    setForm(
      card
        ? {
            name: card.name,
            type: card.type,
            rarity: card.rarity,
            cost: String(card.cost),
            attack: String(card.attack),
            health: String(card.health),
            description: card.description,
            setId: card.setId,
            templateId: card.templateId,
            artist: card.artist ?? "",
            accent: card.accent,
            fields: formatFields(card.fields),
          }
        : {
            name: "",
            type: "Creature",
            rarity: "Common",
            cost: "1",
            attack: "1",
            health: "1",
            description: "",
            setId: cardSetFilter !== "all" ? cardSetFilter : state.sets[0]?.id ?? "",
            templateId: templateId ?? state.templates[0]?.id ?? "",
            artist: "",
            accent: "#d78957",
            fields: "",
          },
    );
    setQuantity(String(card?.quantity ?? 1));
    setModal("card");
  };
  const saveCard = () => {
    if (!form.name.trim()) return;
    const existing = editingId ? cardById.get(editingId) : undefined;
    const fields = parseFields(form.fields);
    const card: Card = {
      ...draftCard,
      id: editingId ?? uid("card"),
      name: form.name.trim(),
      fields: Object.keys(fields).length ? fields : undefined,
      createdAt: existing?.createdAt ?? Date.now(),
    };
    state.update((project) => ({
      ...project,
      cards: editingId
        ? project.cards.map((item) => (item.id === editingId ? card : item))
        : [card, ...project.cards],
      selectedCardId: card.id,
    }));
    setModal(null);
    notify(editingId ? "Card updated" : "Card added to your collection");
  };
  const saveSet = (name: string) => {
    if (!name.trim()) return;
    const set: CardSet = {
      id: uid("set"),
      name: name.trim(),
      code: name.trim().slice(0, 3).toUpperCase(),
      color: "#d78957",
    };
    state.update((project) => ({ ...project, sets: [...project.sets, set] }));
    setModal(null);
    notify("Set created");
  };
  const saveDeck = (name: string) => {
    if (!name.trim()) return;
    const deck: Deck = { id: uid("deck"), name: name.trim(), cardIds: [] };
    state.update((project) => ({
      ...project,
      decks: [...project.decks, deck],
    }));
    setActiveDeck(deck.id);
    setModal(null);
    notify("Deck created");
  };
  const saveTemplate = (name: string) => {
    if (!name.trim()) return;
    const template: Template = {
      id: uid("template"),
      name: name.trim(),
      description: "Custom card frame",
      layers: createStarterLayers(uid("template-layers")),
      updatedAt: Date.now(),
    };
    state.update((project) => ({
      ...project,
      templates: [...project.templates, template],
    }));
    setModal(null);
    setEditingTemplateId(template.id);
  };
  const duplicateTemplate = (template: Template) => {
    state.update((project) => ({
      ...project,
      templates: [
        ...project.templates,
        {
          ...structuredClone(template),
          id: uid("template"),
          name: `${template.name} copy`,
          updatedAt: Date.now(),
        },
      ],
    }));
    notify("Template duplicated");
  };
  const exportTemplate = (template: Template) => {
    const assetIds = new Set(template.layers.map((layer) => layer.assetId).filter(Boolean));
    const families = new Set(template.layers.map((layer) => layer.fontFamily).filter(Boolean));
    const bundle: TemplatePackage = {
      ...template,
      assets: state.assets.filter((asset) => assetIds.has(asset.id)),
      fonts: state.fonts.filter((font) => families.has(font.family)),
    };
    downloadBlob(
      new Blob([JSON.stringify(bundle)], { type: "application/json" }),
      `${template.name.replace(/[^\w-]+/g, "_")}.cardtemplate`,
    );
    state.logExport({ label: `Template · ${template.name}`, kind: "template" });
    notify("Template exported");
  };
  const importTemplate = async (file?: File) => {
    if (!file) return;
    try {
      const imported = JSON.parse(await file.text()) as TemplatePackage;
      if (typeof imported.name !== "string" || !Array.isArray(imported.layers))
        throw new Error("Invalid template");
      const { assets = [], fonts = [], ...template } = imported;
      const newAssets = assets.filter((asset) => !state.assets.some((existing) => existing.id === asset.id));
      const newFonts = fonts.filter((font) => !state.fonts.some((existing) => existing.id === font.id));
      const normalized = normalizeProject({
        templates: [{ ...template, id: uid("template"), updatedAt: Date.now() }],
      }).templates[0];
      state.update((project) => ({
        ...project,
        templates: [...project.templates, normalized],
        assets: [...newAssets, ...project.assets],
        fonts: [...project.fonts, ...newFonts],
      }));
      notify(`Template imported${newAssets.length ? ` with ${newAssets.length} asset${newAssets.length === 1 ? "" : "s"}` : ""}`);
    } catch {
      notify("That template file could not be opened");
    }
  };
  const beginRename = (
    kind: "set" | "deck" | "template",
    id: string,
    name: string,
  ) => {
    setRenameTarget({ kind, id });
    setRenameValue(name);
    setModal("rename");
  };
  const saveRename = (name: string) => {
    if (!name.trim() || !renameTarget) return;
    const nextName = name.trim();
    state.update((project) => {
      if (renameTarget.kind === "set")
        return {
          ...project,
          sets: project.sets.map((set) =>
            set.id === renameTarget.id
              ? { ...set, name: nextName, code: nextName.slice(0, 3).toUpperCase() }
              : set,
          ),
        };
      if (renameTarget.kind === "deck")
        return {
          ...project,
          decks: project.decks.map((deck) =>
            deck.id === renameTarget.id ? { ...deck, name: nextName } : deck,
          ),
        };
      return {
        ...project,
        templates: project.templates.map((template) =>
          template.id === renameTarget.id
            ? { ...template, name: nextName, updatedAt: Date.now() }
            : template,
        ),
      };
    });
    setRenameTarget(null);
    setModal(null);
    notify("Name updated");
  };
  const deleteCards = (ids: string[]) => {
    if (!ids.length) return;
    if (!window.confirm(ids.length === 1 ? "Delete this card from the collection?" : `Delete ${ids.length} cards from the collection?`)) return;
    const removed = new Set(ids);
    state.update((project) => {
      const cards = project.cards.filter((card) => !removed.has(card.id));
      return {
        ...project,
        cards,
        decks: project.decks.map((deck) => ({
          ...deck,
          cardIds: deck.cardIds.filter((cardId) => !removed.has(cardId)),
        })),
        selectedCardId: removed.has(project.selectedCardId) ? cards[0]?.id ?? "" : project.selectedCardId,
      };
    });
    setEditingId(null);
    setModal(null);
    notify(`${ids.length} card${ids.length === 1 ? "" : "s"} deleted · Ctrl+Z to undo`);
  };
  const deleteSet = (id: string) => {
    if (state.sets.length <= 1) {
      notify("Keep at least one set in the workspace");
      return;
    }
    if (!window.confirm("Delete this set? Its cards will move to another set.")) return;
    const replacement = state.sets.find((set) => set.id !== id)!;
    state.update((project) => ({
      ...project,
      sets: project.sets.filter((set) => set.id !== id),
      cards: project.cards.map((card) =>
        card.setId === id ? { ...card, setId: replacement.id } : card,
      ),
    }));
    if (cardSetFilter === id) setCardSetFilter("all");
    notify(`Set deleted; its cards moved to ${replacement.name}`);
  };
  const duplicateSet = (set: CardSet) => {
    const copy: CardSet = { ...set, id: uid("set"), name: `${set.name} copy` };
    const now = Date.now();
    state.update((project) => ({
      ...project,
      sets: [...project.sets, copy],
      cards: [
        ...project.cards.filter((card) => card.setId === set.id).map((card) => ({ ...card, id: uid("card"), setId: copy.id, createdAt: now })),
        ...project.cards,
      ],
    }));
    notify(`“${copy.name}” created`);
  };
  const deleteDeck = (id: string) => {
    if (!window.confirm("Delete this deck? Cards in the collection are not affected.")) return;
    const remaining = state.decks.filter((deck) => deck.id !== id);
    state.update((project) => ({ ...project, decks: remaining }));
    if (activeDeck === id) setActiveDeck(remaining[0]?.id ?? "");
    notify("Deck deleted");
  };
  const deleteTemplate = (id: string) => {
    if (state.templates.length <= 1) {
      notify("Keep at least one template in the workspace");
      return;
    }
    if (!window.confirm("Delete this template? Its cards will use another template.")) return;
    const replacement = state.templates.find((template) => template.id !== id)!;
    state.update((project) => ({
      ...project,
      templates: project.templates.filter((template) => template.id !== id),
      cards: project.cards.map((card) =>
        card.templateId === id ? { ...card, templateId: replacement.id } : card,
      ),
    }));
    if (editingTemplateId === id) setEditingTemplateId(null);
    notify("Template deleted; cards were preserved");
  };
  const updateDeck = (deck: Deck, cardId: string, add: boolean) => {
    state.update((project) => ({
      ...project,
      decks: project.decks.map((item) => {
        if (item.id !== deck.id) return item;
        const cardIds = [...item.cardIds];
        if (add) cardIds.push(cardId);
        else {
          const index = cardIds.indexOf(cardId);
          if (index >= 0) cardIds.splice(index, 1);
        }
        return { ...item, cardIds };
      }),
    }));
  };
  const exportProject = () => {
    const name = state.settings.projectName.replace(/[^\w-]+/g, "_") || "CardForge_project";
    downloadBlob(
      new Blob([JSON.stringify({ format: "cardforge", version: 1, ...toProject(state) })], { type: "application/json" }),
      `${name}.cardforge`,
    );
    state.logExport({ label: `Project backup · ${state.settings.projectName}`, kind: "project" });
    notify("Project backup exported");
  };
  const importProject = async (file?: File) => {
    if (!file) return;
    try {
      const project = JSON.parse(await file.text()) as Project;
      if (
        !Array.isArray(project.cards) ||
        !Array.isArray(project.sets) ||
        !Array.isArray(project.templates)
      )
        throw new Error("Invalid project");
      if (!window.confirm(`Replace the current workspace with “${file.name}”? Export a backup first if you want to keep it.`)) return;
      await flush();
      const restored = normalizeProject(project);
      await registerFonts(restored.fonts);
      state.replace(restored);
      state.logExport({ label: `Opened project · ${file.name}`, kind: "project" });
      setCardSetFilter("all");
      setActiveDeck("");
      notify("Project restored");
    } catch {
      notify("That project file could not be opened");
    }
  };
  const restorePreviousSession = async () => {
    const previous = await loadPreviousSession();
    if (!previous) return;
    if (!window.confirm("Replace the current workspace with the previous session? Current changes will be lost unless exported.")) return;
    await registerFonts(previous.project.fonts);
    state.replace(previous.project);
    notify("Previous session restored");
  };
  const startCsvImport = async (file: File) => {
    const rows = parseCsv(await file.text());
    if (rows.length < 2) {
      notify("That CSV has no data rows");
      return;
    }
    setCsvImport({ fileName: file.name, rows });
  };
  const uploadArtwork = async (file?: File) => {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) {
      notify("Artwork must be PNG, JPG, WEBP or SVG");
      return;
    }
    const data = await readFileAsDataUrl(file);
    setSelectedArtwork(data);
    state.update((project) => ({
      ...project,
      assets: [
        { id: uid("asset"), name: file.name, category: "Artwork", data, size: file.size, tags: [], folder: "" },
        ...project.assets,
      ],
    }));
  };
  const openExports = (ids: string[]) => {
    setExportIds(ids);
    setSection("Exports");
  };
  const artworkAssets = state.assets.filter((asset) => asset.category === "Artwork");

  if (!state.ready)
    return (
      <div className="boot-screen">
        <div className="brand-mark">
          <Flame size={22} />
        </div>
        <span>Opening your studio</span>
      </div>
    );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#home"
          onClick={(event) => {
            event.preventDefault();
            setSection("Dashboard");
          }}
        >
          <span className="brand-mark">
            <Flame size={19} fill="currentColor" />
          </span>
          <span className="brand-copy">
            cardforge<span>STUDIO</span>
          </span>
        </a>
        <button className="workspace-switch" onClick={() => setSection("Settings")} title="Project settings">
          <span className="workspace-dot" />
          <span>
            {state.settings.projectName}
            <small>{state.cards.length.toLocaleString()} cards · local workspace</small>
          </span>
          <Settings2 size={14} />
        </button>
        <div className="nav-caption">WORKSPACE</div>
        <nav className="main-nav">
          {navItems.map(({ name, icon: Icon }) => (
            <button
              key={name}
              className={`nav-link ${section === name ? "active" : ""}`}
              onClick={() => setSection(name)}
            >
              <Icon size={17} strokeWidth={1.8} />
              <span>{name}</span>
              {name === "Cards" && (
                <span className="nav-count">{state.cards.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="nav-caption library-caption">LIBRARIES</div>
        <button
          className={`nav-link ${section === "Exports" ? "active" : ""}`}
          onClick={() => setSection("Exports")}
        >
          <ArrowDownToLine size={17} strokeWidth={1.8} />
          <span>Exports</span>
        </button>
        <button
          className={`nav-link ${section === "Settings" ? "active" : ""}`}
          onClick={() => setSection("Settings")}
        >
          <Settings2 size={17} strokeWidth={1.8} />
          <span>Settings</span>
        </button>
        <div className="sidebar-bottom">
          <div className="storage-label">
            <span>LOCAL STORAGE</span>
            <span>{storageUse === undefined ? "—" : `${Math.max(1, Math.round(storageUse * 100))}%`}</span>
          </div>
          <div className="storage-track">
            <i style={{ width: `${Math.max(2, Math.min(100, (storageUse ?? 0) * 100))}%` }} />
          </div>
          <div className="offline-note">
            <span className="online-dot" /> Works offline · no account
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb">
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{section}</strong>
          </div>
          <div className="top-actions">
            <button className="icon-button" title="Undo (Ctrl+Z)" aria-label="Undo" disabled={!state.history.length} onClick={state.undo}>
              <Undo2 size={16} />
            </button>
            <button className="icon-button" title="Redo (Ctrl+Shift+Z)" aria-label="Redo" disabled={!state.future.length} onClick={state.redo}>
              <Redo2 size={16} />
            </button>
            <button
              className={`save-indicator is-${saveState}`}
              onClick={() => void flush().then(() => notify("Workspace saved"))}
              title="Autosaves every 10 seconds · Ctrl+S to save now"
            >
              <span className="save-dot" />
              {saveState === "saving"
                ? "Saving…"
                : saveState === "dirty"
                  ? "Unsaved changes"
                  : saveState === "error"
                    ? "Save failed — retry"
                    : lastSaved
                      ? `Saved ${timeFormat.format(lastSaved)}`
                      : "All changes saved"}
            </button>
          </div>
        </header>
        <div className="page-content">
          {recovered && (
            <div className="recovery-banner" role="status">
              <History size={16} />
              <span>
                CardForge didn’t close cleanly last time. Your last autosave
                {lastSaved ? ` from ${timeFormat.format(lastSaved)}` : ""} was restored.
              </span>
              {previousSession && (
                <button className="text-button" onClick={() => void restorePreviousSession()}>Use previous session instead</button>
              )}
              <button className="tiny-menu" title="Dismiss" onClick={() => setRecovered(false)}><X size={14} /></button>
            </div>
          )}
          {section === "Dashboard" && (
            <>
              <div className="welcome-row">
                <div>
                  <div className="eyebrow">
                    <span className="eyebrow-line" /> {longDate.format(new Date()).toUpperCase()}
                  </div>
                  <h1>Your card workshop.</h1>
                  <p className="page-subtitle">
                    A little more magic, one card at a time.
                  </p>
                </div>
                <button
                  className="button primary"
                  onClick={() => openNewCard()}
                >
                  <Plus size={16} /> New card
                </button>
              </div>
              <section className="stats-grid">
                <Stat
                  icon={Grid2X2}
                  label="Unique cards"
                  value={String(state.cards.length).padStart(2, "0")}
                  detail="Across your collection"
                  tone="coral"
                />
                <Stat
                  icon={Package}
                  label="Card sets"
                  value={String(state.sets.length).padStart(2, "0")}
                  detail="Worlds taking shape"
                  tone="sage"
                />
                <Stat
                  icon={BookOpen}
                  label="Decks"
                  value={String(state.decks.length).padStart(2, "0")}
                  detail={`${totalCopies} cards in circulation`}
                  tone="blue"
                />
                <Stat
                  icon={Layers3}
                  label="Templates"
                  value={String(state.templates.length).padStart(2, "0")}
                  detail="Ready for your ideas"
                  tone="gold"
                />
              </section>
              <div className="dashboard-grid">
                <section className="panel recent-panel">
                  <div className="section-heading">
                    <div>
                      <span className="section-kicker">YOUR COLLECTION</span>
                      <h2>Recently forged</h2>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => setSection("Cards")}
                    >
                      View all <ArrowRight size={14} />
                    </button>
                  </div>
                  <div className="recent-cards">
                    {state.cards.slice(0, 4).map((card, index) => (
                      <button
                        className="recent-card"
                        key={card.id}
                        onClick={() => {
                          state.select(card.id);
                          setSection("Cards");
                        }}
                      >
                        <CardArtwork
                          card={card}
                          project={state}
                          className="mini-card"
                        />
                        <span className="recent-card-copy">
                          <strong>{card.name}</strong>
                          <small>
                            {state.sets.find((set) => set.id === card.setId)
                              ?.name ?? "No set"}
                          </small>
                          <span
                            className={`rarity rarity-${card.rarity.toLowerCase()}`}
                          >
                            {card.rarity}
                          </span>
                        </span>
                        <span className="recent-index">0{index + 1}</span>
                      </button>
                    ))}
                  </div>
                </section>
                <section className="panel sets-panel">
                  <div className="section-heading">
                    <div>
                      <span className="section-kicker">WORLDS & STORIES</span>
                      <h2>Your card sets</h2>
                    </div>
                    <button
                      className="round-icon"
                      onClick={() => setModal("set")}
                      title="Create set"
                    >
                      <Plus size={17} />
                    </button>
                  </div>
                  <div className="set-list">
                    {state.sets.map((set) => {
                      const setCards = state.cards.filter(
                        (card) => card.setId === set.id,
                      );
                      const count = setCards.length;
                      return (
                        <button
                          className="set-row"
                          key={set.id}
                          onClick={() => {
                            setCardSetFilter(set.id);
                            setSection("Cards");
                          }}
                        >
                          <span
                            className="set-symbol"
                            style={{ color: set.color }}
                          >
                            <Shield size={19} />
                          </span>
                          <span className="set-row-copy">
                            <strong>{set.name}</strong>
                            <small>
                              {set.code} · {setCards.reduce((sum, card) => sum + card.quantity, 0)} copies
                            </small>
                          </span>
                          <span className="set-total">
                            {String(count).padStart(2, "0")}
                            <small>cards</small>
                          </span>
                          <ChevronRight size={15} />
                        </button>
                      );
                    })}
                  </div>
                  <button
                    className="create-set-link"
                    onClick={() => setModal("set")}
                  >
                    <Plus size={14} /> Create a new set
                  </button>
                </section>
              </div>
              <div className="dashboard-grid dashboard-lower">
                <section className="panel recent-panel">
                  <div className="section-heading">
                    <div>
                      <span className="section-kicker">DESIGN SYSTEM</span>
                      <h2>Recent templates</h2>
                    </div>
                    <button className="text-button" onClick={() => setSection("Templates")}>
                      All templates <ArrowRight size={14} />
                    </button>
                  </div>
                  <div className="recent-cards">
                    {recentTemplates.map((template) => (
                      <button className="recent-card" key={template.id} onClick={() => setEditingTemplateId(template.id)}>
                        <CardArtwork card={templateSamples.get(template.id)!} project={state} className="mini-card" />
                        <span className="recent-card-copy">
                          <strong>{template.name}</strong>
                          <small>{template.layers.length} layers{template.updatedAt ? ` · ${timeFormat.format(template.updatedAt)}` : ""}</small>
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
                <section className="panel sets-panel">
                  <div className="section-heading">
                    <div>
                      <span className="section-kicker">ACTIVITY</span>
                      <h2>Recent exports & projects</h2>
                    </div>
                    <button className="text-button" onClick={() => setSection("Exports")}>
                      Exports <ArrowRight size={14} />
                    </button>
                  </div>
                  {state.exportHistory.length ? (
                    <ul className="activity-list">
                      {state.exportHistory.slice(0, 6).map((record) => (
                        <li key={record.id}>
                          <span className={`activity-kind kind-${record.kind}`}>{record.kind === "project" ? "PROJECT" : record.kind.toUpperCase()}</span>
                          <span className="activity-label">{record.label}</span>
                          <small>{new Date(record.date).toLocaleDateString()} {timeFormat.format(record.date)}</small>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="activity-empty">
                      <Sparkles size={18} />
                      <span>Exports, backups and opened projects will appear here.</span>
                    </div>
                  )}
                </section>
              </div>
            </>
          )}

          {section === "Cards" && (
            <CardsView
              filterSet={cardSetFilter}
              setFilterSet={setCardSetFilter}
              searchRef={searchRef}
              onNewCard={() => openNewCard()}
              onEditCard={(card) => openNewCard(card)}
              onImportCsv={(file) => void startCsvImport(file)}
              onOpenDialog={(kind, ids) => setDialog({ kind, ids })}
              onExportSelection={openExports}
              onDeleteCards={deleteCards}
            />
          )}

          {section === "Templates" && (
            <>
              <PageHeading
                eyebrow="DESIGN SYSTEM"
                title="Templates"
                subtitle="Reusable frames for every card in your world."
                action={
                  <>
                    <label className="button secondary template-import-button"><Upload size={15} /> Import template<input ref={templateInput} type="file" accept=".cardtemplate,.json" hidden onChange={(event) => void importTemplate(event.target.files?.[0])} /></label>
                    <button className="button primary" onClick={() => setModal("template")}><Plus size={16} /> New template</button>
                  </>
                }
              />
              <div className="template-grid">
                {state.templates.map((template, index) => (
                  <article className="template-tile" key={template.id}>
                    <button className="template-cover template-cover-live" onClick={() => setEditingTemplateId(template.id)} title="Open in designer">
                      <span className="template-cover-label">
                        CARD FRAME / {String(index + 1).padStart(2, "0")}
                      </span>
                      <CardArtwork card={templateSamples.get(template.id)!} project={state} className="template-thumb" />
                    </button>
                    <div className="template-details">
                      <div>
                        <strong>{template.name}</strong>
                        <span>{template.description}</span>
                      </div>
                      <button
                        className="tiny-menu"
                        title="Duplicate template"
                        onClick={() => duplicateTemplate(template)}
                      >
                        <Copy size={15} />
                      </button>
                      <button
                        className="tiny-menu"
                        title="Edit template layers"
                        onClick={() => setEditingTemplateId(template.id)}
                      >
                        <Paintbrush size={14} />
                      </button>
                      <button
                        className="tiny-menu"
                        title="Rename template"
                        onClick={() => beginRename("template", template.id, template.name)}
                      >
                        <Pencil size={14} />
                      </button>
                      <button className="tiny-menu" title="Export template" onClick={() => exportTemplate(template)}><Download size={14} /></button>
                      <button
                        className="tiny-menu"
                        title="Delete template"
                        onClick={() => deleteTemplate(template.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div className="template-layers">
                      <Layers3 size={13} /> {template.layers.length} layers{" "}
                      <span>·</span>{" "}
                      <button
                        onClick={() => {
                          openNewCard(undefined, template.id);
                        }}
                      >
                        Use template <ArrowRight size={12} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}

          {section === "Sets" && (
            <>
              <PageHeading
                eyebrow="COLLECTIONS"
                title="Card sets"
                subtitle="Keep your worlds, expansions, and promos in order."
                action={
                  <button
                    className="button primary"
                    onClick={() => setModal("set")}
                  >
                    <Plus size={16} /> New set
                  </button>
                }
              />
              <div className="set-grid">
                {state.sets.map((set) => {
                  const cards = state.cards.filter(
                    (card) => card.setId === set.id,
                  );
                  return (
                    <article className="set-card" key={set.id}>
                      <div className="set-card-top">
                        <span
                          className="large-set-icon"
                          style={{ color: set.color }}
                        >
                          <Shield size={23} />
                        </span>
                        <div className="set-actions">
                          <button className="tiny-menu" title="Bulk edit cards in set" disabled={!cards.length} onClick={() => setDialog({ kind: "bulk-edit", ids: cards.map((card) => card.id) })}><Layers3 size={14} /></button>
                          <button className="tiny-menu" title="Duplicate set with all its cards" onClick={() => duplicateSet(set)}><Copy size={14} /></button>
                          <button className="tiny-menu" title="Rename set" onClick={() => beginRename("set", set.id, set.name)}><Pencil size={14} /></button>
                          <button className="tiny-menu" title="Delete set" onClick={() => deleteSet(set.id)}><Trash2 size={14} /></button>
                        </div>
                      </div>
                      <div className="set-card-code">
                        {set.code} / COLLECTION
                      </div>
                      <h3>{set.name}</h3>
                      <div className="set-card-foot">
                        <span>{cards.length} unique cards</span>
                        <span>
                          {cards.reduce((sum, card) => sum + card.quantity, 0)}{" "}
                          copies
                        </span>
                      </div>
                      <div className="set-progress">
                        <i
                          style={{
                            width: `${Math.min(cards.length * 12, 100)}%`,
                            background: set.color,
                          }}
                        />
                      </div>
                      <button
                        className="set-open"
                        onClick={() => {
                          setCardSetFilter(set.id);
                          setSection("Cards");
                        }}
                      >
                        Browse set <ArrowRight size={14} />
                      </button>
                    </article>
                  );
                })}
              </div>
            </>
          )}

          {section === "Decks" && (
            <>
              <PageHeading
                eyebrow="DECK BUILDER"
                title="Your decks"
                subtitle="Build, tune, and keep an eye on your strategy."
                action={
                  <button
                    className="button primary"
                    onClick={() => setModal("deck")}
                  >
                    <Plus size={16} /> New deck
                  </button>
                }
              />
              {state.decks.length > 0 ? (
                <div className="deck-layout">
                  <div className="deck-list-panel">
                    {state.decks.map((deck) => (
                      <button
                        key={deck.id}
                        className={`deck-select ${currentDeck?.id === deck.id ? "active" : ""}`}
                        onClick={() => setActiveDeck(deck.id)}
                      >
                        <span className="deck-icon">
                          <BookOpen size={16} />
                        </span>
                        <span>
                          <strong>{deck.name}</strong>
                          <small>{deck.cardIds.length} cards</small>
                        </span>
                        <ChevronRight size={15} />
                      </button>
                    ))}
                  </div>
                  <section className="deck-detail">
                    <div className="deck-detail-head">
                      <div>
                        <span className="section-kicker">ACTIVE DECK</span>
                        <h2>{currentDeck?.name}</h2>
                      </div>
                      <div className="deck-detail-actions">
                        <button className="tiny-menu" title="Rename deck" onClick={() => currentDeck && beginRename("deck", currentDeck.id, currentDeck.name)}><Pencil size={14} /></button>
                        <button className="tiny-menu" title="Delete deck" onClick={() => currentDeck && deleteDeck(currentDeck.id)}><Trash2 size={14} /></button>
                        <button className="button secondary small-button" onClick={() => setSection("Exports")}><Download size={13} /> Export</button>
                      </div>
                    </div>
                    <div className="deck-stats">
                      <div>
                        <span>TOTAL CARDS</span>
                        <strong>{currentDeck?.cardIds.length ?? 0}</strong>
                      </div>
                      <div>
                        <span>UNIQUE</span>
                        <strong>{new Set(currentDeck?.cardIds).size}</strong>
                      </div>
                      <div>
                        <span>AVG. COST</span>
                        <strong>
                          {deckBreakdown.averageCost === undefined ? "—" : deckBreakdown.averageCost.toFixed(1)}
                        </strong>
                      </div>
                    </div>
                    <div className="deck-breakdown">
                      <div><span>TYPES</span>{deckBreakdown.types.map(([name, count]) => <b key={name}>{name} <i>{count}</i></b>)}</div>
                      <div><span>RARITIES</span>{deckBreakdown.rarities.map(([name, count]) => <b key={name}>{name} <i>{count}</i></b>)}</div>
                    </div>
                    <div className="deck-card-list">
                      {deckEntries.length ? (
                        deckEntries.map(({ id, quantity }) => {
                          const card = cardById.get(id);
                          if (!card) return null;
                          return (
                            <div
                              className="deck-card-row"
                              key={id}
                            >
                              <span className="deck-mana">{card.cost}</span>
                              <strong>{card.name}</strong>
                              <span>{card.type}</span>
                              <span>{card.rarity}</span>
                              <span className="deck-quantity"><button title="Remove one copy" onClick={() => currentDeck && updateDeck(currentDeck, id, false)}>−</button><b>{quantity}</b><button title="Add one copy" onClick={() => currentDeck && updateDeck(currentDeck, id, true)}>+</button></span>
                            </div>
                          );
                        })
                      ) : (
                        <div className="empty-deck">
                          <BookOpen size={22} />
                          <span>This deck is waiting for its first card.</span>
                        </div>
                      )}
                    </div>
                    <div className="add-cards-heading">
                      <strong>Add cards</strong>
                      <div className="deck-filters">
                        <div className="search-box">
                          <Search size={14} />
                          <input placeholder="Search cards…" value={deckSearch} onChange={(event) => setDeckSearch(event.target.value)} />
                        </div>
                        <select value={deckType} onChange={(event) => setDeckType(event.target.value)} aria-label="Filter by type">
                          <option value="all">All types</option>
                          {cardTypes.map((type) => <option key={type}>{type}</option>)}
                        </select>
                      </div>
                    </div>
                    {deckCandidates.map((card) => (
                      <div
                        className="deck-card-row available-row"
                        key={card.id}
                      >
                        <span className="deck-mana">{card.cost}</span>
                        <strong>{card.name}</strong>
                        <span>{card.type}</span>
                        <span>{card.rarity}</span>
                        <button
                          className="round-icon small-round"
                          title="Add to deck"
                          onClick={() =>
                            updateDeck(currentDeck!, card.id, true)
                          }
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    ))}
                  </section>
                </div>
              ) : (
                <div className="empty-state">
                  <BookOpen size={24} />
                  <strong>No decks yet</strong>
                  <button
                    className="button primary"
                    onClick={() => setModal("deck")}
                  >
                    <Plus size={15} /> Create your first deck
                  </button>
                </div>
              )}
            </>
          )}

          {section === "Assets" && <AssetsView notify={notify} />}

          {section === "Exports" && (
            <ExportsView presetIds={exportIds} notify={notify} onExportProject={exportProject} />
          )}

          {section === "Settings" && (
            <SettingsView
              notify={notify}
              lastSaved={lastSaved}
              previousSession={previousSession}
              onSaveNow={() => void flush().then(() => notify("Workspace saved"))}
              onRestorePrevious={() => void restorePreviousSession()}
              onExportProject={exportProject}
              onImportProject={(file) => void importProject(file)}
            />
          )}
        </div>
      </main>

      {activeTemplate && (
        <Suspense fallback={<div className="designer-loading">Opening designer</div>}>
          <TemplateDesigner
            key={activeTemplate.id}
            template={activeTemplate}
            card={editorCard}
            project={state}
            onClose={() => setEditingTemplateId(null)}
            onAddAsset={(asset) => state.update((project) => ({ ...project, assets: [asset, ...project.assets] }))}
            onSave={(template) => {
              state.update((project) => ({
                ...project,
                templates: project.templates.map((item) =>
                  item.id === template.id ? template : item,
                ),
              }));
              notify("Template saved");
            }}
          />
        </Suspense>
      )}

      {dialog?.kind === "duplicate" && <DuplicateDialog cardIds={dialog.ids} onClose={() => setDialog(null)} notify={notify} />}
      {dialog?.kind === "bulk-edit" && <BulkEditDialog cardIds={dialog.ids} onClose={() => setDialog(null)} notify={notify} />}
      {dialog?.kind === "add-to-deck" && <AddToDeckDialog cardIds={dialog.ids} onClose={() => setDialog(null)} notify={notify} />}
      {csvImport && <CsvImportDialog fileName={csvImport.fileName} rows={csvImport.rows} onClose={() => setCsvImport(null)} notify={notify} />}

      {modal && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setModal(null);
          }}
        >
          <section className={`modal ${modal === "card" ? "modal-wide" : ""}`} role="dialog" aria-modal="true">
            <div className="modal-heading">
              <div>
                <span className="section-kicker">
                  {modal === "card"
                    ? editingId
                      ? "CARD DETAILS"
                      : "NEW DESIGN"
                    : "WORKSPACE"}
                </span>
                <h2>
                  {modal === "card"
                    ? editingId
                      ? "Edit card"
                      : "Create a card"
                    : modal === "set"
                      ? "Create a set"
                      : modal === "deck"
                        ? "Create a deck"
                        : modal === "template"
                          ? "New template"
                          : `Rename ${renameTarget?.kind ?? "item"}`}
                </h2>
              </div>
              <button
                className="round-icon"
                onClick={() => setModal(null)}
                title="Close (Esc)"
              >
                <X size={17} />
              </button>
            </div>
            {modal === "card" ? (
              <form
                className="card-form card-form-live"
                onSubmit={(event) => {
                  event.preventDefault();
                  saveCard();
                }}
              >
                <div className="card-form-preview">
                  <CardArtwork card={draftCard} project={state} className="card-live-preview" scale={1.2} />
                  <div className="artwork-controls">
                    <button type="button" className="button secondary" onClick={() => artworkInput.current?.click()}>
                      <ImagePlus size={14} /> {selectedArtwork ? "Replace art" : "Upload art"}
                    </button>
                    {selectedArtwork && (
                      <button type="button" className="button secondary" title="Remove artwork" onClick={() => setSelectedArtwork(undefined)}>
                        <X size={14} />
                      </button>
                    )}
                    <input
                      ref={artworkInput}
                      hidden
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      onChange={(event) => {
                        void uploadArtwork(event.target.files?.[0]);
                        event.target.value = "";
                      }}
                    />
                  </div>
                  {artworkAssets.length > 0 && (
                    <label className="field-label">
                      From library
                      <select
                        value={artworkAssets.find((asset) => asset.data === selectedArtwork)?.id ?? ""}
                        onChange={(event) => setSelectedArtwork(artworkAssets.find((asset) => asset.id === event.target.value)?.data)}
                      >
                        <option value="">{selectedArtwork ? "Uploaded image" : "None"}</option>
                        {artworkAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
                      </select>
                    </label>
                  )}
                </div>
                <div className="form-fields">
                  <label className="field-label">
                    Card name
                    <input
                      autoFocus
                      required
                      placeholder="e.g. Mossback Elder"
                      value={form.name}
                      onChange={(event) =>
                        setForm({ ...form, name: event.target.value })
                      }
                    />
                  </label>
                  <div className="field-pair">
                    <label className="field-label">
                      Type
                      <input
                        list="card-types"
                        value={form.type}
                        onChange={(event) => setForm({ ...form, type: event.target.value })}
                      />
                      <datalist id="card-types">
                        {[...new Set(["Creature", "Spell", "Relic", "Token", "Location", ...cardTypes])].map((type) => <option key={type} value={type} />)}
                      </datalist>
                    </label>
                    <label className="field-label">
                      Rarity
                      <select
                        value={form.rarity}
                        onChange={(event) =>
                          setForm({ ...form, rarity: event.target.value })
                        }
                      >
                        <option>Common</option>
                        <option>Uncommon</option>
                        <option>Rare</option>
                        <option>Legendary</option>
                      </select>
                    </label>
                  </div>
                  <div className="field-triple">
                    <label className="field-label">
                      Cost
                      <input type="number" min="0" value={form.cost} onChange={(event) => setForm({ ...form, cost: event.target.value })} />
                    </label>
                    <label className="field-label">
                      Attack
                      <input type="number" min="0" value={form.attack} onChange={(event) => setForm({ ...form, attack: event.target.value })} />
                    </label>
                    <label className="field-label">
                      Health / Defense
                      <input type="number" min="0" value={form.health} onChange={(event) => setForm({ ...form, health: event.target.value })} />
                    </label>
                  </div>
                  <label className="field-label">
                    Rules text
                    <textarea
                      rows={3}
                      placeholder="What makes this card special?"
                      value={form.description}
                      onChange={(event) =>
                        setForm({ ...form, description: event.target.value })
                      }
                    />
                  </label>
                  <div className="field-pair">
                    <label className="field-label">
                      Set
                      <select value={form.setId} onChange={(event) => setForm({ ...form, setId: event.target.value })}>
                        {state.sets.map((set) => <option key={set.id} value={set.id}>{set.name}</option>)}
                      </select>
                    </label>
                    <label className="field-label">
                      Template
                      <select value={form.templateId} onChange={(event) => setForm({ ...form, templateId: event.target.value })}>
                        {state.templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
                      </select>
                    </label>
                  </div>
                  <div className="field-triple">
                    <label className="field-label">
                      Artist
                      <input placeholder="Optional" value={form.artist} onChange={(event) => setForm({ ...form, artist: event.target.value })} />
                    </label>
                    <label className="field-label">
                      Accent
                      <input type="color" value={form.accent} onChange={(event) => setForm({ ...form, accent: event.target.value })} />
                    </label>
                    <label className="field-label">
                      Copies
                      <input type="number" min="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
                    </label>
                  </div>
                  <label className="field-label">
                    Custom fields <small>(one “Key: Value” per line — use as {"{Key}"} in templates)</small>
                    <textarea
                      rows={2}
                      placeholder={"Flavor: Born of ember and ash\nKeyword: Quickstep"}
                      value={form.fields}
                      onChange={(event) => setForm({ ...form, fields: event.target.value })}
                    />
                  </label>
                </div>
                <div className="modal-footer">
                  {editingId && (
                    <>
                      <button type="button" className="button danger" onClick={() => deleteCards([editingId])}><Trash2 size={14} /> Delete</button>
                      <button type="button" className="button secondary" onClick={() => { setModal(null); setDialog({ kind: "duplicate", ids: [editingId] }); }}><Copy size={14} /> Duplicate</button>
                    </>
                  )}
                  <button type="button" className="button secondary" onClick={() => setModal(null)}>
                    Cancel
                  </button>
                  <button type="submit" className="button primary" disabled={!form.name.trim()}>
                    <Check size={15} /> {editingId ? "Save changes" : "Create card"}
                  </button>
                </div>
              </form>
            ) : modal === "rename" && renameTarget ? (
              <SimpleNameForm
                kind={`${renameTarget.kind[0].toUpperCase()}${renameTarget.kind.slice(1)} name`}
                placeholder="Enter a name"
                initialName={renameValue}
                submitLabel="Rename"
                onCancel={() => setModal(null)}
                onSave={saveRename}
              />
            ) : (
              <SimpleNameForm
                kind={
                  modal === "set"
                    ? "Set name"
                    : modal === "deck"
                      ? "Deck name"
                      : "Template name"
                }
                placeholder={
                  modal === "set"
                    ? "e.g. The Verdant Wilds"
                    : modal === "deck"
                      ? "e.g. Grove & Cinder"
                      : "e.g. Field Notes"
                }
                submitLabel="Create"
                onCancel={() => setModal(null)}
                onSave={
                  modal === "set"
                    ? saveSet
                    : modal === "deck"
                      ? saveDeck
                      : saveTemplate
                }
              />
            )}
          </section>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <span>
            <Check size={14} />
          </span>
          {toast}
        </div>
      )}
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: typeof Grid2X2;
  label: string;
  value: string;
  detail: string;
  tone: string;
}) {
  return (
    <article className="stat-card">
      <span className={`stat-icon ${tone}`}>
        <Icon size={17} />
      </span>
      <span className="stat-label">{label}</span>
      <strong>{value}</strong>
      <span className="stat-detail">{detail}</span>
      <span className={`stat-mark ${tone}`}>↗</span>
    </article>
  );
}

function PageHeading({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">
          <span className="eyebrow-line" /> {eyebrow}
        </div>
        <h1>{title}</h1>
        <p className="page-subtitle">{subtitle}</p>
      </div>
      {action && <div className="heading-actions">{action}</div>}
    </div>
  );
}

function SimpleNameForm({
  kind,
  placeholder,
  initialName = "",
  submitLabel,
  onCancel,
  onSave,
}: {
  kind: string;
  placeholder: string;
  initialName?: string;
  submitLabel: string;
  onCancel: () => void;
  onSave: (name: string) => void;
}) {
  const [name, setName] = useState(initialName);
  return (
    <form
      className="simple-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(name);
      }}
    >
      <label className="field-label">
        {kind}
        <input
          autoFocus
          placeholder={placeholder}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <div className="modal-footer">
        <button type="button" className="button secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="button primary" disabled={!name.trim()}>
          <Check size={15} /> {submitLabel}
        </button>
      </div>
    </form>
  );
}

export default App;
