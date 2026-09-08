/**
 * Logging an toàn.
 *
 * Ràng buộc: Prompt 2 §4 — "logging an toàn", "không hard-code secret".
 * Mọi giá trị nhạy cảm phải bị che trước khi ra console, kể cả khi lập trình
 * viên vô tình log nguyên một request/response.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/** Khoá bị che hoàn toàn khi xuất hiện trong object/header/query. */
const SENSITIVE_KEY_PATTERN =
  /(authorization|token|password|passwd|secret|api[-_]?key|cookie|set-cookie|session|credential|otp|pin)/i;

export const REDACTED = '[ĐÃ CHE]';

/** Độ sâu tối đa khi duyệt object, tránh log lồng vô hạn. */
const MAX_DEPTH = 4;

export function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === 'string') {
    return redactUrlLike(value);
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (depth >= MAX_DEPTH) {
    return '[quá sâu]';
  }
  if (Array.isArray(value)) {
    return value.map(item => redact(item, depth + 1));
  }
  if (value instanceof Error) {
    return { name: value.name, message: value.message };
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(
      value as Record<string, unknown>,
    )) {
      out[key] = SENSITIVE_KEY_PATTERN.test(key)
        ? REDACTED
        : redact(item, depth + 1);
    }
    return out;
  }
  return '[không tuần tự hoá được]';
}

/**
 * Che giá trị của các query param nhạy cảm trong chuỗi giống URL.
 * Không dùng URL() vì chuỗi truyền vào có thể chỉ là một đoạn path.
 */
function redactUrlLike(input: string): string {
  if (!input.includes('=')) {
    return input;
  }
  return input.replace(
    /([?&#][^=&#]*?(?:token|key|secret|password|session|otp)[^=&#]*?=)([^&#]*)/gi,
    (_match, prefix: string) => prefix + REDACTED,
  );
}

export interface Logger {
  debug(message: string, context?: unknown): void;
  info(message: string, context?: unknown): void;
  warn(message: string, context?: unknown): void;
  error(message: string, context?: unknown): void;
}

export interface LoggerOptions {
  /** Ngưỡng tối thiểu để ghi. Mặc định: debug khi __DEV__, warn khi release. */
  minLevel?: LogLevel;
  /** Đích ghi. Mặc định console. Test tiêm sink riêng để kiểm chứng nội dung. */
  sink?: (level: LogLevel, message: string, context?: unknown) => void;
}

const defaultSink = (
  level: LogLevel,
  message: string,
  context?: unknown,
): void => {
  const line = '[wms:' + level + '] ' + message;
  const target =
    level === 'error'
      ? console.error
      : level === 'warn'
      ? console.warn
      : console.log;
  if (context === undefined) {
    target(line);
  } else {
    target(line, context);
  }
};

export function createLogger(options: LoggerOptions = {}): Logger {
  const isDev = typeof __DEV__ !== 'undefined' && __DEV__;
  const minLevel: LogLevel = options.minLevel ?? (isDev ? 'debug' : 'warn');
  const sink = options.sink ?? defaultSink;
  const threshold = LEVEL_ORDER[minLevel];

  const write =
    (level: LogLevel) =>
    (message: string, context?: unknown): void => {
      if (LEVEL_ORDER[level] < threshold) {
        return;
      }
      sink(level, message, context === undefined ? undefined : redact(context));
    };

  return {
    debug: write('debug'),
    info: write('info'),
    warn: write('warn'),
    error: write('error'),
  };
}

export const logger = createLogger();
