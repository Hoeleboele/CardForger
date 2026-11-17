import { zipSync } from "fflate";
import { layerIconSource } from "./icons";
import type { Card, Project, TemplateLayer } from "./model";

export const CARD_WIDTH = 420;
export const CARD_HEIGHT = 588;
const IMAGE_CACHE_LIMIT = 300;

const imageCache = new Map<string, Promise<HTMLImageElement | undefined>>();
const loadedFonts = new Map<string, Promise<unknown>>();

const roundedRect = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) => {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
};

export function loadImage(source: string): Promise<HTMLImageElement | undefined> {
  const cached = imageCache.get(source);
  if (cached) return cached;
  if (imageCache.size >= IMAGE_CACHE_LIMIT) {
    imageCache.delete(imageCache.keys().next().value!);
  }
  const image = new Image();
  const loaded = new Promise<HTMLImageElement | undefined>((resolve) => {
    image.onload = () => resolve(image);
    image.onerror = () => resolve(undefined);
  });
  image.src = source;
  imageCache.set(source, loaded);
  return loaded;
}

function ensureFont(font: string) {
  if (!("fonts" in document)) return Promise.resolve();
  let pending = loadedFonts.get(font);
  if (!pending) {
    pending = document.fonts.load(font).catch(() => undefined);
    loadedFonts.set(font, pending);
  }
  return pending;
}

export function cssFontFamily(family: string) {
  return family.includes(",") || /^["']/.test(family) ? family : `"${family}"`;
}

export function cardValues(card: Card, project: Project): Record<string, string> {
  const set = project.sets.find((item) => item.id === card.setId);
  const values: Record<string, string> = {
    ...card.fields,
    Name: card.name,
    Description: card.description,
    Attack: String(card.attack),
    Defense: String(card.health),
    Health: String(card.health),
    Cost: String(card.cost),
    Type: card.type,
    Rarity: card.rarity,
    Artist: card.artist ?? "",
    Set: set?.name ?? "",
    SetCode: set?.code ?? "SET",
    Accent: card.accent,
    Quantity: String(card.quantity),
    Artwork: card.artwork ? "yes" : "",
  };
  for (const [key, value] of Object.entries(values)) values[key.toLowerCase()] = value;
  return values;
}

export function resolveValue(value: string | undefined, values: Record<string, string>) {
  return (value ?? "").replace(
    /\{([^}]+)\}/g,
    (_, key: string) => values[key] ?? values[key.toLowerCase()] ?? "",
  );
}

export function layerVisibleFor(layer: TemplateLayer, values: Record<string, string>) {
  if (!layer.showWhen?.field) return true;
  const { field, equals } = layer.showWhen;
  const actual = (values[field] ?? values[field.toLowerCase()] ?? "").trim();
  return equals === "*" ? actual !== "" : actual.toLowerCase() === equals.trim().toLowerCase();
}

export function layerImageSource(layer: TemplateLayer, card: Card, project: Project) {
  if (layer.imageData) return layer.imageData;
  if (layer.assetId) return project.assets.find((asset) => asset.id === layer.assetId)?.data;
  return card.artwork;
}

export function layerText(layer: TemplateLayer, values: Record<string, string>) {
  const text = resolveValue(layer.text, values);
  return layer.textTransform === "uppercase" ? text.toUpperCase() : text;
}

function setLetterSpacing(context: CanvasRenderingContext2D, spacing: number) {
  if ("letterSpacing" in context) {
    (context as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${spacing}px`;
  }
}

function wrapText(
  context: CanvasRenderingContext2D,
  value: string,
  width: number,
): string[] {
  const lines: string[] = [];
  for (const paragraph of value.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (line && context.measureText(next).width > width) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  return lines;
}

type DrawOptions = { scale: number; transparent?: boolean };

function clipLayer(
  context: CanvasRenderingContext2D,
  layer: TemplateLayer,
  left: number,
  top: number,
) {
  if (layer.mask === "ellipse") {
    context.beginPath();
    context.ellipse(0, 0, layer.width / 2, layer.height / 2, 0, 0, Math.PI * 2);
  } else {
    roundedRect(context, left, top, layer.width, layer.height, layer.radius ?? 0);
  }
  context.clip();
}

/** Computes the destination rectangle for an image inside a layer box (fit + crop pan/zoom). */
export function fittedImageRect(
  layer: TemplateLayer,
  imageWidth: number,
  imageHeight: number,
  fallbackFit: TemplateLayer["fit"] = "stretch",
) {
  const { width, height } = layer;
  const fit = layer.fit ?? fallbackFit;
  if (fit === "stretch" || !imageWidth || !imageHeight) {
    return { x: 0, y: 0, width, height };
  }
  const base =
    fit === "cover"
      ? Math.max(width / imageWidth, height / imageHeight)
      : Math.min(width / imageWidth, height / imageHeight);
  const scale = base * Math.max(0.1, layer.cropZoom ?? 1);
  const drawWidth = imageWidth * scale;
  const drawHeight = imageHeight * scale;
  const offsetX = ((layer.cropX ?? 0) * Math.abs(drawWidth - width)) / 2;
  const offsetY = ((layer.cropY ?? 0) * Math.abs(drawHeight - height)) / 2;
  return {
    x: (width - drawWidth) / 2 - offsetX,
    y: (height - drawHeight) / 2 - offsetY,
    width: drawWidth,
    height: drawHeight,
  };
}

async function drawLayer(
  context: CanvasRenderingContext2D,
  layer: TemplateLayer,
  card: Card,
  project: Project,
  values: Record<string, string>,
  options: DrawOptions,
) {
  if (!layer.visible || layer.opacity <= 0 || !layerVisibleFor(layer, values)) return;
  if (options.transparent && layer.role === "background") return;
  const { width, height } = layer;
  const radius = layer.radius ?? 0;
  context.save();
  context.globalAlpha = layer.opacity;
  context.globalCompositeOperation = layer.blendMode ?? "source-over";
  context.translate(layer.x + width / 2, layer.y + height / 2);
  context.rotate((layer.rotation * Math.PI) / 180);
  const left = -width / 2;
  const top = -height / 2;

  if (layer.kind === "shape") {
    if (layer.mask === "ellipse") {
      context.beginPath();
      context.ellipse(0, 0, width / 2, height / 2, 0, 0, Math.PI * 2);
    } else roundedRect(context, left, top, width, height, radius);
    if (layer.fill) {
      context.fillStyle = resolveValue(layer.fill, values);
      context.fill();
    }
    if (layer.stroke && (layer.strokeWidth ?? 1) > 0) {
      context.strokeStyle = resolveValue(layer.stroke, values);
      context.lineWidth = layer.strokeWidth ?? 1;
      context.stroke();
    }
  } else if (layer.kind === "image") {
    const source = layerImageSource(layer, card, project);
    context.save();
    clipLayer(context, layer, left, top);
    const image = source ? await loadImage(source) : undefined;
    if (image) {
      const rect = fittedImageRect(layer, image.naturalWidth, image.naturalHeight);
      context.drawImage(image, left + rect.x, top + rect.y, rect.width, rect.height);
    } else if (!layer.imageData && !layer.assetId) {
      const gradient = context.createLinearGradient(left, top, left + width, top + height);
      gradient.addColorStop(0, card.accent);
      gradient.addColorStop(1, "#28342d");
      context.fillStyle = gradient;
      context.fillRect(left, top, width, height);
      context.globalAlpha *= 0.18;
      context.fillStyle = "#f2e7ce";
      context.beginPath();
      context.arc(0, 0, Math.min(width, height) * 0.34, 0, Math.PI * 2);
      context.fill();
      context.globalAlpha = layer.opacity;
      context.fillStyle = "#f4e9d4";
      context.font = `bold ${Math.min(height * 0.42, 92)}px Georgia`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(card.name.slice(0, 1), 0, 0);
    }
    context.restore();
  } else if (layer.kind === "icon") {
    const color = resolveValue(layer.color ?? "#f1eadb", values);
    const source = layerIconSource(layer, color);
    const image = source ? await loadImage(source) : undefined;
    if (image) {
      applyShadow(context, layer, options.scale);
      const rect = fittedImageRect(
        { ...layer, fit: "contain", cropX: 0, cropY: 0, cropZoom: 1 },
        image.naturalWidth || 96,
        image.naturalHeight || 96,
      );
      context.drawImage(image, left + rect.x, top + rect.y, rect.width, rect.height);
    }
  } else {
    const fontSize = layer.fontSize ?? 16;
    const font = `${layer.fontWeight ?? "400"} ${fontSize}px ${cssFontFamily(layer.fontFamily ?? "Georgia")}`;
    await ensureFont(font);
    context.font = font;
    setLetterSpacing(context, layer.letterSpacing ?? 0);
    context.textAlign = layer.align ?? "left";
    context.textBaseline = "top";
    const lines = wrapText(context, layerText(layer, values), width);
    const lineHeight = fontSize * (layer.lineHeight ?? 1.28);
    const baselineX =
      layer.align === "right" ? left + width : layer.align === "center" ? 0 : left;
    const drawLines = (stroke: boolean) =>
      lines.forEach((line, index) => {
        if (index * lineHeight >= height) return;
        if (stroke) context.strokeText(line, baselineX, top + index * lineHeight);
        else context.fillText(line, baselineX, top + index * lineHeight);
      });
    const fill = resolveValue(layer.color ?? "#f1eadb", values);
    if (layer.glowColor && (layer.glowBlur ?? 0) > 0) {
      context.save();
      context.shadowColor = layer.glowColor;
      context.shadowBlur = (layer.glowBlur ?? 0) * options.scale;
      context.fillStyle = layer.glowColor;
      drawLines(false);
      drawLines(false);
      context.restore();
    }
    applyShadow(context, layer, options.scale);
    if (layer.textStroke && (layer.textStrokeWidth ?? 0) > 0) {
      context.strokeStyle = resolveValue(layer.textStroke, values);
      context.lineWidth = (layer.textStrokeWidth ?? 0) * 2;
      context.lineJoin = "round";
      drawLines(true);
      context.shadowColor = "transparent";
    }
    context.fillStyle = fill;
    drawLines(false);
  }
  context.restore();
}

function applyShadow(context: CanvasRenderingContext2D, layer: TemplateLayer, scale: number) {
  if (!layer.shadowColor) return;
  const blur = layer.shadowBlur ?? 0;
  const offset = layer.shadowOffset ?? 0;
  if (!blur && !offset) return;
  context.shadowColor = layer.shadowColor;
  context.shadowBlur = blur * scale;
  context.shadowOffsetX = offset * scale;
  context.shadowOffsetY = offset * scale;
}

/** Renders one layer unrotated at the origin; opacity, rotation and blending are left to the caller. */
export async function renderLayerCanvas(
  layer: TemplateLayer,
  card: Card,
  project: Project,
  scale: number,
  padding: number,
) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil((layer.width + padding * 2) * scale));
  canvas.height = Math.max(1, Math.ceil((layer.height + padding * 2) * scale));
  const context = canvas.getContext("2d")!;
  context.scale(scale, scale);
  context.translate(padding, padding);
  await drawLayer(
    context,
    { ...layer, x: 0, y: 0, rotation: 0, opacity: 1, blendMode: undefined, visible: true, showWhen: undefined },
    card,
    project,
    cardValues(card, project),
    { scale },
  );
  return canvas;
}

export async function renderCardCanvas(
  card: Card,
  project: Project,
  scale = 2,
  options: { transparent?: boolean } = {},
) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(CARD_WIDTH * scale);
  canvas.height = Math.round(CARD_HEIGHT * scale);
  const context = canvas.getContext("2d")!;
  context.scale(canvas.width / CARD_WIDTH, canvas.height / CARD_HEIGHT);
  const template = project.templates.find((item) => item.id === card.templateId) ?? project.templates[0];
  const values = cardValues(card, project);
  for (const layer of [...(template?.layers ?? [])].sort((a, b) => a.zIndex - b.zIndex)) {
    await drawLayer(context, layer, card, project, values, { scale, ...options });
  }
  return canvas;
}

export async function drawCard(
  canvas: HTMLCanvasElement,
  card: Card,
  project: Project,
  scale = 2,
) {
  const rendered = await renderCardCanvas(card, project, scale);
  canvas.width = rendered.width;
  canvas.height = rendered.height;
  canvas.getContext("2d")!.drawImage(rendered, 0, 0);
}

/** Pixels-per-card-unit for a target print DPI on a 63 mm wide poker card. */
export const exportScale = (dpi: number) => ((dpi / 25.4) * 63) / CARD_WIDTH;

const safeName = (value: string) =>
  value.replace(/[\\/:*?"<>|]+/g, "").trim().replace(/\s+/g, "_") || "Card";

export function cardFileName(card: Card, project: Project, format: string) {
  const setName = project.sets.find((set) => set.id === card.setId)?.name ?? "Cards";
  return `${safeName(setName)}_${safeName(card.name)}.${format}`;
}

export function downloadBlob(blob: Blob, fileName: string) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 4000);
}

const mimeFor = (format: string) =>
  format === "jpg" ? "image/jpeg" : format === "webp" ? "image/webp" : "image/png";

const canvasBlob = (canvas: HTMLCanvasElement, mime: string, quality = 0.95) =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Export failed"))), mime, quality),
  );

export type CardExportOptions = { format: string; dpi: number; transparent: boolean };

async function cardBlob(card: Card, project: Project, options: CardExportOptions) {
  const transparent = options.transparent && options.format !== "jpg";
  const canvas = await renderCardCanvas(card, project, exportScale(options.dpi), { transparent });
  if (options.format === "jpg") {
    const flattened = document.createElement("canvas");
    flattened.width = canvas.width;
    flattened.height = canvas.height;
    const context = flattened.getContext("2d")!;
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(canvas, 0, 0);
    return canvasBlob(flattened, mimeFor("jpg"));
  }
  return canvasBlob(canvas, mimeFor(options.format));
}

export async function exportCard(card: Card, project: Project, options: CardExportOptions) {
  downloadBlob(await cardBlob(card, project, options), cardFileName(card, project, options.format));
}

export async function exportCardsZip(
  cards: Card[],
  project: Project,
  options: CardExportOptions,
  zipName: string,
  onProgress?: (done: number, total: number) => void,
) {
  const files: Record<string, Uint8Array> = {};
  const used = new Map<string, number>();
  for (const [index, card] of cards.entries()) {
    let name = cardFileName(card, project, options.format);
    const count = used.get(name) ?? 0;
    used.set(name, count + 1);
    if (count) name = name.replace(/(\.\w+)$/, `_${count + 1}$1`);
    files[name] = new Uint8Array(await (await cardBlob(card, project, options)).arrayBuffer());
    onProgress?.(index + 1, cards.length);
  }
  // Images are already compressed, so storing avoids a slow second pass.
  const zipped = zipSync(files, { level: 0 });
  downloadBlob(new Blob([zipped as BlobPart], { type: "application/zip" }), zipName);
}

export type PrintOptions = {
  cropMarks?: boolean;
  safeArea?: boolean;
  bleed?: boolean;
  sides?: "front" | "back" | "both";
  backImage?: string;
};

const sheetWidth = 2480;
const sheetHeight = 3508;
const printCardWidth = 744;
const printCardHeight = 1038;
const bleedSize = 35;

function copyCursor(cards: Card[]) {
  let cardIndex = 0;
  let copiesLeft = cards[0]?.quantity ?? 0;
  let totalLeft = cards.reduce((sum, card) => sum + card.quantity, 0);
  return {
    get total() {
      return totalLeft;
    },
    next() {
      while (copiesLeft <= 0 && cardIndex < cards.length - 1) {
        cardIndex++;
        copiesLeft = cards[cardIndex].quantity;
      }
      if (totalLeft <= 0 || !cards[cardIndex]) return undefined;
      copiesLeft--;
      totalLeft--;
      return cards[cardIndex];
    },
  };
}

async function renderPrintPage(
  pageCards: Array<Card | undefined>,
  project: Project,
  options: PrintOptions,
  back = false,
) {
  const page = document.createElement("canvas");
  page.width = sheetWidth;
  page.height = sheetHeight;
  const context = page.getContext("2d")!;
  context.fillStyle = "#fff";
  context.fillRect(0, 0, sheetWidth, sheetHeight);
  const bleed = options.bleed ? bleedSize : 0;
  const tileWidth = printCardWidth + bleed * 2;
  const tileHeight = printCardHeight + bleed * 2;
  const marginX = (sheetWidth - tileWidth * 3) / 2;
  const marginY = (sheetHeight - tileHeight * 3) / 2;

  for (let slot = 0; slot < 9; slot++) {
    const card = pageCards[slot];
    if (!card) continue;
    // Backs are mirrored horizontally so they line up with fronts on long-edge duplex.
    const column = back ? 2 - (slot % 3) : slot % 3;
    const row = Math.floor(slot / 3);
    const outerX = marginX + column * tileWidth;
    const outerY = marginY + row * tileHeight;
    const x = outerX + bleed;
    const y = outerY + bleed;

    const backImage = back && options.backImage ? await loadImage(options.backImage) : undefined;
    if (backImage) {
      const rect = fittedImageRect(
        { width: tileWidth, height: tileHeight, fit: "cover" } as TemplateLayer,
        backImage.naturalWidth,
        backImage.naturalHeight,
      );
      context.save();
      context.beginPath();
      context.rect(outerX, outerY, tileWidth, tileHeight);
      context.clip();
      context.drawImage(backImage, outerX + rect.x, outerY + rect.y, rect.width, rect.height);
      context.restore();
    } else if (back) {
      context.fillStyle = "#26322c";
      context.fillRect(outerX, outerY, tileWidth, tileHeight);
      context.strokeStyle = "#a4b18e";
      context.lineWidth = 5;
      context.strokeRect(x + 18, y + 18, printCardWidth - 36, printCardHeight - 36);
      context.fillStyle = "#d6c6a5";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.font = "bold 76px Georgia";
      context.fillText("CARDFORGE", x + printCardWidth / 2, y + printCardHeight / 2 - 25);
      context.font = "28px sans-serif";
      context.fillText("STUDIO", x + printCardWidth / 2, y + printCardHeight / 2 + 42);
    } else {
      const cardCanvas = await renderCardCanvas(card, project, printCardWidth / CARD_WIDTH);
      // Stretching underneath extends edge colours into the bleed without distorting the trimmed card.
      if (bleed) context.drawImage(cardCanvas, outerX, outerY, tileWidth, tileHeight);
      context.drawImage(cardCanvas, x, y, printCardWidth, printCardHeight);
    }

    context.strokeStyle = "#202020";
    context.lineWidth = 2;
    context.strokeRect(x, y, printCardWidth, printCardHeight);
    if (options.safeArea) {
      context.save();
      context.strokeStyle = "#486c52";
      context.lineWidth = 2;
      context.setLineDash([8, 8]);
      context.strokeRect(x + 35, y + 35, printCardWidth - 70, printCardHeight - 70);
      context.restore();
    }
    if (options.cropMarks) {
      const length = 20;
      const gap = 7;
      context.beginPath();
      context.moveTo(x - gap - length, y);
      context.lineTo(x - gap, y);
      context.moveTo(x, y - gap - length);
      context.lineTo(x, y - gap);
      context.moveTo(x + printCardWidth + gap, y);
      context.lineTo(x + printCardWidth + gap + length, y);
      context.moveTo(x + printCardWidth, y - gap - length);
      context.lineTo(x + printCardWidth, y - gap);
      context.moveTo(x - gap - length, y + printCardHeight);
      context.lineTo(x - gap, y + printCardHeight);
      context.moveTo(x, y + printCardHeight + gap);
      context.lineTo(x, y + printCardHeight + gap + length);
      context.moveTo(x + printCardWidth + gap, y + printCardHeight);
      context.lineTo(x + printCardWidth + gap + length, y + printCardHeight);
      context.moveTo(x + printCardWidth, y + printCardHeight + gap);
      context.lineTo(x + printCardWidth, y + printCardHeight + gap + length);
      context.strokeStyle = "#111";
      context.lineWidth = 2;
      context.stroke();
    }
  }
  return page;
}

export async function exportPrintSheet(
  cards: Card[],
  project: Project,
  options: PrintOptions = { cropMarks: true },
  onProgress?: (done: number, total: number) => void,
) {
  const cursor = copyCursor(cards);
  const totalCopies = cursor.total;
  if (!totalCopies) return 0;
  const pageCount = Math.ceil(totalCopies / 9);
  const sides = options.sides ?? "front";
  const files: Record<string, Uint8Array> = {};
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
    const pageCards = Array.from({ length: 9 }, () => cursor.next());
    const number = String(pageIndex + 1).padStart(2, "0");
    if (sides !== "back") {
      const front = await renderPrintPage(pageCards, project, options);
      files[`CardForge_front_${number}.png`] = new Uint8Array(
        await (await canvasBlob(front, "image/png")).arrayBuffer(),
      );
    }
    if (sides !== "front") {
      const back = await renderPrintPage(pageCards, project, options, true);
      files[`CardForge_back_${number}.png`] = new Uint8Array(
        await (await canvasBlob(back, "image/png")).arrayBuffer(),
      );
    }
    onProgress?.(pageIndex + 1, pageCount);
  }
  const names = Object.keys(files);
  if (names.length === 1) {
    downloadBlob(new Blob([files[names[0]] as BlobPart], { type: "image/png" }), names[0]);
  } else {
    const zipped = zipSync(files, { level: 0 });
    downloadBlob(new Blob([zipped as BlobPart], { type: "application/zip" }), "CardForge_print_sheets.zip");
  }
  return pageCount;
}

export async function exportPrintPdf(
  cards: Card[],
  project: Project,
  options: PrintOptions = { cropMarks: true },
  onProgress?: (done: number, total: number) => void,
) {
  const cursor = copyCursor(cards);
  const totalCopies = cursor.total;
  if (!totalCopies) return 0;
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  const pageCount = Math.ceil(totalCopies / 9);
  const sides = options.sides ?? "front";
  let outputPage = 0;
  const addPage = (canvas: HTMLCanvasElement) => {
    if (outputPage > 0) pdf.addPage();
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, 210, 297, undefined, "FAST");
    outputPage++;
  };
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
    const pageCards = Array.from({ length: 9 }, () => cursor.next());
    if (sides !== "back") addPage(await renderPrintPage(pageCards, project, options));
    if (sides !== "front") addPage(await renderPrintPage(pageCards, project, options, true));
    onProgress?.(pageIndex + 1, pageCount);
  }
  pdf.save("CardForge_print_sheets.pdf");
  return pageCount;
}
