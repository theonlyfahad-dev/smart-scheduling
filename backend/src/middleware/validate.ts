import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

/**
 * Express middleware to validate request body using a Zod schema.
 * Replaces req.body with parsed/transformed data on success.
 * Returns HTTP 400 with descriptive error and details on validation failure.
 */
export function validateBody<T>(schema: ZodSchema<T>) {
  return function bodyValidator(req: Request, res: Response, next: NextFunction): void {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err: unknown) {
      if (err instanceof ZodError) {
        res.status(400).json({
          error: 'Validation failed',
          details: err.errors.map((e) => ({
            path: e.path.join('.'),
            message: e.message,
          })),
        });
        return;
      }
      next(err);
    }
  };
}

/**
 * Express middleware to validate request query parameters using a Zod schema.
 * Coerces types and replaces req.query with sanitized values.
 * Returns HTTP 400 with descriptive error on failure.
 */
export function validateQuery<T>(schema: ZodSchema<T>) {
  return function queryValidator(req: Request, res: Response, next: NextFunction): void {
    try {
      const parsed = schema.parse(req.query);
      req.query = parsed as any;
      next();
    } catch (err: unknown) {
      if (err instanceof ZodError) {
        res.status(400).json({
          error: 'Validation failed',
          details: err.errors.map((e) => ({
            path: e.path.join('.'),
            message: e.message,
          })),
        });
        return;
      }
      next(err);
    }
  };
}

/**
 * Express middleware to validate route params (e.g. :id) using a Zod schema.
 * Returns HTTP 400 with descriptive error on failure.
 */
export function validateParams<T>(schema: ZodSchema<T>) {
  return function paramsValidator(req: Request, res: Response, next: NextFunction): void {
    try {
      req.params = schema.parse(req.params) as any;
      next();
    } catch (err: unknown) {
      if (err instanceof ZodError) {
        res.status(400).json({
          error: 'Validation failed',
          details: err.errors.map((e) => ({
            path: e.path.join('.'),
            message: e.message,
          })),
        });
        return;
      }
      next(err);
    }
  };
}
