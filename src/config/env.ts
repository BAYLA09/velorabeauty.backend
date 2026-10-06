import { z } from "zod";

function applyLegacyEnvAliases(): void {
  if (!process.env.EMAIL_FROM && process.env.FROM_EMAIL) {
    process.env.EMAIL_FROM = process.env.FROM_EMAIL;
  }
  if (!process.env.EMAIL_API_KEY && process.env.SENDGRID_API_KEY) {
    process.env.EMAIL_API_KEY = process.env.SENDGRID_API_KEY;
  }
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  GROK_AGENT_API_KEY: z.string().min(16),
  STORE_API_KEY: z.string().min(16),
  EMAIL_FROM: z.string().email(),
  EMAIL_REPLY_TO: z.string().email(),
  EMAIL_UNSUBSCRIBE_URL: z.string().url().optional(),
  EMAIL_PROVIDER: z.enum(["console", "sendgrid"]).default("console"),
  EMAIL_API_KEY: z.string().optional(),
  MAX_MARKETING_EMAILS_PER_7_DAYS: z.coerce.number().int().positive().default(3),
  ABANDONED_CHECKOUT_DELAY_MINUTES: z.coerce.number().int().positive().default(30),
  ABANDONED_CHECKOUT_MESSAGE2_HOURS: z.coerce.number().int().positive().default(24),
  ABANDONED_CHECKOUT_MESSAGE3_HOURS: z.coerce.number().int().positive().default(48),
  WINBACK_DAYS: z.coerce.number().int().positive().default(60),
  VIP_MIN_TOTAL_SPENT: z.coerce.number().nonnegative().default(500),
  VIP_MIN_ORDERS: z.coerce.number().int().positive().default(5),
  INACTIVE_DAYS: z.coerce.number().int().positive().default(90),
  AGENT_EMAIL_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  AGENT_EMAIL_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),
  DUPLICATE_EMAIL_WINDOW_MINUTES: z.coerce.number().int().positive().default(60),
  ABANDONED_CHECKOUT_MIN_AGE_MINUTES: z.coerce.number().int().positive().default(30),
  ABANDONED_CHECKOUT_COOLDOWN_HOURS: z.coerce.number().int().positive().default(24),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function loadEnv(): Env {
  if (cached) return cached;
  applyLegacyEnvAliases();
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.flatten().fieldErrors;
    throw new Error(`Invalid environment configuration: ${JSON.stringify(details)}`);
  }
  if (parsed.data.EMAIL_PROVIDER === "sendgrid" && !parsed.data.EMAIL_API_KEY) {
    throw new Error("EMAIL_API_KEY is required when EMAIL_PROVIDER=sendgrid");
  }
  cached = parsed.data;
  return cached;
}

/** Reset cache for tests */
export function resetEnvCache(): void {
  cached = null;
}
