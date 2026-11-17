import type { Asset, Template, TemplateLayer } from "./model";
import { uid } from "./model";
import { CARD_HEIGHT, CARD_WIDTH } from "./render";

export const CARD_RATIO = CARD_WIDTH / CARD_HEIGHT;
const OUTPUT_SCALE = 3;
const SAMPLE_SCALE = 3;
const SAMPLE_W = CARD_WIDTH / SAMPLE_SCALE;
const SAMPLE_H = CARD_HEIGHT / SAMPLE_SCALE;

export type RegionRole =
  | "artwork"
  | "name"
  | "cost"
  | "type"
  | "rules"
  | "attack"
  | "health"
  | "stats"
  | "artist"
  | "set"
  | "number"
  | "rarityIcon"
  | "typeIcon"
  | "setIcon"
  | "icon";

export const regionRoles: { role: RegionRole; label: string }[] = [
  { role: "artwork", label: "Artwork" },
  { role: "name", label: "Name" },
  { role: "cost", label: "Cost" },
  { role: "type", label: "Type line" },
  { role: "rules", label: "Rules text" },
  { role: "attack", label: "Attack" },
  { role: "health", label: "Health" },
  { role: "stats", label: "Attack / Health" },
  { role: "artist", label: "Artist" },
  { role: "set", label: "Set details" },
  { role: "number", label: "Custom number" },
  { role: "rarityIcon", label: "Rarity icon" },
  { role: "typeIcon", label: "Type icon" },
  { role: "setIcon", label: "Set icon" },
  { role: "icon", label: "Icon" },
];

export const roleLabel = (role: RegionRole) => regionRoles.find((item) => item.role === role)?.label ?? role;

export type IconUpload = { data: string; name: string; size: number };

export type Region = {
  id: string;
  role: RegionRole;
  x: number;
  y: number;
  width: number;
  height: number;
  enabled: boolean;
  detected: boolean;
  textColor: string;
  /** Keyed by variant value; "" holds the single icon of a generic box. */
  icons: Record<string, IconUpload>;
};

export type CropRect = { x: number; y: number; width: number; height: number };

export const iconVariantField = (role: RegionRole): "Rarity" | "Type" | "Set" | undefined =>
  role === "rarityIcon" ? "Rarity" : role === "typeIcon" ? "Type" : role === "setIcon" ? "Set" : undefined;

export const isIconRole = (role: RegionRole) =>
  role === "icon" || iconVariantField(role) !== undefined;

/** Largest card-shaped crop inside the image (may cut edges off). */
export function fillCrop(width: number, height: number): CropRect {
  if (Math.abs(width / height / CARD_RATIO - 1) <= 0.02) return { x: 0, y: 0, width, height };
  if (width / height > CARD_RATIO) {
    const cropWidth = height * CARD_RATIO;
    return { x: (width - cropWidth) / 2, y: 0, width: cropWidth, height };
  }
  const cropHeight = width / CARD_RATIO;
  return { x: 0, y: (height - cropHeight) / 2, width, height: cropHeight };
}

/** Smallest card-shaped crop containing the whole image, padded with a blank border. */
export function fitCrop(width: number, height: number): CropRect {
  if (Math.abs(width / height / CARD_RATIO - 1) <= 0.02) return { x: 0, y: 0, width, height };
  const cropWidth = Math.max(width, height * CARD_RATIO);
  const cropHeight = cropWidth / CARD_RATIO;
  return { x: (width - cropWidth) / 2, y: (height - cropHeight) / 2, width: cropWidth, height: cropHeight };
}

export function cropToCanvas(image: HTMLImageElement, crop: CropRect, borderColor?: string) {
  const canvas = document.createElement("canvas");
  canvas.width = CARD_WIDTH * OUTPUT_SCALE;
  canvas.height = CARD_HEIGHT * OUTPUT_SCALE;
  const context = canvas.getContext("2d")!;
  if (borderColor) {
    context.fillStyle = borderColor;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  context.imageSmoothingQuality = "high";
  const scaleX = canvas.width / crop.width;
  const scaleY = canvas.height / crop.height;
  context.drawImage(image, -crop.x * scaleX, -crop.y * scaleY, image.naturalWidth * scaleX, image.naturalHeight * scaleY);
  return canvas;
}

type Component = {
  transparent: boolean;
  count: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  r: number;
  g: number;
  b: number;
  touchesEdge: boolean;
};

type Box = { x: number; y: number; width: number; height: number; area: number; color: [number, number, number]; transparent: boolean };

function findComponents(pixels: Uint8ClampedArray): Component[] {
  const total = SAMPLE_W * SAMPLE_H;
  const alpha = (index: number) => pixels[index * 4 + 3];
  const diff = (a: number, b: number) =>
    Math.max(
      Math.abs(pixels[a * 4] - pixels[b * 4]),
      Math.abs(pixels[a * 4 + 1] - pixels[b * 4 + 1]),
      Math.abs(pixels[a * 4 + 2] - pixels[b * 4 + 2]),
    );
  const neighbours = (index: number) => {
    const x = index % SAMPLE_W;
    const result: number[] = [];
    if (x > 0) result.push(index - 1);
    if (x < SAMPLE_W - 1) result.push(index + 1);
    if (index >= SAMPLE_W) result.push(index - SAMPLE_W);
    if (index < total - SAMPLE_W) result.push(index + SAMPLE_W);
    return result;
  };
  const transparent = (index: number) => alpha(index) < 32;
  const flat = (index: number) =>
    !transparent(index) && neighbours(index).every((other) => !transparent(other) && diff(index, other) <= 18);

  const visited = new Uint8Array(total);
  const components: Component[] = [];
  const queue = new Int32Array(total);
  for (let seed = 0; seed < total; seed++) {
    if (visited[seed]) continue;
    const clear = transparent(seed);
    if (!clear && !flat(seed)) continue;
    const component: Component = {
      transparent: clear,
      count: 0,
      minX: SAMPLE_W,
      minY: SAMPLE_H,
      maxX: 0,
      maxY: 0,
      r: 0,
      g: 0,
      b: 0,
      touchesEdge: false,
    };
    let head = 0;
    let tail = 0;
    queue[tail++] = seed;
    visited[seed] = 1;
    while (head < tail) {
      const index = queue[head++];
      const x = index % SAMPLE_W;
      const y = Math.floor(index / SAMPLE_W);
      component.count++;
      component.r += pixels[index * 4];
      component.g += pixels[index * 4 + 1];
      component.b += pixels[index * 4 + 2];
      component.minX = Math.min(component.minX, x);
      component.minY = Math.min(component.minY, y);
      component.maxX = Math.max(component.maxX, x);
      component.maxY = Math.max(component.maxY, y);
      if (x === 0 || y === 0 || x === SAMPLE_W - 1 || y === SAMPLE_H - 1) component.touchesEdge = true;
      for (const next of neighbours(index)) {
        if (visited[next] || transparent(next) !== clear) continue;
        if (!clear) {
          // Compare against the running mean so gradients don't leak across panel borders.
          const n = component.count;
          const dr = Math.abs(pixels[next * 4] - component.r / n);
          const dg = Math.abs(pixels[next * 4 + 1] - component.g / n);
          const db = Math.abs(pixels[next * 4 + 2] - component.b / n);
          if (Math.max(dr, dg, db) > 26) continue;
        }
        visited[next] = 1;
        queue[tail++] = next;
      }
    }
    components.push(component);
  }
  return components;
}

const toBox = (component: Component): Box => ({
  x: component.minX * SAMPLE_SCALE,
  y: component.minY * SAMPLE_SCALE,
  width: (component.maxX - component.minX + 1) * SAMPLE_SCALE,
  height: (component.maxY - component.minY + 1) * SAMPLE_SCALE,
  area: component.count * SAMPLE_SCALE * SAMPLE_SCALE,
  color: [component.r / component.count, component.g / component.count, component.b / component.count],
  transparent: component.transparent,
});

const textColorFor = (color?: [number, number, number]) => {
  if (!color) return "#f1eadb";
  const [r, g, b] = color;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.55 ? "#1d1a16" : "#f1eadb";
};

const centerX = (box: { x: number; width: number }) => box.x + box.width / 2;
const centerY = (box: { y: number; height: number }) => box.y + box.height / 2;

export function analyzeFrame(source: HTMLCanvasElement): { regions: Region[]; transparentWindow: boolean; hasTransparency: boolean } {
  const canvas = document.createElement("canvas");
  canvas.width = SAMPLE_W;
  canvas.height = SAMPLE_H;
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, SAMPLE_W, SAMPLE_H);
  const pixels = context.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data;
  let hasTransparency = false;
  for (let index = 3; index < pixels.length; index += 4) {
    if (pixels[index] < 250) {
      hasTransparency = true;
      break;
    }
  }

  const cardArea = CARD_WIDTH * CARD_HEIGHT;
  const boxes = findComponents(pixels)
    .filter((component) => !component.touchesEdge && component.count >= 20)
    .map(toBox)
    .filter((box) => box.area / (box.width * box.height) >= 0.55 && box.area <= cardArea * 0.8);

  const regions: Region[] = [];
  const add = (role: RegionRole, box: { x: number; y: number; width: number; height: number }, color?: [number, number, number], enabled = true, detected = true) =>
    regions.push({
      id: uid("region"),
      role,
      x: Math.round(box.x),
      y: Math.round(box.y),
      width: Math.round(box.width),
      height: Math.round(box.height),
      enabled,
      detected,
      textColor: textColorFor(color),
      icons: {},
    });

  const transparentArt = boxes
    .filter((box) => box.transparent && box.area >= cardArea * 0.08)
    .sort((a, b) => b.area - a.area)[0];
  const opaqueArt = boxes
    .filter(
      (box) =>
        !box.transparent &&
        box.area >= cardArea * 0.12 &&
        box.area <= cardArea * 0.7 &&
        box.width >= CARD_WIDTH * 0.5 &&
        centerY(box) < CARD_HEIGHT * 0.62,
    )
    .sort((a, b) => b.area - a.area)[0];
  const art = transparentArt ?? opaqueArt;
  const artBox = art ?? { x: 29, y: 86, width: 362, height: 283 };
  add("artwork", artBox, undefined, true, Boolean(art));
  const artTop = artBox.y;
  const artBottom = artBox.y + artBox.height;

  const rest = boxes.filter((box) => box !== art && !box.transparent);
  const panels = rest.filter((box) => box.width >= CARD_WIDTH * 0.4 && box.height >= 12);
  const badges = rest.filter(
    (box) =>
      box.width >= 14 &&
      box.height >= 14 &&
      box.width <= 80 &&
      box.height <= 80 &&
      box.width / box.height >= 0.55 &&
      box.width / box.height <= 1.8,
  );
  const used = new Set<Box>();
  const pick = (candidates: Box[]) => {
    const choice = candidates.find((box) => !used.has(box));
    if (choice) used.add(choice);
    return choice;
  };

  const rules = pick(
    panels.filter((box) => box.y >= artBottom - 5 && box.height >= 45).sort((a, b) => b.area - a.area),
  );
  const name = pick(
    panels
      .filter((box) => box.height < 60 && centerY(box) < artTop)
      .sort((a, b) => b.width - a.width || a.y - b.y),
  );
  const typeLine = pick(
    panels
      .filter(
        (box) =>
          box.height < 60 &&
          box.y >= artBottom - 15 &&
          centerY(box) < (rules ? rules.y + 5 : CARD_HEIGHT * 0.8),
      )
      .sort((a, b) => a.y - b.y),
  );
  const footer = pick(
    panels.filter((box) => box.height < 45 && centerY(box) > CARD_HEIGHT * 0.88).sort((a, b) => b.width - a.width),
  );

  if (name) add("name", name, name.color);
  else add("name", { x: 31, y: 35, width: 320, height: 34 }, undefined, false, false);
  if (typeLine) add("type", typeLine, typeLine.color);
  else add("type", { x: 34, y: 380, width: 350, height: 20 }, undefined, false, false);
  if (rules) add("rules", rules, rules.color);
  else add("rules", { x: 35, y: 419, width: 345, height: 96 }, undefined, false, false);
  if (footer) {
    const split = footer.width * 0.55;
    add("set", { ...footer, width: split }, footer.color);
    add("artist", { ...footer, x: footer.x + split, width: footer.width - split }, footer.color);
  }

  const freeBadges = badges.filter((box) => !used.has(box));
  const top = freeBadges.filter((box) => centerY(box) < CARD_HEIGHT * 0.2);
  const bottom = freeBadges.filter((box) => centerY(box) > CARD_HEIGHT * 0.8);
  const middle = freeBadges.filter((box) => !top.includes(box) && !bottom.includes(box));

  const cost = [...top].sort((a, b) => centerX(b) - centerX(a))[0];
  if (cost) add("cost", cost, cost.color);
  else add("cost", { x: 340, y: 34, width: 37, height: 26 }, undefined, false, false);
  for (const box of top) {
    if (box === cost) continue;
    const opposite = cost && (centerX(box) < CARD_WIDTH / 2) !== (centerX(cost) < CARD_WIDTH / 2);
    add(opposite ? "typeIcon" : "icon", box, box.color);
  }

  const statBadges = bottom.filter((box) => box.height >= 30).sort((a, b) => a.x - b.x);
  if (statBadges.length >= 2) {
    add("attack", statBadges[0], statBadges[0].color);
    add("health", statBadges[statBadges.length - 1], statBadges[statBadges.length - 1].color);
    statBadges.slice(1, -1).forEach((box) => add("icon", box, box.color));
  } else if (statBadges.length === 1) {
    add("stats", statBadges[0], statBadges[0].color);
  } else {
    add("stats", { x: 315, y: 527, width: 67, height: 38 }, undefined, false, false);
  }
  bottom.filter((box) => box.height < 30).forEach((box) => add("setIcon", box, box.color));

  for (const box of middle) {
    const onTypeLine =
      typeLine &&
      centerY(box) >= typeLine.y - 10 &&
      centerY(box) <= typeLine.y + typeLine.height + 10 &&
      centerX(box) > CARD_WIDTH * 0.55;
    add(onTypeLine ? "rarityIcon" : "icon", box, box.color);
  }

  return { regions, transparentWindow: Boolean(transparentArt), hasTransparency };
}

export function createRegion(role: RegionRole): Region {
  return {
    id: uid("region"),
    role,
    x: 180,
    y: 264,
    width: 60,
    height: 60,
    enabled: true,
    detected: false,
    textColor: "#f1eadb",
    icons: {},
  };
}

const placeholderIcon: Partial<Record<RegionRole, string>> = {
  rarityIcon: "Gem",
  typeIcon: "Sparkles",
  setIcon: "Shield",
};

type BuildInput = {
  name: string;
  frameData: string;
  frameSize: number;
  regions: Region[];
  transparentWindow: boolean;
  variantValues: Record<"Rarity" | "Type" | "Set", string[]>;
};

export function buildTemplateFromImage({
  name,
  frameData,
  frameSize,
  regions,
  transparentWindow,
  variantValues,
}: BuildInput): { template: Template; assets: Asset[] } {
  const prefix = uid("image-layers");
  const frameAsset: Asset = {
    id: uid("asset"),
    name: `${name} frame`,
    category: "Frames",
    data: frameData,
    size: frameSize,
    tags: [],
    folder: "",
  };
  const assets: Asset[] = [frameAsset];
  let counter = 0;
  const layer = (
    label: string,
    kind: TemplateLayer["kind"],
    box: { x: number; y: number; width: number; height: number },
    properties: Partial<TemplateLayer> = {},
  ): TemplateLayer => ({
    id: `${prefix}-${++counter}`,
    name: label,
    kind,
    x: Math.round(box.x),
    y: Math.round(box.y),
    width: Math.max(4, Math.round(box.width)),
    height: Math.max(4, Math.round(box.height)),
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
    ...properties,
  });
  const singleLine = (region: Region, text: string, maxSize: number, properties: Partial<TemplateLayer> = {}, inset = 6) => {
    const fontSize = Math.max(8, Math.round(Math.min(maxSize, region.height * 0.7)));
    const lineHeight = fontSize * 1.28;
    return layer(
      roleLabel(region.role),
      "text",
      {
        x: region.x + inset,
        y: region.y + Math.max(0, (region.height - lineHeight) / 2),
        width: region.width - inset * 2,
        height: Math.min(region.height, lineHeight),
      },
      { text, color: region.textColor, fontSize, ...properties },
    );
  };
  const badge = (region: Region, text: string, properties: Partial<TemplateLayer> = {}) =>
    singleLine(region, text, 30, { fontWeight: "700", align: "center", ...properties }, 0);
  const creatureOnly = { showWhen: { field: "Type", equals: "Creature" } };

  const frameLayer = layer("Card frame", "image", { x: 0, y: 0, width: CARD_WIDTH, height: CARD_HEIGHT }, {
    assetId: frameAsset.id,
    fit: "stretch",
    locked: true,
    role: transparentWindow ? "frame" : "background",
  });
  const art = regions.find((region) => region.enabled && region.role === "artwork");
  // Cards without their own artwork let the frame's original art show through.
  const artLayer = art
    ? layer("Illustration", "image", art, { fit: "cover", showWhen: { field: "Artwork", equals: "*" } })
    : undefined;
  const ordered: TemplateLayer[] = transparentWindow
    ? [artLayer, frameLayer].filter((item): item is TemplateLayer => Boolean(item))
    : [frameLayer, artLayer].filter((item): item is TemplateLayer => Boolean(item));

  const texts: TemplateLayer[] = [];
  const icons: TemplateLayer[] = [];
  let numberIndex = 0;
  for (const region of regions) {
    if (!region.enabled) continue;
    switch (region.role) {
      case "artwork":
        break;
      case "name":
        texts.push(singleLine(region, "{Name}", 27, { fontWeight: "600" }));
        break;
      case "cost":
        texts.push(badge(region, "{Cost}"));
        break;
      case "type":
        texts.push(singleLine(region, "{Rarity}  /  {Type}", 16, { textTransform: "uppercase", letterSpacing: 1 }));
        break;
      case "rules":
        texts.push(
          layer("Rules text", "text", { x: region.x + 8, y: region.y + 8, width: region.width - 16, height: region.height - 16 }, {
            text: "{Description}",
            color: region.textColor,
            fontSize: Math.round(Math.min(17, Math.max(10, region.height / 6))),
          }),
        );
        break;
      case "attack":
        texts.push(badge(region, "{Attack}", creatureOnly));
        break;
      case "health":
        texts.push(badge(region, "{Health}", creatureOnly));
        break;
      case "stats":
        texts.push(badge(region, "{Attack} / {Health}", creatureOnly));
        break;
      case "artist":
        texts.push(singleLine(region, "Illus. {Artist}", 12, { align: "right", showWhen: { field: "Artist", equals: "*" } }));
        break;
      case "set":
        texts.push(singleLine(region, "{SetCode}  ·  {Rarity}", 12));
        break;
      case "number": {
        const field = `Number${++numberIndex}`;
        texts.push({ ...badge(region, `{${field}}`), name: field });
        break;
      }
      default: {
        const field = iconVariantField(region.role);
        const label = roleLabel(region.role);
        const values = field ? variantValues[field] : [""];
        const uploads = values.filter((value) => region.icons[value]);
        if (!uploads.length) {
          icons.push(
            layer(label, "icon", region, {
              iconLibrary: "lucide",
              iconName: placeholderIcon[region.role] ?? "Star",
              color: region.textColor,
            }),
          );
          break;
        }
        const groupId = uploads.length > 1 ? crypto.randomUUID() : undefined;
        for (const value of uploads) {
          const upload = region.icons[value];
          assets.push({ id: uid("asset"), name: upload.name, category: "Icons", data: upload.data, size: upload.size, tags: [], folder: "" });
          icons.push(
            layer(field ? `${label} · ${value}` : label, "icon", region, {
              imageData: upload.data,
              color: region.textColor,
              groupId,
              showWhen: field ? { field, equals: value } : undefined,
            }),
          );
        }
      }
    }
  }

  const layers = [...ordered, ...texts, ...icons].map((item, index) => ({ ...item, zIndex: index }));
  return {
    template: { id: uid("template"), name, description: "Created from image", layers, updatedAt: Date.now() },
    assets,
  };
}
