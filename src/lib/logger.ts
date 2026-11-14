type LogLevel = 'debug' | 'info' | 'warn' | 'error';

type LogContext = Record<string, unknown>;

/**
 * Minimal structured logger.
 *
 * Development gets readable single lines; production emits JSON so Vercel's log
 * drain can index it. Deliberately not a logging library — swap the `emit`
 * body for one when there is somewhere to ship logs to.
 */
function emit(level: LogLevel, message: string, context?: LogContext): void {
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction) {
    const line = JSON.stringify({
      level,
      message,
      timestamp: new Date().toISOString(),
      ...context,
    });
    if (level === 'error') console.error(line);
    else console.warn(line);
    return;
  }

  const prefix = `[${level.toUpperCase()}]`;
  const suffix = context && Object.keys(context).length > 0 ? ` ${JSON.stringify(context)}` : '';

  if (level === 'error') console.error(`${prefix} ${message}${suffix}`);
  else console.warn(`${prefix} ${message}${suffix}`);
}

export const logger = {
  debug: (message: string, context?: LogContext) => {
    if (process.env.NODE_ENV !== 'production') emit('debug', message, context);
  },
  info: (message: string, context?: LogContext) => emit('info', message, context),
  warn: (message: string, context?: LogContext) => emit('warn', message, context),
  error: (message: string, error?: unknown, context?: LogContext) => {
    emit('error', message, {
      ...context,
      ...(error instanceof Error
        ? { errorName: error.name, errorMessage: error.message, stack: error.stack }
        : error !== undefined
          ? { error: String(error) }
          : {}),
    });
  },
};
