import { ZodSchema } from 'zod';
import { Request, Response, NextFunction } from 'express';

/**
 * Generic Zod validation middleware.
 *
 * - Validates req.body against the provided schema.
 * - On success:  replaces req.body with the parsed (coerced + stripped) value.
 * - On failure:  returns 400 with a structured list of field errors.
 *
 * Stripping unknown fields is intentional — it prevents clients from
 * injecting undeclared properties into Prisma `update({ data })` calls.
 *
 * Usage:
 *   router.post('/login', validate(LoginSchema), login);
 */
export const validate =
  (schema: ZodSchema) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({
        error: 'Données invalides',
        details: result.error.errors.map((e) => ({
          field:   e.path.join('.') || 'body',
          message: e.message,
        })),
      });
      return;
    }

    // Replace body with validated, coerced and unknown-field-stripped data
    req.body = result.data;
    next();
  };
