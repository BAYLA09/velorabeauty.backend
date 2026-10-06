type LogLevel = "info" | "warn" | "error" | "debug";

const SECRET_KEYS = /api[_-]?key|authorization|password|secret|token|database_url/i;

function redact(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    if (value.length > 8 && SECRET_KEYS.test(value)) return "[REDACTED]";
    return value;
  }
  if (Array.isArray(value)) return value.map(redact);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEYS.test(k) ? "[REDACTED]" : redact(v);
    }
    return out;
  }
  return value;
}

export function logStructured(
  level: LogLevel,
  event: string,
  fields: Record<string, unknown> = {},
): void {
  const safeFields = redact(fields) as Record<string, unknown>;
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...safeFields,
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}
