type LogContext = Record<string, string | number | boolean | null>;

function write(level: "info" | "warn" | "error", message: string, context?: LogContext) {
  process.stderr.write(`${JSON.stringify({ level, message, context: context ?? {} })}\n`);
}

export const Logger = {
  info(message: string, context?: LogContext) {
    write("info", message, context);
  },
  warn(message: string, context?: LogContext) {
    write("warn", message, context);
  },
  error(message: string, context?: LogContext) {
    write("error", message, context);
  },
};
