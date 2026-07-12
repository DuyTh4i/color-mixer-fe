import dbData from "../data/db.json";

// ─── Types ───
export interface ColorItem {
  id: string;
  color_name: string;
  hex_value: string;
  subcollections: {
    id: string;
    product_img: string;
    brands: {
      id: string;
      logo: string;
    };
  };
}

export interface Recipe {
  id: string;
  color_name: string;
  hex_value: string;
  subcollections: {
    product_img: string;
    brands: {
      id: string;
      logo: string;
    };
  };
  rate: number;
}

export interface MixResult {
  suggest_colors: ColorItem[];
  recipes: Recipe[];
  result_hex: string;
  match_results: number;
}

export interface Brand {
  id: string;
  name: string;
  logo: string;
  subcollections: Subcollection[];
}

export interface Subcollection {
  id: string;
  name: string;
  product_img: string;
  colors: { count: number }[];
}

// ─── Transform db.json → flat ColorItem[] & Brand[] ───
type DbJsonType = Record<string, {
  logo: string;
  collections: Record<string, {
    product_img: string;
    colors: Array<{
      id: string;
      name: string;
      hex_val: string;
      rgb_val: [number, number, number];
    }>;
  }>;
}>;

function buildFlatData(): { flat: ColorItem[]; brands: Brand[] } {
  const data = dbData as unknown as DbJsonType;
  const flat: ColorItem[] = [];
  const brands: Brand[] = [];

  for (const [brandName, brandData] of Object.entries(data)) {
    const subcollections: Subcollection[] = [];

    for (const [collName, collData] of Object.entries(brandData.collections)) {
      subcollections.push({
        id: collName,
        name: collName,
        product_img: collData.product_img,
        colors: [{ count: collData.colors.length }],
      });

      for (const color of collData.colors) {
        flat.push({
          id: color.id,
          color_name: color.name,
          hex_value: color.hex_val,
          subcollections: {
            id: collName,
            product_img: collData.product_img,
            brands: {
              id: brandName,
              logo: brandData.logo,
            },
          },
        });
      }
    }

    brands.push({
      id: brandName,
      name: brandName,
      logo: brandData.logo,
      subcollections,
    });
  }

  return { flat, brands };
}

const { flat: ALL_COLORS, brands: ALL_BRANDS } = buildFlatData();

// ─── Public API ───
export function getBrands(): Brand[] {
  return ALL_BRANDS;
}

export function computeRecipes(
  hexValue: string,
  subcollectionIds: string[],
  stepSize: number = 10,
): MixResult {
  const cleanHex = hexValue.startsWith("#") ? hexValue : `#${hexValue}`;

  // Step 1: Find exact matches (suggest_colors)
  const suggestColors = getSuggestions(cleanHex, subcollectionIds);

  // Step 2: Exclude exact matches from formula search
  const excludeIds = new Set(suggestColors.map((c) => c.id));

  // Step 3: Find best formula
  const mix = findBestFormula(cleanHex, subcollectionIds, excludeIds, stepSize);

  return {
    suggest_colors: suggestColors,
    recipes: mix?.recipes ?? [],
    result_hex: mix?.result_hex ?? "",
    match_results: mix?.match_results ?? 0,
  };
}

// ─── RGB / HEX / Color Math ───

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${clamp(r).toString(16).padStart(2, "0").toUpperCase()}${clamp(g)
    .toString(16)
    .padStart(2, "0")
    .toUpperCase()}${clamp(b).toString(16).padStart(2, "0").toUpperCase()}`;
}

function srgbToLinear(c: number): number {
  if (c <= 0.04045) return c / 12.92;
  return ((c + 0.055) / 1.055) ** 2.4;
}

function labF(t: number): number {
  const delta = 6 / 29;
  if (t > delta ** 3) return Math.cbrt(t);
  return t / (3 * delta * delta) + 4 / 29;
}

function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255,
    gn = g / 255,
    bn = b / 255;
  const rl = srgbToLinear(rn),
    gl = srgbToLinear(gn),
    bl = srgbToLinear(bn);

  const x = rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375;
  const y = rl * 0.2126729 + gl * 0.7151522 + bl * 0.072175;
  const z = rl * 0.0193339 + gl * 0.119192 + bl * 0.9503041;

  const xn = 0.95047,
    yn = 1.0,
    zn = 1.08883;
  const fx = labF(x / xn),
    fy = labF(y / yn),
    fz = labF(z / zn);

  const L = 116 * fy - 16;
  const A = 500 * (fx - fy);
  const B = 200 * (fy - fz);
  return [L, A, B];
}

function labDistanceSquared(
  r1: number, g1: number, b1: number,
  r2: number, g2: number, b2: number,
): number {
  const [l1, a1, b1L] = rgbToLab(r1, g1, b1);
  const [l2, a2, b2L] = rgbToLab(r2, g2, b2);
  const dl = l1 - l2,
    da = a1 - a2,
    db = b1L - b2L;
  return dl * dl + da * da + db * db;
}

function blendRgb(
  r1: number, g1: number, b1: number, ratio1: number,
  r2: number, g2: number, b2: number, ratio2: number,
): [number, number, number] {
  const r = Math.round(r1 * ratio1 + r2 * ratio2);
  const g = Math.round(g1 * ratio1 + g2 * ratio2);
  const b = Math.round(b1 * ratio1 + b2 * ratio2);
  return [Math.max(0, Math.min(255, r)), Math.max(0, Math.min(255, g)), Math.max(0, Math.min(255, b))];
}

function blendRgb3(
  r1: number, g1: number, b1: number, ratio1: number,
  r2: number, g2: number, b2: number, ratio2: number,
  r3: number, g3: number, b3: number, ratio3: number,
): [number, number, number] {
  const r = Math.round(r1 * ratio1 + r2 * ratio2 + r3 * ratio3);
  const g = Math.round(g1 * ratio1 + g2 * ratio2 + g3 * ratio3);
  const b = Math.round(b1 * ratio1 + b2 * ratio2 + b3 * ratio3);
  return [Math.max(0, Math.min(255, r)), Math.max(0, Math.min(255, g)), Math.max(0, Math.min(255, b))];
}

// ─── Algorithm ───

function getSuggestions(hexValue: string, subcollectionIds: string[]): ColorItem[] {
  return ALL_COLORS.filter(
    (c) =>
      c.hex_value.toUpperCase() === hexValue.toUpperCase() &&
      subcollectionIds.includes(c.subcollections.id),
  );
}

function calcSimilarityPercent(error: number): number {
  if (error === Infinity) return 0;
  const d = Math.sqrt(error);
  const similarity = Math.max(0, (200 - d) / 200 * 100);
  return Math.round(similarity * 10) / 10;
}

function getBlendedColor(ingredients: Array<[ColorItem, number]>): string {
  if (ingredients.length === 0) return "#000000";
  let rSum = 0, gSum = 0, bSum = 0;
  for (const [color, pct] of ingredients) {
    const [r, g, b] = hexToRgb(color.hex_value);
    rSum += r * pct / 100;
    gSum += g * pct / 100;
    bSum += b * pct / 100;
  }
  return rgbToHex(rSum, gSum, bSum);
}

function findBestFormula(
  targetHex: string,
  subcollectionIds: string[],
  excludeIds: Set<string>,
  stepSize: number,
): { recipes: Recipe[]; result_hex: string; match_results: number } | null {
  const [tr, tg, tb] = hexToRgb(targetHex);

  // Build candidate list
  interface Candidate {
    data: ColorItem;
    r: number;
    g: number;
    b: number;
    singleError: number;
  }
  const candidates: Candidate[] = [];

  for (const item of ALL_COLORS) {
    if (excludeIds.has(item.id)) continue;
    if (!subcollectionIds.includes(item.subcollections.id)) continue;
    const [r, g, b] = hexToRgb(item.hex_value);
    const error = labDistanceSquared(tr, tg, tb, r, g, b);
    candidates.push({ data: item, r, g, b, singleError: error });
  }

  if (candidates.length === 0) return null;

  // Sort by single-color error, take Top 20
  candidates.sort((a, b) => a.singleError - b.singleError);
  const top = candidates.slice(0, Math.min(20, candidates.length));

  let bestItems: Array<[ColorItem, number]> | null = null;
  let bestError = Infinity;

  // Phase 1: 1 ingredient
  for (const c of top) {
    if (c.singleError < bestError) {
      bestError = c.singleError;
      bestItems = [[c.data, 100]];
    }
  }

  // Phase 2: 2 ingredients
  for (let i = 0; i < top.length; i++) {
    for (let j = i + 1; j < top.length; j++) {
      const c1 = top[i], c2 = top[j];
      for (let step = 0; step <= 100; step += stepSize) {
        const ratio = step / 100;
        const complement = 1 - ratio;
        const [br, bg, bb] = blendRgb(c1.r, c1.g, c1.b, ratio, c2.r, c2.g, c2.b, complement);
        const error = labDistanceSquared(tr, tg, tb, br, bg, bb);
        if (error < bestError) {
          bestError = error;
          bestItems = [[c1.data, ratio * 100], [c2.data, complement * 100]];
        }
      }
    }
  }

  // Phase 3: 3 ingredients
  if (top.length >= 3) {
    for (let i = 0; i < top.length; i++) {
      for (let j = i + 1; j < top.length; j++) {
        for (let k = j + 1; k < top.length; k++) {
          const c1 = top[i], c2 = top[j], c3 = top[k];
          for (let r1 = 0; r1 <= 100; r1 += stepSize) {
            for (let r2 = 0; r2 <= 100 - r1; r2 += stepSize) {
              const r3 = 100 - r1 - r2;
              if (r3 < 0) continue;
              const [br, bg, bb] = blendRgb3(
                c1.r, c1.g, c1.b, r1 / 100,
                c2.r, c2.g, c2.b, r2 / 100,
                c3.r, c3.g, c3.b, r3 / 100,
              );
              const error = labDistanceSquared(tr, tg, tb, br, bg, bb);
              if (error < bestError) {
                bestError = error;
                bestItems = [
                  [c1.data, r1],
                  [c2.data, r2],
                  [c3.data, r3],
                ];
              }
            }
          }
        }
      }
    }
  }

  if (!bestItems) return null;

  // Filter zero-percent items
  bestItems = bestItems.filter(([, pct]) => pct > 0);

  const matchResults = calcSimilarityPercent(bestError);
  const resultHex = getBlendedColor(bestItems);

  const recipes: Recipe[] = bestItems.map(([color, pct]) => ({
    id: color.id,
    color_name: color.color_name,
    hex_value: color.hex_value,
    subcollections: {
      product_img: color.subcollections.product_img,
      brands: {
        id: color.subcollections.brands.id,
        logo: color.subcollections.brands.logo,
      },
    },
    rate: Math.round(pct),
  }));

  return { recipes, result_hex: resultHex, match_results: matchResults };
}