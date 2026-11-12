import type { FontAsset } from "./model";

const registered = new Set<string>();

export const systemFonts = [
  "Georgia",
  "Palatino Linotype",
  "Baskerville",
  "Times New Roman",
  "Segoe UI",
  "Aptos",
  "Arial",
  "Verdana",
  "Trebuchet MS",
  "Impact",
  "Courier New",
  "Consolas",
];

export async function registerFonts(fonts: FontAsset[]) {
  await Promise.all(
    fonts.map(async (font) => {
      const key = `${font.id}`;
      if (registered.has(key)) return;
      registered.add(key);
      try {
        const face = new FontFace(font.family, `url(${font.data})`, { weight: font.weight });
        document.fonts.add(await face.load());
      } catch {
        registered.delete(key);
      }
    }),
  );
}

export const readFileAsDataUrl = (file: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

export function familyFromFileName(name: string) {
  return name
    .replace(/\.(ttf|otf|woff2?)$/i, "")
    .replace(/[-_](regular|bold|italic|light|medium|semibold|black|thin)$/i, "")
    .replace(/[-_]+/g, " ")
    .trim();
}

/** Downloads a Google Font once and embeds it, so it keeps working offline. */
export async function fetchGoogleFont(family: string): Promise<FontAsset[]> {
  const query = encodeURIComponent(family.trim()).replace(/%20/g, "+");
  const response = await fetch(`https://fonts.googleapis.com/css2?family=${query}:wght@400;700&display=swap`);
  if (!response.ok) throw new Error("Font not found");
  const css = await response.text();
  const blocks = [...css.matchAll(/(?:\/\*\s*([\w-]+)\s*\*\/\s*)?@font-face\s*\{([^}]*)\}/g)];
  const hasLatin = blocks.some(([, subset]) => subset === "latin");
  const fonts: FontAsset[] = [];
  for (const [, subset, body] of blocks) {
    if (hasLatin && subset !== "latin") continue;
    const weight = /font-weight:\s*(\d+)/.exec(body)?.[1] ?? "400";
    const url = /src:\s*url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/.exec(body)?.[1];
    if (!url || fonts.some((font) => font.weight === weight)) continue;
    const file = await fetch(url);
    if (!file.ok) continue;
    fonts.push({
      id: `font-${crypto.randomUUID()}`,
      family: family.trim(),
      weight,
      data: await readFileAsDataUrl(await file.blob()),
      source: "google",
    });
  }
  if (!fonts.length) throw new Error("Font not found");
  return fonts;
}
