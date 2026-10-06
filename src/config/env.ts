import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  GROK_AGENT_API_KEY: z.string().min(16),
  STORE_API_KEY: z.string().min(16),
  FROM_EMAIL: z.string().email(),
  EMAIL_PROVIDER: z.enum(["console", "sendgrid"]).default("console"),
  SENDGRID_API_KEY: z.string().optional(),
  AGENT_EMAIL_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  AGENT_EMAIL_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),
  DUPLICATE_EMAIL_WINDOW_MINUTES: z.coerce.number().int().positive().default(60),
  ABANDONED_CHECKOUT_MIN_AGE_MINUTES: z.coerce.number().int().positive().default(60),
  ABANDONED_CHECKOUT_COOLDOWN_HOURS: z.coerce.number().int().positive().default(24),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function loadEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.flatten().fieldErrors;
    throw new Error(`Invalid environment configuration: ${JSON.stringify(details)}`);
  }
  if (parsed.data.EMAIL_PROVIDER === "sendgrid" && !parsed.data.SENDGRID_API_KEY) {
    throw new Error("SENDGRID_API_KEY is required when EMAIL_PROVIDER=sendgrid");
  }
  cached = parsed.data;
  return cached;
}
