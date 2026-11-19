import { z } from "zod";

/** A ticker as stored: upper case, letters, digits, dots, dashes or underscores. */
export const tickerSchema = z
  .string()
  .trim()
  .min(1, "Ticker is required")
  .max(20)
  .transform((t) => t.toUpperCase())
  .refine((t) => /^[A-Z0-9][A-Z0-9._-]*$/.test(t), "Use letters, digits, dots, dashes or underscores");
