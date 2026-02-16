export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

type ModelError = {
    message?: unknown;
    status?: unknown;
    statusCode?: unknown;
    status_code?: unknown;
    code?: unknown;
    response?: {
        status?: unknown;
    };
    cause?: unknown;
};

export function toNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const parsed = Number.parseInt(value, 10);
        return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
}

export function getStatusCode(error: unknown): number | undefined {
  const record = error as ModelError;
  return (
        toNumber(record?.status) ??
        toNumber(record?.statusCode) ??
        toNumber(record?.status_code) ??
        toNumber(record?.code) ??
        toNumber(record?.response?.status) ??
        toNumber((record?.cause as ModelError | undefined)?.status) ??
        toNumber((record?.cause as ModelError | undefined)?.statusCode)
  );
}

function parseRetryDelayMs(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  if (value.endsWith('s')) {
    const seconds = Number.parseFloat(value.slice(0, -1));
    if (Number.isFinite(seconds)) {
      return Math.max(seconds * 1000, 0);
    }
  }
  const milliseconds = Number.parseFloat(value);
  return Number.isFinite(milliseconds) ? milliseconds : undefined;
}

export function getRetryDelayMs(error: unknown): number | undefined {
  const record = error as ModelError & { details?: unknown; error?: { details?: unknown } };
  const candidates = [
    record?.details,
    (record?.error as { details?: unknown } | undefined)?.details,
  ];

  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) continue;
    for (const item of candidate) {
      const retryDelay = typeof item === 'object' && item !== null ? (item as { retryDelay?: unknown }).retryDelay : undefined;
      const parsed = parseRetryDelayMs(retryDelay);
      if (parsed !== undefined) {
        return parsed;
      }
    }
  }

  return undefined;
}

export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    if (typeof error === 'object' && error !== null) {
        const maybeMessage = (error as { message?: unknown }).message;
        if (typeof maybeMessage === 'string') return maybeMessage;
    }
    return 'Unknown error';
}

export function shouldRetry(error: unknown): boolean {
    const status = getStatusCode(error);
    if (status && status >= 500 && status < 600) return true;
    if (status === 408 || status === 409 || status === 429) return true;

    const message = toErrorMessage(error).toLowerCase();
    return message.includes('rate') || message.includes('quota') || message.includes('overload') || message.includes('retry');
}

export async function withExponentialBackoff<T>(
  fn: () => Promise<T>,
  action: string,
  maxAttempts: number,
  initialDelayMs: number,
    skipRetry?: (error: unknown) => boolean
): Promise<T> {
    let attempt = 0;
    let lastError: unknown;

    while (attempt < maxAttempts) {
      try {
        return await fn();
      } catch (error: unknown) {
        lastError = error;
        attempt += 1;

            if (skipRetry && skipRetry(error)) {
                throw error;
            }

        if (attempt >= maxAttempts || !shouldRetry(error)) {
          throw error;
        }

        const retryDelay = getRetryDelayMs(error);
        const delay = Math.min(
          retryDelay ?? initialDelayMs * 2 ** (attempt - 1),
          5000
        ) * (0.75 + Math.random() * 0.5);
            console.warn(`[${action}] retryable error, attempt ${attempt}/${maxAttempts} after ${Math.round(delay)}ms: ${toErrorMessage(error)}`);
            await sleep(delay);
        }
    }

    throw lastError;
}
