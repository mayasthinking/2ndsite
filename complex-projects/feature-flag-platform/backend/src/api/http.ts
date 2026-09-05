import { NextFunction, Request, Response } from "express";
import { ZodError, ZodSchema } from "zod";
import { AppError } from "../domain/errors";

export const validateBody = <T>(schema: ZodSchema<T>, body: unknown): T => {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new AppError("Invalid request body", 400, formatZodError(parsed.error));
  }
  return parsed.data;
};

export const asyncHandler =
  (
    fn: (req: Request, res: Response, next: NextFunction) => Promise<void> | void
  ) =>
  (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

export const errorHandler = (
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      error: error.message,
      details: error.details
    });
    return;
  }

  res.status(500).json({
    error: "Internal server error"
  });
};

export const notFoundHandler = (_req: Request, res: Response): void => {
  res.status(404).json({
    error: "Not found"
  });
};

const formatZodError = (zodError: ZodError): Array<{ path: string; message: string }> =>
  zodError.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message
  }));
