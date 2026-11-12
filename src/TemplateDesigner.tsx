import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  EyeOff,
  Frame,
  Group,
  Hand,
  ImagePlus,
  LockKeyhole,
  Magnet,
  Maximize,
  Redo2,
  Save,
  Square,
  Star,
  Trash2,
  Type,
  Undo2,
  Ungroup,
  Upload,
  Wallpaper,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import Konva from "konva";
import { Layer, Line, Shape, Stage, Transformer } from "react-konva";
import { systemFonts, readFileAsDataUrl } from "./fonts";
import { iconLibraries, iconSvg, svgToDataUrl, type IconLibrary } from "./icons";
import {
  assetCategories,
  blendModes,
  type Asset,
  type BlendMode,
  type Card,
  type Project,
  type Template,
  type TemplateLayer,
} from "./model";
import { cardValues, layerVisibleFor, renderLayerCanvas } from "./render";
import "./designer.css";

type Props = {
  template: Template;
  card: Card;
  project: Project;
  onSave: (template: Template) => void;
  onClose: () => void;
  onAddAsset: (asset: Asset) => void;
};

const CARD_W = 420;
const CARD_H = 588;
// Room around each layer bitmap so shadows and glows are not clipped.
const PADDING = 32;
const SNAP_DISTANCE = 6;
const HISTORY_LIMIT = 100;
const builtInTokens = ["Name", "Description", "Attack", "Defense", "Health", "Cost", "Type", "Rarity", "Artist", "Set", "SetCode"];

type Guide = { orientation: "v" | "h"; position: number };
type AlignMode = "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom";

const normalizeZ = (layers: TemplateLayer[]) =>
  [...layers].sort((a, b) => a.zIndex - b.zIndex).map((layer, zIndex) => ({ ...layer, zIndex }));

const round = (value: number) => Math.round(value * 10) / 10;

/** Draws a layer with the export renderer so the editor preview matches exported cards exactly. */
function LayerObject({
  item,
  card,
  project,
  zoom,
  interactive,
  onSelect,
  registerNode,
  onDragStart,
  onDragMove,
  onDragEnd,
  onTransformEnd,
}: {
  item: TemplateLayer;
  card: Card;
  project: Project;
  zoom: number;
  interactive: boolean;
  onSelect: (id: string, multi: boolean) => void;
  registerNode: (id: string, node: Konva.Node | null) => void;
  onDragStart: (id: string) => void;
  onDragMove: (id: string, node: Konva.Node) => void;
  onDragEnd: (id: string, node: Konva.Node) => void;
  onTransformEnd: (id: string, node: Konva.Node) => void;
}) {
  const [bitmap, setBitmap] = useState<HTMLCanvasElement>();
  useEffect(() => {
    let current = true;
    const ratio = Math.min(4, zoom * (window.devicePixelRatio || 1));
    void renderLayerCanvas(item, card, project, ratio, PADDING).then((canvas) => {
      if (current) setBitmap(canvas);
    });
    return () => {
      current = false;
    };
  }, [item, card, project.assets, project.sets, zoom]);

  return (
    <Shape
      ref={(node) => registerNode(item.id, node)}
      x={item.x + item.width / 2}
      y={item.y + item.height / 2}
      width={item.width}
      height={item.height}
      offsetX={item.width / 2}
      offsetY={item.height / 2}
      rotation={item.rotation}
      opacity={item.opacity}
      globalCompositeOperation={(item.blendMode ?? "source-over") as GlobalCompositeOperation}
      listening={interactive && !item.locked}
      draggable={interactive && !item.locked}
      sceneFunc={(context) => {
        if (bitmap) {
          context.drawImage(
            bitmap,
            -PADDING,
            -PADDING,
            item.width + PADDING * 2,
            item.height + PADDING * 2,
          );
        }
      }}
      hitFunc={(context, shape) => {
        context.beginPath();
        context.rect(0, 0, item.width, item.height);
        context.closePath();
        context.fillStrokeShape(shape);
      }}
      onMouseDown={(event) => {
        event.cancelBubble = true;
        onSelect(item.id, event.evt.shiftKey || event.evt.ctrlKey || event.evt.metaKey);
      }}
      onTap={(event) => {
        event.cancelBubble = true;
        onSelect(item.id, false);
      }}
      onDragStart={() => onDragStart(item.id)}
      onDragMove={(event) => onDragMove(item.id, event.target)}
      onDragEnd={(event) => onDragEnd(item.id, event.target)}
      onTransformEnd={(event) => onTransformEnd(item.id, event.target)}
    />
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="inspector-section">
      <span className="inspector-section-title">{title}</span>
      {children}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <label className="designer-field">
      {label}
      <input
        type="number"
        value={Number.isFinite(value) ? round(value) : 0}
        min={min}
        max={max}
        step={step}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(next);
        }}
      />
    </label>
  );
}

function RangeField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  format = (current: number) => String(round(current)),
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  format?: (value: number) => string;
}) {
  return (
    <label className="designer-field">
      {label} <span className="range-value">{format(value)}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function ColorField({
  label,
  value,
  onChange,
  allowAccent = false,
}: {
  label: string;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  allowAccent?: boolean;
}) {
  const isAccent = value === "{Accent}";
  const hex = value && /^#[0-9a-f]{6}$/i.test(value) ? value : "#000000";
  return (
    <label className="designer-field">
      {label}
      <span className="color-field">
        <input
          type="color"
          value={hex}
          disabled={isAccent}
          onChange={(event) => onChange(event.target.value)}
        />
        {allowAccent && (
          <span className="accent-toggle">
            <input
              type="checkbox"
              checked={isAccent}
              onChange={(event) => onChange(event.target.checked ? "{Accent}" : hex)}
            />
            Accent
          </span>
        )}
      </span>
    </label>
  );
}

export default function TemplateDesigner({ template, card, project, onSave, onClose, onAddAsset }: Props) {
  const [draft, setDraftState] = useState<Template>(() => structuredClone(template));
  const draftRef = useRef(draft);
  const [past, setPast] = useState<Template[]>([]);
  const [future, setFuture] = useState<Template[]>([]);
  const [dirty, setDirty] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [zoom, setZoom] = useState(1);
  const [snap, setSnap] = useState(true);
  const [panMode, setPanMode] = useState(false);
  const [spacePan, setSpacePan] = useState(false);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [previewCardId, setPreviewCardId] = useState(card.id);
  const [iconLibrary, setIconLibrary] = useState<IconLibrary>("lucide");
  const transformerRef = useRef<Konva.Transformer>(null);
  const nodeRefs = useRef<Record<string, Konva.Node>>({});
  const dragOrigin = useRef<Record<string, { x: number; y: number }>>({});
  const dragPrimary = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const panStart = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const svgInput = useRef<HTMLInputElement>(null);

  const previewCard = project.cards.find((item) => item.id === previewCardId) ?? card;
  const selected = draft.layers.find((layer) => layer.id === selectedIds[0]);
  const panning = panMode || spacePan;
  const previewProject = useMemo(
    () => ({
      ...project,
      templates: project.templates.map((item) => (item.id === draft.id ? draft : item)),
    }),
    [project, draft],
  );
  const values = useMemo(() => cardValues(previewCard, project), [previewCard, project]);
  const tokens = useMemo(() => {
    const custom = new Set<string>();
    project.cards.forEach((item) => Object.keys(item.fields ?? {}).forEach((key) => custom.add(key)));
    return [...builtInTokens, ...[...custom].filter((key) => !builtInTokens.includes(key)).sort()];
  }, [project.cards]);
  const fontFamilies = useMemo(
    () => [...new Set([...project.fonts.map((font) => font.family), ...systemFonts])],
    [project.fonts],
  );
  const iconPreviews = useMemo(
    () =>
      iconLibraries[iconLibrary].names.map((name) => ({
        name,
        src: svgToDataUrl(iconSvg(iconLibrary, name, "#d8d4c8") ?? ""),
      })),
    [iconLibrary],
  );
  const iconAssets = project.assets.filter(
    (asset) => asset.category === "Icons" || asset.category === "Symbols" || asset.data.startsWith("data:image/svg"),
  );

  const commit = (update: (current: Template) => Template) => {
    const current = draftRef.current;
    const next = update(current);
    if (next === current) return;
    draftRef.current = next;
    setPast((items) => [...items, current].slice(-HISTORY_LIMIT));
    setFuture([]);
    setDraftState(next);
    setDirty(true);
  };
  const undo = () => {
    const previous = past.at(-1);
    if (!previous) return;
    setPast(past.slice(0, -1));
    setFuture([draftRef.current, ...future].slice(0, HISTORY_LIMIT));
    draftRef.current = previous;
    setDraftState(previous);
    setDirty(true);
  };
  const redo = () => {
    const next = future[0];
    if (!next) return;
    setFuture(future.slice(1));
    setPast([...past, draftRef.current].slice(-HISTORY_LIMIT));
    draftRef.current = next;
    setDraftState(next);
    setDirty(true);
  };
  const updateLayers = (update: (layers: TemplateLayer[]) => TemplateLayer[]) =>
    commit((current) => ({ ...current, layers: update(current.layers) }));
  const patchLayer = (id: string, patch: Partial<TemplateLayer>) =>
    updateLayers((layers) => layers.map((layer) => (layer.id === id ? { ...layer, ...patch } : layer)));
  const save = () => {
    onSave({ ...draftRef.current, updatedAt: Date.now() });
    setDirty(false);
  };
  const requestClose = () => {
    if (dirty && !window.confirm("Discard unsaved changes to this template?")) return;
    onClose();
  };
  const registerNode = (id: string, node: Konva.Node | null) => {
    if (node) nodeRefs.current[id] = node;
    else delete nodeRefs.current[id];
  };

  const zoomTo = (value: number) => setZoom(Math.min(3, Math.max(0.4, round(value))));
  const fitToView = () => {
    const area = scrollRef.current;
    if (!area) return;
    zoomTo(Math.min((area.clientWidth - 64) / CARD_W, (area.clientHeight - 64) / CARD_H));
  };

  useEffect(() => {
    fitToView();
  }, []);

  useEffect(() => {
    const area = scrollRef.current;
    if (!area) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      setZoom((current) => Math.min(3, Math.max(0.4, round(current * (event.deltaY < 0 ? 1.1 : 0.9)))));
    };
    area.addEventListener("wheel", onWheel, { passive: false });
    return () => area.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    const nodes = selectedIds
      .filter((id) => !draft.layers.find((layer) => layer.id === id)?.locked)
      .map((id) => nodeRefs.current[id])
      .filter((node): node is Konva.Node => Boolean(node));
    transformerRef.current?.nodes(nodes);
    transformerRef.current?.getLayer()?.batchDraw();
  }, [selectedIds, draft.layers]);

  const selectLayer = (id: string, multi: boolean) => {
    const layer = draftRef.current.layers.find((item) => item.id === id);
    const ids = layer?.groupId
      ? draftRef.current.layers.filter((item) => item.groupId === layer.groupId).map((item) => item.id)
      : [id];
    setSelectedIds((current) =>
      multi
        ? current.includes(id)
          ? current.filter((value) => !ids.includes(value))
          : [...new Set([...current, ...ids])]
        : current.includes(id) && current.length > 1
          ? current
          : ids,
    );
  };

  const addLayer = (kind: TemplateLayer["kind"], role?: TemplateLayer["role"]) => {
    const base = {
      id: crypto.randomUUID(),
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      zIndex: Number.MAX_SAFE_INTEGER,
    };
    const frameAsset = project.assets.find((asset) => asset.category === "Frames");
    let item: TemplateLayer;
    if (role === "background") {
      item = { ...base, name: "Background", kind: "shape", x: 0, y: 0, width: CARD_W, height: CARD_H, fill: "#1b211d", radius: 25, role, zIndex: -1 };
    } else if (role === "frame") {
      item = frameAsset
        ? { ...base, name: "Frame", kind: "image", x: 0, y: 0, width: CARD_W, height: CARD_H, fit: "stretch", assetId: frameAsset.id, role }
        : { ...base, name: "Frame", kind: "shape", x: 6, y: 6, width: CARD_W - 12, height: CARD_H - 12, stroke: "#c9a46a", strokeWidth: 8, radius: 22, role };
    } else if (kind === "text") {
      item = { ...base, name: "Text", kind, x: 60, y: 150, width: 300, height: 40, text: "{Name}", color: "#f1eadb", fontSize: 22, fontFamily: "Georgia", fontWeight: "400" };
    } else if (kind === "image") {
      item = { ...base, name: "Image", kind, x: 65, y: 110, width: 290, height: 190, fit: "cover", radius: 8 };
    } else if (kind === "icon") {
      item = { ...base, name: "Icon", kind, x: 182, y: 266, width: 56, height: 56, iconLibrary, iconName: iconLibraries[iconLibrary].names[0], color: "#f1eadb" };
    } else {
      item = { ...base, name: "Shape", kind, x: 150, y: 264, width: 120, height: 60, fill: "#d88b60", radius: 8 };
    }
    updateLayers((layers) => normalizeZ([...layers, item]));
    setSelectedIds([item.id]);
  };
  const removeSelected = () => {
    if (!selectedIds.length) return;
    updateLayers((layers) => normalizeZ(layers.filter((layer) => !selectedIds.includes(layer.id))));
    setSelectedIds([]);
  };
  const duplicateSelected = () => {
    if (!selectedIds.length) return;
    const groupMap = new Map<string, string>();
    const top = Math.max(0, ...draft.layers.map((layer) => layer.zIndex));
    const copies = draft.layers
      .filter((layer) => selectedIds.includes(layer.id))
      .sort((a, b) => a.zIndex - b.zIndex)
      .map((layer, index) => {
        if (layer.groupId && !groupMap.has(layer.groupId)) groupMap.set(layer.groupId, crypto.randomUUID());
        return {
          ...layer,
          id: crypto.randomUUID(),
          name: `${layer.name} copy`,
          x: layer.x + 12,
          y: layer.y + 12,
          zIndex: top + index + 1,
          locked: false,
          groupId: layer.groupId ? groupMap.get(layer.groupId) : undefined,
        };
      });
    updateLayers((layers) => normalizeZ([...layers, ...copies]));
    setSelectedIds(copies.map((layer) => layer.id));
  };
  const reorderLayer = (id: string, direction: -1 | 1) => {
    updateLayers((layers) => {
      const ordered = normalizeZ(layers);
      const index = ordered.findIndex((layer) => layer.id === id);
      const next = index + direction;
      if (index < 0 || next < 0 || next >= ordered.length) return layers;
      [ordered[index], ordered[next]] = [ordered[next], ordered[index]];
      return ordered.map((layer, zIndex) => ({ ...layer, zIndex }));
    });
  };
  const toggleGroup = () => {
    if (selectedIds.length < 2) return;
    const chosen = draft.layers.filter((layer) => selectedIds.includes(layer.id));
    const shared = chosen[0].groupId && chosen.every((layer) => layer.groupId === chosen[0].groupId);
    const groupId = shared ? undefined : crypto.randomUUID();
    updateLayers((layers) => layers.map((layer) => (selectedIds.includes(layer.id) ? { ...layer, groupId } : layer)));
  };
  const nudge = (dx: number, dy: number) =>
    updateLayers((layers) =>
      layers.map((layer) =>
        selectedIds.includes(layer.id) && !layer.locked ? { ...layer, x: layer.x + dx, y: layer.y + dy } : layer,
      ),
    );

  const alignSelected = (mode: AlignMode) => {
    const targets = draft.layers.filter((layer) => selectedIds.includes(layer.id) && !layer.locked);
    if (!targets.length) return;
    const bounds =
      targets.length === 1
        ? { left: 0, top: 0, right: CARD_W, bottom: CARD_H }
        : {
            left: Math.min(...targets.map((layer) => layer.x)),
            top: Math.min(...targets.map((layer) => layer.y)),
            right: Math.max(...targets.map((layer) => layer.x + layer.width)),
            bottom: Math.max(...targets.map((layer) => layer.y + layer.height)),
          };
    updateLayers((layers) =>
      layers.map((layer) => {
        if (!targets.some((target) => target.id === layer.id)) return layer;
        if (mode === "left") return { ...layer, x: bounds.left };
        if (mode === "hcenter") return { ...layer, x: (bounds.left + bounds.right) / 2 - layer.width / 2 };
        if (mode === "right") return { ...layer, x: bounds.right - layer.width };
        if (mode === "top") return { ...layer, y: bounds.top };
        if (mode === "vcenter") return { ...layer, y: (bounds.top + bounds.bottom) / 2 - layer.height / 2 };
        return { ...layer, y: bounds.bottom - layer.height };
      }),
    );
  };
  const distribute = (axis: "x" | "y") => {
    const size = axis === "x" ? "width" : "height";
    const targets = draft.layers
      .filter((layer) => selectedIds.includes(layer.id) && !layer.locked)
      .sort((a, b) => a[axis] + a[size] / 2 - (b[axis] + b[size] / 2));
    if (targets.length < 3) return;
    const first = targets[0][axis] + targets[0][size] / 2;
    const last = targets.at(-1)![axis] + targets.at(-1)![size] / 2;
    const step = (last - first) / (targets.length - 1);
    const positions = new Map(targets.map((layer, index) => [layer.id, first + step * index - layer[size] / 2]));
    updateLayers((layers) =>
      layers.map((layer) => (positions.has(layer.id) ? { ...layer, [axis]: positions.get(layer.id)! } : layer)),
    );
  };

  const movingIds = (id: string) => {
    const layer = draftRef.current.layers.find((item) => item.id === id);
    if (layer?.groupId) {
      return draftRef.current.layers.filter((item) => item.groupId === layer.groupId && !item.locked).map((item) => item.id);
    }
    return selectedIds.includes(id) && selectedIds.length > 1 ? selectedIds : [id];
  };
  const handleDragStart = (id: string) => {
    if (dragPrimary.current) return;
    dragPrimary.current = id;
    const ids = movingIds(id);
    if (!ids.every((value) => selectedIds.includes(value))) setSelectedIds(ids);
    dragOrigin.current = Object.fromEntries(
      ids.map((value) => [value, { x: nodeRefs.current[value]?.x() ?? 0, y: nodeRefs.current[value]?.y() ?? 0 }]),
    );
  };
  const handleDragMove = (id: string, node: Konva.Node) => {
    if (dragPrimary.current !== id) return;
    const layer = draftRef.current.layers.find((item) => item.id === id);
    const origin = dragOrigin.current[id];
    if (!layer || !origin) return;
    const ids = Object.keys(dragOrigin.current);
    const nextGuides: Guide[] = [];
    if (snap) {
      const xs = [0, CARD_W / 2, CARD_W];
      const ys = [0, CARD_H / 2, CARD_H];
      for (const other of draftRef.current.layers) {
        if (ids.includes(other.id) || !other.visible) continue;
        xs.push(other.x, other.x + other.width / 2, other.x + other.width);
        ys.push(other.y, other.y + other.height / 2, other.y + other.height);
      }
      const threshold = SNAP_DISTANCE / zoom;
      const snapAxis = (start: number, size: number, stops: number[], orientation: Guide["orientation"]) => {
        let best: { delta: number; position: number } | undefined;
        for (const edge of [start, start + size / 2, start + size]) {
          for (const stop of stops) {
            const delta = stop - edge;
            if (Math.abs(delta) <= threshold && (!best || Math.abs(delta) < Math.abs(best.delta))) {
              best = { delta, position: stop };
            }
          }
        }
        if (!best) return start;
        nextGuides.push({ orientation, position: best.position });
        return start + best.delta;
      };
      const left = snapAxis(node.x() - layer.width / 2, layer.width, xs, "v");
      const top = snapAxis(node.y() - layer.height / 2, layer.height, ys, "h");
      node.position({ x: left + layer.width / 2, y: top + layer.height / 2 });
    }
    setGuides(nextGuides);
    const dx = node.x() - origin.x;
    const dy = node.y() - origin.y;
    for (const other of ids) {
      if (other === id) continue;
      const start = dragOrigin.current[other];
      nodeRefs.current[other]?.position({ x: start.x + dx, y: start.y + dy });
    }
  };
  const handleDragEnd = (id: string, node: Konva.Node) => {
    if (dragPrimary.current !== id) return;
    dragPrimary.current = null;
    setGuides([]);
    const origin = dragOrigin.current[id];
    const ids = Object.keys(dragOrigin.current);
    dragOrigin.current = {};
    if (!origin) return;
    const dx = node.x() - origin.x;
    const dy = node.y() - origin.y;
    if (!dx && !dy) return;
    updateLayers((layers) =>
      layers.map((layer) => (ids.includes(layer.id) ? { ...layer, x: round(layer.x + dx), y: round(layer.y + dy) } : layer)),
    );
  };
  const handleTransformEnd = (id: string, node: Konva.Node) => {
    const layer = draftRef.current.layers.find((item) => item.id === id);
    if (!layer) return;
    const width = Math.max(8, layer.width * node.scaleX());
    const height = Math.max(8, layer.height * node.scaleY());
    node.scale({ x: 1, y: 1 });
    patchLayer(id, {
      width: round(width),
      height: round(height),
      x: round(node.x() - width / 2),
      y: round(node.y() - height / 2),
      rotation: round(node.rotation()),
    });
  };

  const uploadToLayer = async (file: File | undefined, target: "image" | "icon") => {
    if (!file || !selected) return;
    const data = await readFileAsDataUrl(file);
    const category =
      target === "icon" ? "Icons" : selected.role === "frame" ? "Frames" : selected.role === "background" ? "Backgrounds" : "Artwork";
    const asset: Asset = { id: `asset-${crypto.randomUUID()}`, name: file.name, category, data, size: file.size, tags: [], folder: "" };
    onAddAsset(asset);
    if (target === "icon") patchLayer(selected.id, { imageData: data, iconName: undefined });
    else patchLayer(selected.id, { assetId: asset.id, imageData: undefined });
  };

  useEffect(() => {
    const isTyping = (target: EventTarget | null) =>
      target instanceof HTMLElement && target.matches("input, textarea, select, [contenteditable]");
    const onKeyDown = (event: KeyboardEvent) => {
      event.stopPropagation();
      if (event.key === "Escape") {
        if (isTyping(event.target)) (event.target as HTMLElement).blur();
        else requestClose();
        return;
      }
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (mod && key === "s") {
        event.preventDefault();
        save();
        return;
      }
      if (isTyping(event.target)) return;
      if (event.code === "Space") {
        event.preventDefault();
        setSpacePan(true);
      } else if (mod && key === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (mod && key === "y") {
        event.preventDefault();
        redo();
      } else if (mod && key === "d") {
        event.preventDefault();
        duplicateSelected();
      } else if (mod && key === "g") {
        event.preventDefault();
        toggleGroup();
      } else if (mod && key === "a") {
        event.preventDefault();
        setSelectedIds(draft.layers.filter((layer) => !layer.locked).map((layer) => layer.id));
      } else if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        removeSelected();
      } else if (event.key.startsWith("Arrow") && selectedIds.length) {
        event.preventDefault();
        const step = event.shiftKey ? 10 : 1;
        nudge(
          event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0,
          event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0,
        );
      } else if (!mod && key === "h") {
        setPanMode((current) => !current);
      } else if (!mod && (event.key === "+" || event.key === "=")) {
        zoomTo(zoom + 0.1);
      } else if (!mod && event.key === "-") {
        zoomTo(zoom - 0.1);
      } else if (!mod && event.key === "0") {
        fitToView();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") setSpacePan(false);
    };
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
    };
  });

  const orderedLayers = useMemo(() => [...draft.layers].sort((a, b) => a.zIndex - b.zIndex), [draft.layers]);
  const kindIcon = (layer: TemplateLayer) =>
    layer.role === "background" ? (
      <Wallpaper size={13} />
    ) : layer.role === "frame" ? (
      <Frame size={13} />
    ) : layer.kind === "text" ? (
      <Type size={13} />
    ) : layer.kind === "image" ? (
      <ImagePlus size={13} />
    ) : layer.kind === "shape" ? (
      <Square size={12} />
    ) : (
      <Star size={12} />
    );
  const imageSourceValue = selected?.assetId ? `asset:${selected.assetId}` : selected?.imageData ? "embedded" : "card";

  return (
    <div className="designer-shell">
      <header className="designer-topbar">
        <div className="designer-title">
          <button className="icon-button" onClick={requestClose} title="Close designer (Esc)">
            <X size={17} />
          </button>
          <span className="designer-title-mark"><Square size={16} /></span>
          <label>
            <span className="section-kicker">TEMPLATE DESIGNER{dirty ? " · UNSAVED" : ""}</span>
            <input
              value={draft.name}
              aria-label="Template name"
              onChange={(event) => commit((current) => ({ ...current, name: event.target.value }))}
            />
          </label>
        </div>
        <div className="designer-top-actions">
          <button className="icon-button" title="Undo (Ctrl+Z)" disabled={!past.length} onClick={undo}><Undo2 size={16} /></button>
          <button className="icon-button" title="Redo (Ctrl+Shift+Z)" disabled={!future.length} onClick={redo}><Redo2 size={16} /></button>
          <button className={`button secondary ${snap ? "selected" : ""}`} onClick={() => setSnap(!snap)} title="Snap to card and layer edges">
            <Magnet size={15} /> Snap {snap ? "on" : "off"}
          </button>
          <button className="button primary" onClick={save} title="Save (Ctrl+S)">
            <Save size={15} /> {dirty ? "Save template" : "Saved"}
          </button>
        </div>
      </header>

      <div className="designer-workspace">
        <aside className="designer-layers">
          <div className="designer-panel-heading">
            <span>LAYERS</span>
            <span>{draft.layers.length}</span>
          </div>
          <div className="layer-add-actions">
            <button onClick={() => addLayer("text")} title="Add text layer"><Type size={15} /></button>
            <button onClick={() => addLayer("image")} title="Add image layer"><ImagePlus size={15} /></button>
            <button onClick={() => addLayer("shape")} title="Add shape layer"><Square size={15} /></button>
            <button onClick={() => addLayer("icon")} title="Add icon layer"><Star size={15} /></button>
            <button onClick={() => addLayer("shape", "background")} title="Add background layer"><Wallpaper size={15} /></button>
            <button onClick={() => addLayer("image", "frame")} title="Add frame layer"><Frame size={15} /></button>
          </div>
          <div className="designer-layer-list">
            {[...orderedLayers].reverse().map((layer) => (
              <div key={layer.id} className={`designer-layer-row ${selectedIds.includes(layer.id) ? "active" : ""} ${layerVisibleFor(layer, values) ? "" : "is-conditional"}`}>
                <button className="layer-select" onClick={(event) => selectLayer(layer.id, event.shiftKey || event.ctrlKey || event.metaKey)}>
                  <span className={`layer-type-mark ${layer.kind}`}>{kindIcon(layer)}</span>
                  <span className="layer-row-name">{layer.name}{layer.groupId && <small>GROUP</small>}{layer.showWhen && <small>IF</small>}</span>
                </button>
                <button className="layer-visibility" title={layer.visible ? "Hide layer" : "Show layer"} onClick={() => patchLayer(layer.id, { visible: !layer.visible })}>{layer.visible ? <Eye size={14} /> : <EyeOff size={14} />}</button>
                <button className={`layer-visibility ${layer.locked ? "is-locked" : ""}`} title={layer.locked ? "Unlock layer" : "Lock layer"} onClick={() => patchLayer(layer.id, { locked: !layer.locked })}><LockKeyhole size={13} /></button>
              </div>
            ))}
          </div>
          <div className="layer-footer-actions">
            <button disabled={!selectedIds.length} title="Duplicate (Ctrl+D)" onClick={duplicateSelected}><Copy size={14} /></button>
            <button disabled={selectedIds.length < 2} title="Group / ungroup (Ctrl+G)" onClick={toggleGroup}>{selected?.groupId ? <Ungroup size={14} /> : <Group size={14} />}</button>
            <button disabled={!selected} title="Move layer up" onClick={() => selected && reorderLayer(selected.id, 1)}><ChevronUp size={15} /></button>
            <button disabled={!selected} title="Move layer down" onClick={() => selected && reorderLayer(selected.id, -1)}><ChevronDown size={15} /></button>
            <button disabled={!selectedIds.length} title="Delete (Del)" onClick={removeSelected}><Trash2 size={14} /></button>
          </div>
        </aside>

        <main className="designer-stage-area">
          <div className="designer-stage-toolbar">
            <div className="stage-tool-group" aria-label="Alignment">
              <button title="Align left" disabled={!selectedIds.length} onClick={() => alignSelected("left")}><AlignStartVertical size={14} /></button>
              <button title="Align horizontal centers" disabled={!selectedIds.length} onClick={() => alignSelected("hcenter")}><AlignCenterVertical size={14} /></button>
              <button title="Align right" disabled={!selectedIds.length} onClick={() => alignSelected("right")}><AlignEndVertical size={14} /></button>
              <button title="Align top" disabled={!selectedIds.length} onClick={() => alignSelected("top")}><AlignStartHorizontal size={14} /></button>
              <button title="Align vertical centers" disabled={!selectedIds.length} onClick={() => alignSelected("vcenter")}><AlignCenterHorizontal size={14} /></button>
              <button title="Align bottom" disabled={!selectedIds.length} onClick={() => alignSelected("bottom")}><AlignEndHorizontal size={14} /></button>
              <button title="Distribute horizontally (3+ layers)" disabled={selectedIds.length < 3} onClick={() => distribute("x")}><AlignHorizontalDistributeCenter size={14} /></button>
              <button title="Distribute vertically (3+ layers)" disabled={selectedIds.length < 3} onClick={() => distribute("y")}><AlignVerticalDistributeCenter size={14} /></button>
            </div>
            <label className="preview-card-picker">
              Preview
              <select value={previewCard.id} onChange={(event) => setPreviewCardId(event.target.value)}>
                {project.cards.slice(0, 500).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <div className="stage-tool-group">
              <button className={panning ? "active" : ""} title="Pan (H, or hold Space)" onClick={() => setPanMode(!panMode)}><Hand size={14} /></button>
              <button title="Zoom out (-)" onClick={() => zoomTo(zoom - 0.1)}><ZoomOut size={15} /></button>
              <span>{Math.round(zoom * 100)}%</span>
              <button title="Zoom in (+)" onClick={() => zoomTo(zoom + 0.1)}><ZoomIn size={15} /></button>
              <button title="Fit to view (0)" onClick={fitToView}><Maximize size={14} /></button>
            </div>
          </div>
          <div
            ref={scrollRef}
            className={`designer-stage-scroll ${panning ? "is-panning" : ""}`}
            onPointerDown={(event) => {
              if (!panning || !scrollRef.current) return;
              panStart.current = { x: event.clientX, y: event.clientY, left: scrollRef.current.scrollLeft, top: scrollRef.current.scrollTop };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              const start = panStart.current;
              if (!start || !scrollRef.current) return;
              scrollRef.current.scrollLeft = start.left - (event.clientX - start.x);
              scrollRef.current.scrollTop = start.top - (event.clientY - start.y);
            }}
            onPointerUp={() => {
              panStart.current = null;
            }}
          >
            <div className="designer-stage-pad">
              <div className="designer-stage-wrap" style={{ width: CARD_W * zoom, height: CARD_H * zoom }}>
                <Stage
                  width={CARD_W * zoom}
                  height={CARD_H * zoom}
                  scaleX={zoom}
                  scaleY={zoom}
                  listening={!panning}
                  onMouseDown={(event) => {
                    if (event.target === event.target.getStage()) setSelectedIds([]);
                  }}
                  onTouchStart={(event) => {
                    if (event.target === event.target.getStage()) setSelectedIds([]);
                  }}
                >
                  <Layer>
                    {orderedLayers
                      .filter((layer) => layer.visible && layerVisibleFor(layer, values))
                      .map((layer) => (
                        <LayerObject
                          key={layer.id}
                          item={layer}
                          card={previewCard}
                          project={previewProject}
                          zoom={zoom}
                          interactive={!panning}
                          onSelect={selectLayer}
                          registerNode={registerNode}
                          onDragStart={handleDragStart}
                          onDragMove={handleDragMove}
                          onDragEnd={handleDragEnd}
                          onTransformEnd={handleTransformEnd}
                        />
                      ))}
                    {guides.map((guide, index) => (
                      <Line
                        key={index}
                        points={guide.orientation === "v" ? [guide.position, 0, guide.position, CARD_H] : [0, guide.position, CARD_W, guide.position]}
                        stroke="#4fc3f7"
                        strokeWidth={1 / zoom}
                        dash={[4 / zoom, 4 / zoom]}
                        listening={false}
                      />
                    ))}
                    <Transformer
                      ref={transformerRef}
                      rotateEnabled
                      flipEnabled={false}
                      keepRatio={false}
                      rotationSnaps={snap ? [0, 45, 90, 135, 180, 225, 270, 315] : []}
                      enabledAnchors={["top-left", "top-right", "bottom-left", "bottom-right", "middle-left", "middle-right", "top-center", "bottom-center"]}
                      boundBoxFunc={(oldBox, newBox) => (Math.abs(newBox.width) < 8 || Math.abs(newBox.height) < 8 ? oldBox : newBox)}
                      borderStroke="#e6a174"
                      anchorFill="#f1d2b7"
                      anchorStroke="#38291f"
                      anchorSize={8}
                      rotateAnchorOffset={22}
                    />
                  </Layer>
                </Stage>
              </div>
            </div>
          </div>
          <div className="designer-stage-hint">420 × 588 px · 63 × 88 mm <span>·</span> {selectedIds.length ? `${selectedIds.length} layer${selectedIds.length === 1 ? "" : "s"} selected` : "Shift-click to multi-select"} <span>·</span> Arrows nudge · Space pans · Ctrl+wheel zooms</div>
        </main>

        <aside className="designer-inspector">
          <div className="designer-panel-heading"><span>PROPERTIES</span>{selected && <span>{selected.role ? selected.role.toUpperCase() : selected.kind.toUpperCase()}</span>}</div>
          {selected ? (
            <div className="layer-inspector">
              <label className="designer-field">Layer name<input value={selected.name} onChange={(event) => patchLayer(selected.id, { name: event.target.value })} /></label>

              {selected.kind === "text" && (
                <Section title="Text">
                  <label className="designer-field">
                    Content
                    <textarea rows={3} value={selected.text ?? ""} onChange={(event) => patchLayer(selected.id, { text: event.target.value })} />
                  </label>
                  <div className="token-chips" aria-label="Insert placeholder">
                    {tokens.map((token) => (
                      <button key={token} onClick={() => patchLayer(selected.id, { text: `${selected.text ?? ""}{${token}}` })}>{`{${token}}`}</button>
                    ))}
                  </div>
                  <label className="designer-field">
                    Font
                    <select value={selected.fontFamily ?? "Georgia"} onChange={(event) => patchLayer(selected.id, { fontFamily: event.target.value })}>
                      {[...new Set([selected.fontFamily ?? "Georgia", ...fontFamilies])].map((family) => (
                        <option key={family} value={family} style={{ fontFamily: family }}>{family}</option>
                      ))}
                    </select>
                  </label>
                  <div className="designer-field-row">
                    <NumberField label="Size" min={4} max={200} value={selected.fontSize ?? 16} onChange={(fontSize) => patchLayer(selected.id, { fontSize })} />
                    <label className="designer-field">
                      Weight
                      <select value={selected.fontWeight === "normal" ? "400" : selected.fontWeight ?? "400"} onChange={(event) => patchLayer(selected.id, { fontWeight: event.target.value })}>
                        {["300", "400", "500", "600", "700", "800", "900"].map((weight) => <option key={weight} value={weight}>{weight}</option>)}
                      </select>
                    </label>
                  </div>
                  <div className="designer-field-row">
                    <ColorField label="Color" allowAccent value={selected.color} onChange={(color) => patchLayer(selected.id, { color })} />
                    <label className="designer-field">
                      Align
                      <select value={selected.align ?? "left"} onChange={(event) => patchLayer(selected.id, { align: event.target.value as TemplateLayer["align"] })}>
                        <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
                      </select>
                    </label>
                  </div>
                  <div className="designer-field-row">
                    <NumberField label="Letter spacing" step={0.5} value={selected.letterSpacing ?? 0} onChange={(letterSpacing) => patchLayer(selected.id, { letterSpacing })} />
                    <NumberField label="Line height" step={0.05} min={0.6} max={3} value={selected.lineHeight ?? 1.28} onChange={(lineHeight) => patchLayer(selected.id, { lineHeight })} />
                  </div>
                  <label className="designer-check">
                    <input type="checkbox" checked={selected.textTransform === "uppercase"} onChange={(event) => patchLayer(selected.id, { textTransform: event.target.checked ? "uppercase" : "none" })} />
                    Uppercase
                  </label>
                </Section>
              )}

              {selected.kind === "text" && (
                <Section title="Stroke & glow">
                  <div className="designer-field-row">
                    <ColorField label="Stroke" value={selected.textStroke ?? "#000000"} onChange={(textStroke) => patchLayer(selected.id, { textStroke })} />
                    <NumberField label="Stroke width" min={0} max={20} step={0.5} value={selected.textStrokeWidth ?? 0} onChange={(textStrokeWidth) => patchLayer(selected.id, { textStrokeWidth, textStroke: selected.textStroke ?? "#000000" })} />
                  </div>
                  <div className="designer-field-row">
                    <ColorField label="Glow" value={selected.glowColor ?? "#ffd28a"} onChange={(glowColor) => patchLayer(selected.id, { glowColor })} />
                    <NumberField label="Glow size" min={0} max={60} value={selected.glowBlur ?? 0} onChange={(glowBlur) => patchLayer(selected.id, { glowBlur, glowColor: selected.glowColor ?? "#ffd28a" })} />
                  </div>
                </Section>
              )}

              {selected.kind === "icon" && (
                <Section title="Icon">
                  <label className="designer-field">
                    Library
                    <select value={iconLibrary} onChange={(event) => setIconLibrary(event.target.value as IconLibrary)}>
                      {(Object.keys(iconLibraries) as IconLibrary[]).map((library) => <option key={library} value={library}>{iconLibraries[library].label}</option>)}
                    </select>
                  </label>
                  <div className="icon-grid">
                    {iconPreviews.map((icon) => (
                      <button
                        key={icon.name}
                        title={icon.name}
                        className={selected.iconLibrary === iconLibrary && selected.iconName === icon.name && !selected.imageData ? "active" : ""}
                        onClick={() => patchLayer(selected.id, { iconLibrary, iconName: icon.name, imageData: undefined, name: `Icon · ${icon.name}` })}
                      >
                        <img src={icon.src} alt={icon.name} />
                      </button>
                    ))}
                    {iconAssets.map((asset) => (
                      <button key={asset.id} title={asset.name} className={selected.imageData === asset.data ? "active" : ""} onClick={() => patchLayer(selected.id, { imageData: asset.data, iconName: undefined })}>
                        <img src={asset.data} alt={asset.name} />
                      </button>
                    ))}
                  </div>
                  <button className="button secondary" onClick={() => svgInput.current?.click()}><Upload size={14} /> Upload SVG</button>
                  <input ref={svgInput} hidden type="file" accept=".svg,image/svg+xml" onChange={(event) => void uploadToLayer(event.target.files?.[0], "icon")} />
                  <ColorField label="Color" allowAccent value={selected.color} onChange={(color) => patchLayer(selected.id, { color })} />
                </Section>
              )}

              {selected.kind === "image" && (
                <Section title="Image">
                  <label className="designer-field">
                    Source
                    <select
                      value={imageSourceValue}
                      onChange={(event) => {
                        const value = event.target.value;
                        if (value === "card") patchLayer(selected.id, { assetId: undefined, imageData: undefined });
                        else if (value.startsWith("asset:")) patchLayer(selected.id, { assetId: value.slice(6), imageData: undefined });
                      }}
                    >
                      <option value="card">Card artwork (per card)</option>
                      {selected.imageData && <option value="embedded">Embedded image</option>}
                      {assetCategories.map((category) => {
                        const items = project.assets.filter((asset) => asset.category === category);
                        return items.length ? (
                          <optgroup key={category} label={category}>
                            {items.map((asset) => <option key={asset.id} value={`asset:${asset.id}`}>{asset.name}</option>)}
                          </optgroup>
                        ) : null;
                      })}
                    </select>
                  </label>
                  <button className="button secondary" onClick={() => imageInput.current?.click()}><Upload size={14} /> Upload image</button>
                  <input ref={imageInput} hidden type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={(event) => void uploadToLayer(event.target.files?.[0], "image")} />
                  <label className="designer-field">
                    Fit
                    <select value={selected.fit ?? "stretch"} onChange={(event) => patchLayer(selected.id, { fit: event.target.value as TemplateLayer["fit"] })}>
                      <option value="cover">Fill (crop)</option><option value="contain">Fit inside</option><option value="stretch">Stretch</option>
                    </select>
                  </label>
                  {selected.fit && selected.fit !== "stretch" && (
                    <>
                      <RangeField label="Crop zoom" min={0.5} max={4} step={0.05} value={selected.cropZoom ?? 1} format={(value) => `${Math.round(value * 100)}%`} onChange={(cropZoom) => patchLayer(selected.id, { cropZoom })} />
                      <RangeField label="Crop horizontal" min={-1} max={1} step={0.02} value={selected.cropX ?? 0} format={(value) => `${Math.round(value * 100)}`} onChange={(cropX) => patchLayer(selected.id, { cropX })} />
                      <RangeField label="Crop vertical" min={-1} max={1} step={0.02} value={selected.cropY ?? 0} format={(value) => `${Math.round(value * 100)}`} onChange={(cropY) => patchLayer(selected.id, { cropY })} />
                    </>
                  )}
                </Section>
              )}

              {selected.kind === "shape" && (
                <Section title="Shape">
                  <div className="designer-field-row">
                    <ColorField label="Fill" allowAccent value={selected.fill} onChange={(fill) => patchLayer(selected.id, { fill })} />
                    <label className="designer-check">
                      <input type="checkbox" checked={!selected.fill} onChange={(event) => patchLayer(selected.id, { fill: event.target.checked ? undefined : "#d88b60" })} />
                      No fill
                    </label>
                  </div>
                  <div className="designer-field-row">
                    <ColorField label="Outline" allowAccent value={selected.stroke ?? "#000000"} onChange={(stroke) => patchLayer(selected.id, { stroke })} />
                    <NumberField label="Outline width" min={0} max={40} value={selected.strokeWidth ?? 0} onChange={(strokeWidth) => patchLayer(selected.id, { strokeWidth, stroke: selected.stroke ?? "#000000" })} />
                  </div>
                </Section>
              )}

              {(selected.kind === "image" || selected.kind === "shape") && (
                <Section title="Mask">
                  <div className="designer-field-row">
                    <label className="designer-field">
                      Shape
                      <select value={selected.mask ?? "none"} onChange={(event) => patchLayer(selected.id, { mask: event.target.value as TemplateLayer["mask"] })}>
                        <option value="none">Rounded rectangle</option><option value="ellipse">Ellipse</option>
                      </select>
                    </label>
                    <NumberField label="Corner radius" min={0} max={300} value={selected.radius ?? 0} onChange={(radius) => patchLayer(selected.id, { radius })} />
                  </div>
                </Section>
              )}

              {(selected.kind === "text" || selected.kind === "icon") && (
                <Section title="Shadow">
                  <div className="designer-field-row">
                    <ColorField label="Color" value={selected.shadowColor ?? "#000000"} onChange={(shadowColor) => patchLayer(selected.id, { shadowColor })} />
                    <NumberField label="Blur" min={0} max={60} value={selected.shadowBlur ?? 0} onChange={(shadowBlur) => patchLayer(selected.id, { shadowBlur, shadowColor: selected.shadowColor ?? "#000000" })} />
                  </div>
                  <NumberField label="Offset" min={-30} max={30} value={selected.shadowOffset ?? 0} onChange={(shadowOffset) => patchLayer(selected.id, { shadowOffset, shadowColor: selected.shadowColor ?? "#000000" })} />
                </Section>
              )}

              <Section title="Transform">
                <div className="designer-field-row">
                  <NumberField label="X" value={selected.x} onChange={(x) => patchLayer(selected.id, { x })} />
                  <NumberField label="Y" value={selected.y} onChange={(y) => patchLayer(selected.id, { y })} />
                </div>
                <div className="designer-field-row">
                  <NumberField label="Width" min={8} value={selected.width} onChange={(width) => patchLayer(selected.id, { width: Math.max(8, width) })} />
                  <NumberField label="Height" min={8} value={selected.height} onChange={(height) => patchLayer(selected.id, { height: Math.max(8, height) })} />
                </div>
                <RangeField label="Rotation" min={-180} max={180} value={selected.rotation} format={(value) => `${Math.round(value)}°`} onChange={(rotation) => patchLayer(selected.id, { rotation })} />
              </Section>

              <Section title="Appearance">
                <RangeField label="Opacity" min={0} max={1} step={0.01} value={selected.opacity} format={(value) => `${Math.round(value * 100)}%`} onChange={(opacity) => patchLayer(selected.id, { opacity })} />
                <label className="designer-field">
                  Blend mode
                  <select value={selected.blendMode ?? "source-over"} onChange={(event) => patchLayer(selected.id, { blendMode: event.target.value as BlendMode })}>
                    {blendModes.map((mode) => <option key={mode} value={mode}>{mode === "source-over" ? "Normal" : mode.replace(/-/g, " ")}</option>)}
                  </select>
                </label>
                <label className="designer-field">
                  Layer role
                  <select value={selected.role ?? ""} onChange={(event) => patchLayer(selected.id, { role: (event.target.value || undefined) as TemplateLayer["role"] })}>
                    <option value="">Content</option><option value="background">Background (hidden in transparent PNG)</option><option value="frame">Frame</option>
                  </select>
                </label>
              </Section>

              <Section title="Show only when">
                <div className="designer-field-row">
                  <label className="designer-field">
                    Field
                    <select value={selected.showWhen?.field ?? ""} onChange={(event) => patchLayer(selected.id, { showWhen: event.target.value ? { field: event.target.value, equals: selected.showWhen?.equals ?? "*" } : undefined })}>
                      <option value="">Always show</option>
                      {tokens.map((token) => <option key={token} value={token}>{token}</option>)}
                    </select>
                  </label>
                  <label className="designer-field">
                    Equals
                    <input disabled={!selected.showWhen} placeholder="* = not empty" value={selected.showWhen?.equals ?? ""} onChange={(event) => selected.showWhen && patchLayer(selected.id, { showWhen: { ...selected.showWhen, equals: event.target.value } })} />
                  </label>
                </div>
              </Section>

              <button className="button secondary inspector-delete" onClick={removeSelected}><Trash2 size={14} /> Delete layer</button>
            </div>
          ) : (
            <div className="inspector-empty">
              <Square size={19} />
              <span>Select a layer to edit its properties.</span>
              <label className="designer-field template-description">
                Template description
                <input value={draft.description} onChange={(event) => commit((current) => ({ ...current, description: event.target.value }))} />
              </label>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}