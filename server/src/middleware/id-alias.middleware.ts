import { Request, Response, NextFunction } from 'express';

/**
 * Recursively walks a JSON-serializable value and, for every plain object
 * that has an `id` field, adds an `_id` alias pointing to the same value.
 *
 * Why: the shared TypeScript types (and all existing client code) use `_id`
 * as the primary identifier field (a holdover from an earlier Mongoose-based
 * design). Prisma exposes the primary key as `id`, so without this aliasing
 * the client reads `family._id` → `undefined` and injects that into
 * family-scoped URLs as `/families/undefined/...`.
 *
 * The alias is additive: both `id` and `_id` end up on the response, so
 * nothing that already reads `id` on the wire breaks.
 */
function aliasIds(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(aliasIds);
  }
  if (
    value &&
    typeof value === 'object' &&
    !(value instanceof Date) &&
    !(value instanceof Buffer)
  ) {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(source)) {
      out[key] = aliasIds(v);
    }
    if ('id' in out && !('_id' in out)) {
      out._id = out.id;
    }
    return out;
  }
  return value;
}

/**
 * Express middleware that wraps `res.json` so every JSON response sent from
 * any controller is transparently passed through `aliasIds` before
 * serialization.
 */
export function idAliasMiddleware(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  const originalJson = res.json.bind(res);
  res.json = ((body: unknown) => originalJson(aliasIds(body))) as Response['json'];
  next();
}
