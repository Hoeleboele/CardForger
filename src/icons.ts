import {
  Anchor,
  Axe,
  Bomb,
  Brain,
  Castle,
  Circle,
  Clover,
  Coins,
  Crown,
  Diamond,
  Dices,
  Droplet,
  Eye,
  Feather,
  Flame,
  Footprints,
  Gem,
  Ghost,
  Heart,
  Hexagon,
  Hourglass,
  Key,
  Leaf,
  Moon,
  Mountain,
  ScrollText,
  Shield,
  Skull,
  Snowflake,
  Sparkles,
  Star,
  Sun,
  Sword,
  Swords,
  Target,
  WandSparkles,
  Wind,
  Zap,
} from "lucide";
import {
  faAnchor,
  faBolt,
  faBomb,
  faBrain,
  faBullseye,
  faChessRook,
  faCoins,
  faCrown,
  faDiceD20,
  faDragon,
  faDroplet,
  faEye,
  faFeather,
  faFire,
  faGem,
  faGhost,
  faHandFist,
  faHatWizard,
  faHeart,
  faHourglassHalf,
  faKey,
  faKhanda,
  faLeaf,
  faMoon,
  faMountain,
  faPaw,
  faScroll,
  faShieldHalved,
  faSkull,
  faSnowflake,
  faStar,
  faSun,
  faWandMagicSparkles,
  faWind,
  type IconDefinition,
} from "@fortawesome/free-solid-svg-icons";
import {
  mdiAnchor,
  mdiAxe,
  mdiBomb,
  mdiCastle,
  mdiCircle,
  mdiClover,
  mdiCreation,
  mdiCrown,
  mdiCurrencyUsd,
  mdiDiamondStone,
  mdiDice5,
  mdiEye,
  mdiFeather,
  mdiFire,
  mdiFlash,
  mdiGhost,
  mdiHeart,
  mdiHexagon,
  mdiImageFilterHdr,
  mdiKey,
  mdiLeaf,
  mdiMagicStaff,
  mdiPaw,
  mdiScriptText,
  mdiShield,
  mdiSkull,
  mdiSnowflake,
  mdiStar,
  mdiSword,
  mdiSwordCross,
  mdiTarget,
  mdiTimerSand,
  mdiWater,
  mdiWeatherNight,
  mdiWeatherWindy,
  mdiWhiteBalanceSunny,
} from "@mdi/js";

export type IconLibrary = "lucide" | "fontawesome" | "material";

type LucideNode = [tag: string, attrs: Record<string, string | number | undefined>][];

const lucideIcons: Record<string, LucideNode> = {
  Anchor, Axe, Bomb, Brain, Castle, Circle, Clover, Coins, Crown, Diamond, Dices,
  Droplet, Eye, Feather, Flame, Footprints, Gem, Ghost, Heart, Hexagon, Hourglass,
  Key, Leaf, Moon, Mountain, ScrollText, Shield, Skull, Snowflake, Sparkles, Star,
  Sun, Sword, Swords, Target, WandSparkles, Wind, Zap,
} as unknown as Record<string, LucideNode>;

const fontAwesomeIcons: Record<string, IconDefinition> = {
  Anchor: faAnchor, Bolt: faBolt, Bomb: faBomb, Brain: faBrain, Bullseye: faBullseye,
  Rook: faChessRook, Coins: faCoins, Crown: faCrown, D20: faDiceD20, Dragon: faDragon,
  Droplet: faDroplet, Eye: faEye, Feather: faFeather, Fire: faFire, Gem: faGem,
  Ghost: faGhost, Fist: faHandFist, Wizard: faHatWizard, Heart: faHeart,
  Hourglass: faHourglassHalf, Key: faKey, Khanda: faKhanda, Leaf: faLeaf, Moon: faMoon,
  Mountain: faMountain, Paw: faPaw, Scroll: faScroll, Shield: faShieldHalved,
  Skull: faSkull, Snowflake: faSnowflake, Star: faStar, Sun: faSun,
  Magic: faWandMagicSparkles, Wind: faWind,
};

const materialIcons: Record<string, string> = {
  Anchor: mdiAnchor, Axe: mdiAxe, Bomb: mdiBomb, Castle: mdiCastle, Circle: mdiCircle,
  Clover: mdiClover, Creation: mdiCreation, Crown: mdiCrown, Gold: mdiCurrencyUsd,
  Diamond: mdiDiamondStone, Dice: mdiDice5, Eye: mdiEye, Feather: mdiFeather,
  Fire: mdiFire, Flash: mdiFlash, Ghost: mdiGhost, Heart: mdiHeart, Hexagon: mdiHexagon,
  Mountain: mdiImageFilterHdr, Key: mdiKey, Leaf: mdiLeaf, Staff: mdiMagicStaff,
  Paw: mdiPaw, Script: mdiScriptText, Shield: mdiShield, Skull: mdiSkull,
  Snowflake: mdiSnowflake, Star: mdiStar, Sword: mdiSword, Swords: mdiSwordCross,
  Target: mdiTarget, Hourglass: mdiTimerSand, Water: mdiWater, Night: mdiWeatherNight,
  Wind: mdiWeatherWindy, Sun: mdiWhiteBalanceSunny,
};

export const iconLibraries: Record<IconLibrary, { label: string; names: string[] }> = {
  lucide: { label: "Lucide", names: Object.keys(lucideIcons) },
  fontawesome: { label: "Font Awesome", names: Object.keys(fontAwesomeIcons) },
  material: { label: "Material Icons", names: Object.keys(materialIcons) },
};

const escapeAttribute = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

export function iconSvg(library: IconLibrary, name: string, color: string): string | undefined {
  const fill = escapeAttribute(color);
  if (library === "lucide") {
    const node = lucideIcons[name];
    if (!node) return undefined;
    const children = node
      .map(([tag, attrs]) => {
        const attributes = Object.entries(attrs)
          .filter(([key, value]) => key !== "key" && value !== undefined)
          .map(([key, value]) => `${key}="${escapeAttribute(String(value))}"`)
          .join(" ");
        return `<${tag} ${attributes}/>`;
      })
      .join("");
    return `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 24 24" fill="none" stroke="${fill}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${children}</svg>`;
  }
  if (library === "fontawesome") {
    const definition = fontAwesomeIcons[name];
    if (!definition) return undefined;
    const [width, height, , , pathData] = definition.icon;
    const paths = (Array.isArray(pathData) ? pathData : [pathData])
      .map((path) => `<path fill="${fill}" d="${path}"/>`)
      .join("");
    return `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 ${width} ${height}">${paths}</svg>`;
  }
  const path = materialIcons[name];
  if (!path) return undefined;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 24 24"><path fill="${fill}" d="${path}"/></svg>`;
}

export const svgToDataUrl = (svg: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/** Recolors an uploaded single-colour SVG; multi-colour artwork keeps its own fills. */
export function recolorSvgDataUrl(dataUrl: string, color: string): string {
  const match = /^data:image\/svg\+xml(;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) return dataUrl;
  const svg = match[1] ? atob(match[2]) : decodeURIComponent(match[2]);
  return svgToDataUrl(svg.replace(/currentColor/g, color));
}

export function layerIconSource(
  layer: { iconLibrary?: IconLibrary; iconName?: string; imageData?: string; color?: string },
  color: string,
): string | undefined {
  if (layer.imageData) return recolorSvgDataUrl(layer.imageData, color);
  if (!layer.iconName) return undefined;
  const svg = iconSvg(layer.iconLibrary ?? "lucide", layer.iconName, color);
  return svg ? svgToDataUrl(svg) : undefined;
}
