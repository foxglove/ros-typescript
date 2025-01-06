export interface LoggerService {
  warn?(message: string, context?: string): void;
  info?(message: string, context?: string): void;
  debug?(message: string, context?: string): void;
  verbose?(message: string, context?: string): void;
}
