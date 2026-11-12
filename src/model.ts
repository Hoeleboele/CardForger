export type Card = {
  id: string;
  name: string;
  type: string;
  rarity: string;
  cost: number;
  attack: number;
  health: number;
  description: string;
  setId: string;
  templateId: string;
  quantity: number;
  artwork?: string;
  accent: string;
  artist?: string;
  fields?: Record<string, string>;
  createdAt?: number;
};

export type CardSet = { id: string; name: string; code: string; color: string };
export type Deck = { id: string; name: string; cardIds: string[] };
export type LayerKind = "text" | "image" | "icon" | "shape";
export type TemplateLayer = {
  id: string;
  name: string;
  kind: LayerKind;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
  zIndex: number;
  text?: string;
  color?: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  radius?: number;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string;
  align?: "left" | "center" | "right";
  imageData?: string;
  assetId?: string;
  groupId?: string;
  role?: "background" | "frame";
  letterSpacing?: number;
  lineHeight?: number;
  textTransform?: "none" | "uppercase";
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffset?: number;
  glowColor?: string;
  glowBlur?: number;
  textStroke?: string;
  textStrokeWidth?: number;
  fit?: "cover" | "contain" | "stretch";
  cropX?: number;
  cropY?: number;
  cropZoom?: number;
  mask?: "none" | "ellipse";
  blendMode?: BlendMode;
  iconLibrary?: "lucide" | "fontawesome" | "material";
  iconName?: string;
  showWhen?: { field: string; equals: string };
};
export type BlendMode =
  | "source-over"
  | "multiply"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten"
  | "color-dodge"
  | "color-burn"
  | "soft-light"
  | "hard-light"
  | "difference"
  | "luminosity";
export const blendModes: BlendMode[] = [
  "source-over",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "color-dodge",
  "color-burn",
  "soft-light",
  "hard-light",
  "difference",
  "luminosity",
];
export type Template = {
  id: string;
  name: string;
  description: string;
  layers: TemplateLayer[];
  updatedAt?: number;
};
export const assetCategories = [
  "Artwork",
  "Icons",
  "Frames",
  "Backgrounds",
  "Logos",
  "Symbols",
] as const;
export type Asset = {
  id: string;
  name: string;
  category: string;
  data: string;
  size: number;
  tags?: string[];
  folder?: string;
};
export type FontAsset = {
  id: string;
  family: string;
  weight: string;
  data: string;
  source: "upload" | "google";
};
export type ExportRecord = {
  id: string;
  label: string;
  kind: "card" | "zip" | "sheet" | "pdf" | "project" | "template";
  date: number;
};
export type ProjectSettings = {
  projectName: string;
  defaultFormat: "png" | "jpg" | "webp";
  exportDpi: 300 | 600;
  cardBackAssetId?: string;
};
export type Project = {
  cards: Card[];
  sets: CardSet[];
  decks: Deck[];
  templates: Template[];
  assets: Asset[];
  selectedCardId: string;
  fonts: FontAsset[];
  exportHistory: ExportRecord[];
  settings: ProjectSettings;
};

export const defaultSettings: ProjectSettings = {
  projectName: "My card game",
  defaultFormat: "png",
  exportDpi: 300,
};

export function createStarterLayers(prefix = "starter"): TemplateLayer[] {
  const layer = (
    id: string,
    name: string,
    kind: LayerKind,
    x: number,
    y: number,
    width: number,
    height: number,
    properties: Partial<TemplateLayer> = {},
  ): TemplateLayer => ({
    id: `${prefix}-${id}`,
    name,
    kind,
    x,
    y,
    width,
    height,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
    ...properties,
  });
  return [
    layer("background", "Background", "shape", 0, 0, 420, 588, {
      fill: "#111512",
      radius: 25,
      role: "background",
    }),
    layer("surface", "Card surface", "shape", 12, 12, 396, 564, {
      fill: "#202722",
      stroke: "{Accent}",
      strokeWidth: 3,
      radius: 19,
    }),
    layer("artwork", "Illustration", "image", 29, 86, 362, 283, {
      radius: 13,
      fit: "cover",
    }),
    layer("name", "Name", "text", 31, 35, 320, 34, {
      text: "{Name}",
      color: "#f1eadb",
      fontSize: 27,
      fontWeight: "600",
    }),
    layer("cost", "Cost", "text", 340, 34, 37, 26, {
      text: "{Cost}",
      color: "#d9c99f",
      fontSize: 17,
      fontWeight: "600",
      align: "right",
    }),
    layer("type", "Rarity and type", "text", 34, 380, 350, 20, {
      text: "{Rarity}  /  {Type}",
      color: "#c1c8b9",
      fontSize: 13,
      textTransform: "uppercase",
      letterSpacing: 1,
    }),
    layer("description", "Rules text", "text", 35, 419, 345, 96, {
      text: "{Description}",
      color: "#e8e2d5",
      fontSize: 17,
    }),
    layer("stats-plate", "Stats plate", "shape", 315, 527, 67, 38, {
      fill: "{Accent}",
      radius: 12,
      showWhen: { field: "Type", equals: "Creature" },
    }),
    layer("stats", "Power / vitality", "text", 315, 533, 67, 26, {
      text: "{Attack} / {Health}",
      color: "#121713",
      fontSize: 20,
      fontWeight: "700",
      align: "center",
      showWhen: { field: "Type", equals: "Creature" },
    }),
    layer("artist", "Artist credit", "text", 230, 540, 150, 18, {
      text: "Illus. {Artist}",
      color: "#6f776b",
      fontSize: 10,
      align: "right",
      showWhen: { field: "Artist", equals: "*" },
    }),
    layer("set", "Set details", "text", 34, 540, 230, 18, {
      text: "{SetCode}  ·  {Rarity}",
      color: "#858d7f",
      fontSize: 11,
    }),
  ].map((item, index) => ({ ...item, zIndex: index }));
}

export function normalizeProject(project: Partial<Project>): Project {
  return {
    ...initialProject,
    ...project,
    cards: project.cards ?? [],
    sets: project.sets ?? [],
    templates: (project.templates ?? []).map((template) => ({
      ...template,
      layers:
        Array.isArray(template.layers) &&
        template.layers.every((layer) => typeof layer !== "string")
          ? (template.layers as TemplateLayer[])
          : createStarterLayers(template.id),
    })),
    assets: project.assets ?? [],
    decks: project.decks ?? [],
    fonts: project.fonts ?? [],
    exportHistory: project.exportHistory ?? [],
    settings: { ...defaultSettings, ...project.settings },
    selectedCardId: project.selectedCardId ?? "",
  };
}

/** Strips UI/store fields so only persistable workspace data remains. */
export function toProject(source: Project): Project {
  return {
    cards: source.cards,
    sets: source.sets,
    decks: source.decks,
    templates: source.templates,
    assets: source.assets,
    selectedCardId: source.selectedCardId,
    fonts: source.fonts,
    exportHistory: source.exportHistory,
    settings: source.settings,
  };
}

export const initialProject: Project = {
  sets: [
    { id: "set-ember", name: "Emberfall", code: "EMB", color: "#e77b4b" },
    {
      id: "set-wilds",
      name: "The Verdant Wilds",
      code: "VRD",
      color: "#99b870",
    },
  ],
  templates: [
    {
      id: "template-standard",
      name: "Field Notes",
      description: "Standard creature frame",
      layers: createStarterLayers("standard"),
    },
    {
      id: "template-relic",
      name: "Relic",
      description: "Artifact and equipment frame",
      layers: createStarterLayers("relic"),
    },
  ],
  cards: [
    {
      id: "card-1",
      name: "Mossback Elder",
      type: "Creature",
      rarity: "Rare",
      cost: 5,
      attack: 4,
      health: 6,
      description:
        "When Mossback Elder enters play, restore 2 vitality to a friendly creature.",
      setId: "set-wilds",
      templateId: "template-standard",
      quantity: 2,
      accent: "#a6c484",
    },
    {
      id: "card-2",
      name: "Ashen Courier",
      type: "Creature",
      rarity: "Uncommon",
      cost: 2,
      attack: 2,
      health: 1,
      description: "Quickstep. When this creature is defeated, draw a card.",
      setId: "set-ember",
      templateId: "template-standard",
      quantity: 3,
      accent: "#dd8559",
    },
    {
      id: "card-3",
      name: "Lantern of Tides",
      type: "Relic",
      rarity: "Rare",
      cost: 3,
      attack: 0,
      health: 0,
      description:
        "Once each turn, look at the top card of your deck. You may place it on the bottom.",
      setId: "set-wilds",
      templateId: "template-relic",
      quantity: 1,
      accent: "#75a9a0",
    },
    {
      id: "card-4",
      name: "Cinderling",
      type: "Creature",
      rarity: "Common",
      cost: 1,
      attack: 1,
      health: 2,
      description: "A tiny flame with an enormous sense of purpose.",
      setId: "set-ember",
      templateId: "template-standard",
      quantity: 4,
      accent: "#e3a15e",
    },
    {
      id: "card-5",
      name: "Rootbound Passage",
      type: "Spell",
      rarity: "Uncommon",
      cost: 3,
      attack: 0,
      health: 0,
      description: "Return a friendly creature to your hand. Draw a card.",
      setId: "set-wilds",
      templateId: "template-standard",
      quantity: 2,
      accent: "#a3b78e",
    },
    {
      id: "card-6",
      name: "Kiln-Sworn",
      type: "Creature",
      rarity: "Legendary",
      cost: 6,
      attack: 6,
      health: 5,
      description: "Whenever you play a spell, this creature gains +1 attack.",
      setId: "set-ember",
      templateId: "template-standard",
      quantity: 1,
      accent: "#c87653",
    },
  ],
  decks: [
    {
      id: "deck-1",
      name: "Grove & Cinder",
      cardIds: ["card-1", "card-2", "card-3", "card-4", "card-5"],
    },
  ],
  assets: [],
  selectedCardId: "card-1",
  fonts: [],
  exportHistory: [],
  settings: defaultSettings,
};

export const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
