import { zValidator } from "@hono/zod-validator";
import type { Context } from "hono";
import { z } from "zod";

type ValidationTarget = "json" | "query" | "param";

export function requestValidator<T extends z.ZodType>(
  target: ValidationTarget,
  schema: T,
  message: string,
) {
  return zValidator(target, schema, (result, c: Context) => {
    if (!result.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message,
            details: z.flattenError(result.error),
          },
        },
        400,
      );
    }
  });
}

export function jsonValidator<T extends z.ZodType>(
  schema: T,
  message = "Invalid input",
) {
  return requestValidator("json", schema, message);
}

export function queryValidator<T extends z.ZodType>(
  schema: T,
  message = "Invalid query",
) {
  return requestValidator("query", schema, message);
}
