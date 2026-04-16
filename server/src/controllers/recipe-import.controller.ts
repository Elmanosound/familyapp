import { Request, Response, NextFunction } from 'express';
import { ValidationError } from '../utils/errors.js';

/**
 * Recipe URL import.
 *
 * Fetches the target page server-side (avoids CORS in the browser), tries to
 * extract a schema.org/Recipe object from any <script type="application/ld+json">
 * block. Falls back to OpenGraph meta tags so we can still produce a draft title
 * and description when the site has no JSON-LD.
 *
 * The response is NOT persisted — the client prefills the existing "new recipe"
 * form so the user can review and tweak before saving.
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Strip HTML tags and decode the most common entities. */
function stripHtml(input: string): string {
  if (!input) return '';
  const noTags = input.replace(/<[^>]*>/g, ' ');
  return noTags
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&eacute;/gi, 'é')
    .replace(/&egrave;/gi, 'è')
    .replace(/&ecirc;/gi, 'ê')
    .replace(/&agrave;/gi, 'à')
    .replace(/&acirc;/gi, 'â')
    .replace(/&ccedil;/gi, 'ç')
    .replace(/&ocirc;/gi, 'ô')
    .replace(/&ucirc;/gi, 'û')
    .replace(/&ugrave;/gi, 'ù')
    .replace(/&icirc;/gi, 'î')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/\s+/g, ' ')
    .trim();
}

/** Parse ISO 8601 durations like PT1H30M into minutes. Returns undefined on failure. */
function isoDurationToMinutes(iso: unknown): number | undefined {
  if (typeof iso !== 'string') return undefined;
  const m = iso.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i);
  if (!m) return undefined;
  const [, d, h, min, s] = m;
  const total =
    (parseInt(d ?? '0', 10) * 24 * 60) +
    (parseInt(h ?? '0', 10) * 60) +
    parseInt(min ?? '0', 10) +
    Math.round(parseInt(s ?? '0', 10) / 60);
  return total > 0 ? total : undefined;
}

/** Pull the first URL from image fields which can be string / array / object / mix. */
function pickImage(image: unknown): string | undefined {
  if (!image) return undefined;
  if (typeof image === 'string') return image;
  if (Array.isArray(image)) {
    for (const x of image) {
      const picked = pickImage(x);
      if (picked) return picked;
    }
    return undefined;
  }
  if (typeof image === 'object') {
    const obj = image as Record<string, unknown>;
    if (typeof obj.url === 'string') return obj.url;
    if (typeof obj.contentUrl === 'string') return obj.contentUrl;
  }
  return undefined;
}

/** Normalise schema.org instructions to a flat list of step strings. */
function flattenInstructions(raw: unknown): string[] {
  if (!raw) return [];
  if (typeof raw === 'string') {
    // Some sites put the whole method as a single paragraph — split on line breaks or numbers.
    const split = raw
      .split(/\r?\n|(?:\d+\.\s+)/)
      .map((s) => stripHtml(s))
      .filter(Boolean);
    return split.length ? split : [stripHtml(raw)];
  }
  if (!Array.isArray(raw)) return [];

  const steps: string[] = [];
  for (const item of raw) {
    if (typeof item === 'string') {
      const clean = stripHtml(item);
      if (clean) steps.push(clean);
      continue;
    }
    if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>;
      const type = typeof obj['@type'] === 'string' ? (obj['@type'] as string) : '';
      if (type === 'HowToSection' && Array.isArray(obj.itemListElement)) {
        steps.push(...flattenInstructions(obj.itemListElement));
      } else if (typeof obj.text === 'string') {
        const clean = stripHtml(obj.text);
        if (clean) steps.push(clean);
      } else if (typeof obj.name === 'string') {
        const clean = stripHtml(obj.name);
        if (clean) steps.push(clean);
      }
    }
  }
  return steps;
}

/** Try to split "200 g de farine" into structured parts — best effort. */
const UNIT_TOKENS = new Set([
  'g', 'gr', 'kg', 'mg',
  'ml', 'cl', 'l', 'dl',
  'cs', 'cc', 'càs', 'càc', 'c.à.s', 'c.à.c', 'c-à-s', 'c-à-c',
  'cuillère', 'cuillere', 'cuillères', 'cuilleres',
  'tasse', 'tasses', 'bol', 'bols',
  'pincée', 'pincee', 'pincées', 'pincees',
  'gousse', 'gousses', 'brin', 'brins', 'feuille', 'feuilles',
  'tranche', 'tranches', 'morceau', 'morceaux', 'sachet', 'sachets',
  'pièce', 'piece', 'pièces', 'pieces',
  'verre', 'verres', 'paquet', 'paquets', 'boîte', 'boite', 'boîtes', 'boites',
]);

interface ParsedIngredient {
  name: string;
  quantity: number;
  unit: string;
}

function parseIngredientText(text: string): ParsedIngredient {
  const cleaned = stripHtml(text);
  // Match a leading number (with comma/dot decimal or x/y fraction), optional range.
  const m = cleaned.match(/^\s*(\d+(?:[.,]\d+)?(?:\s*[-–/]\s*\d+(?:[.,]\d+)?)?)\s+(.+)$/);
  if (!m) {
    return { name: cleaned, quantity: 0, unit: '' };
  }
  const qtyStr = m[1].replace(',', '.').split(/[-–/]/)[0];
  const quantity = parseFloat(qtyStr) || 0;
  const rest = m[2].trim();

  // Peek first word as a potential unit.
  const firstSpace = rest.indexOf(' ');
  const firstWord = (firstSpace === -1 ? rest : rest.slice(0, firstSpace)).toLowerCase().replace(/\.$/, '');
  if (UNIT_TOKENS.has(firstWord)) {
    let name = firstSpace === -1 ? '' : rest.slice(firstSpace + 1).trim();
    // Drop a leading "de " / "d'" / "du " / "des " that usually follows a unit.
    name = name.replace(/^(de |d'|du |des |de la |de l')/i, '');
    return { name: name || rest, quantity, unit: firstWord };
  }
  return { name: rest, quantity, unit: '' };
}

function parseIngredients(raw: unknown): ParsedIngredient[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((i): i is string => typeof i === 'string' && i.trim().length > 0)
    .map(parseIngredientText);
}

/** Parse "4 servings" / "4 portions" / 4 → 4. */
function parseYield(raw: unknown): number | undefined {
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.max(1, Math.round(raw));
  if (Array.isArray(raw)) {
    for (const x of raw) {
      const parsed = parseYield(x);
      if (parsed) return parsed;
    }
    return undefined;
  }
  if (typeof raw === 'string') {
    const m = raw.match(/\d+/);
    if (m) return parseInt(m[0], 10);
  }
  return undefined;
}

/** Parse keywords/tags which can be string ("easy, fast") or array. */
function parseTags(raw: unknown): string[] {
  const tags: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === 'string') {
      v.split(',').forEach((t) => {
        const clean = t.trim();
        if (clean) tags.push(clean);
      });
    }
  };
  if (Array.isArray(raw)) raw.forEach(push);
  else push(raw);
  return Array.from(new Set(tags)).slice(0, 10);
}

// ─── JSON-LD extraction ──────────────────────────────────────────────────────

type JsonLd = Record<string, unknown>;

/**
 * Walk a parsed JSON-LD blob (which may be an object, array, or @graph wrapper)
 * and return the first node that claims to be a Recipe.
 */
function findRecipeNode(node: unknown): JsonLd | null {
  if (!node) return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findRecipeNode(child);
      if (found) return found;
    }
    return null;
  }
  if (typeof node !== 'object') return null;

  const obj = node as JsonLd;
  const type = obj['@type'];
  const matchesRecipe =
    type === 'Recipe' ||
    (Array.isArray(type) && type.some((t) => t === 'Recipe'));
  if (matchesRecipe) return obj;

  if (Array.isArray(obj['@graph'])) {
    const found = findRecipeNode(obj['@graph']);
    if (found) return found;
  }
  return null;
}

function extractJsonLdBlocks(html: string): JsonLd[] {
  const blocks: JsonLd[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const raw = m[1].trim();
    if (!raw) continue;
    try {
      // Some sites wrap in HTML comments or have trailing commas — try a gentle cleanup.
      const cleaned = raw.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim();
      const parsed = JSON.parse(cleaned);
      blocks.push(parsed);
    } catch {
      // skip malformed block
    }
  }
  return blocks;
}

// ─── OpenGraph fallback ──────────────────────────────────────────────────────

function metaContent(html: string, property: string): string | undefined {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`,
    'i',
  );
  const m = html.match(re);
  return m ? stripHtml(m[1]) : undefined;
}

function extractTitle(html: string): string | undefined {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? stripHtml(m[1]) : undefined;
}

// ─── Public controller ──────────────────────────────────────────────────────

export async function importRecipeFromUrl(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const url: unknown = req.body?.url;
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
      throw new ValidationError('URL invalide');
    }

    // Timeout + a browser-ish UA so sites don't serve us a bot wall.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    let html: string;
    try {
      const resp = await fetch(url, {
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
        },
      });
      if (!resp.ok) {
        throw new ValidationError(`La page a répondu ${resp.status}`);
      }
      const contentType = resp.headers.get('content-type') ?? '';
      if (!contentType.includes('text/html') && !contentType.includes('xhtml')) {
        throw new ValidationError('La réponse n’est pas une page HTML');
      }
      html = await resp.text();
    } catch (err) {
      if (err instanceof ValidationError) throw err;
      if ((err as Error).name === 'AbortError') {
        throw new ValidationError('Le site a mis trop de temps à répondre');
      }
      throw new ValidationError('Impossible de récupérer cette page');
    } finally {
      clearTimeout(timeout);
    }

    // 1) JSON-LD path — by far the most reliable.
    const blocks = extractJsonLdBlocks(html);
    let recipeNode: JsonLd | null = null;
    for (const b of blocks) {
      recipeNode = findRecipeNode(b);
      if (recipeNode) break;
    }

    if (recipeNode) {
      const ingredients = parseIngredients(
        recipeNode.recipeIngredient ?? (recipeNode as { ingredients?: unknown }).ingredients,
      );
      const instructions = flattenInstructions(recipeNode.recipeInstructions);
      const prepTime = isoDurationToMinutes(recipeNode.prepTime);
      const cookTime = isoDurationToMinutes(recipeNode.cookTime);
      const totalTime = isoDurationToMinutes(recipeNode.totalTime);

      const draft = {
        name: stripHtml(typeof recipeNode.name === 'string' ? recipeNode.name : '') || undefined,
        description:
          stripHtml(typeof recipeNode.description === 'string' ? recipeNode.description : '') ||
          undefined,
        imageUrl: pickImage(recipeNode.image),
        servings: parseYield(recipeNode.recipeYield),
        prepTime: prepTime ?? (cookTime ? undefined : totalTime),
        cookTime,
        ingredients,
        instructions,
        tags: parseTags(recipeNode.keywords ?? recipeNode.recipeCategory),
        sourceUrl: url,
        source: 'json-ld' as const,
      };
      res.json({ recipe: draft });
      return;
    }

    // 2) Fallback — OpenGraph meta tags. At best we get a title/description/image.
    const ogTitle = metaContent(html, 'og:title') ?? extractTitle(html);
    const ogDescription =
      metaContent(html, 'og:description') ?? metaContent(html, 'description');
    const ogImage = metaContent(html, 'og:image');

    if (!ogTitle && !ogDescription) {
      throw new ValidationError(
        'Aucune recette détectée sur cette page. Essaye un autre lien.',
      );
    }

    res.json({
      recipe: {
        name: ogTitle,
        description: ogDescription,
        imageUrl: ogImage,
        servings: undefined,
        prepTime: undefined,
        cookTime: undefined,
        ingredients: [],
        instructions: [],
        tags: [],
        sourceUrl: url,
        source: 'og' as const,
      },
      warning:
        'Pas de recette structurée détectée — seuls le titre et la description ont pu être récupérés.',
    });
  } catch (error) {
    next(error);
  }
}
