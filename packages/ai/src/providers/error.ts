// @altos/ai - Provider error class

export class ProviderError extends Error {
  constructor(
    message: string,
    public providerId: string,
    public statusCode?: number,
    public isRetryable: boolean = false,
  ) {
    super(message);
    this.name = "ProviderError";
  }

  toUserMessage(): string {
    let msg = `[${this.providerId}] ${this.message}`;
    if (this.statusCode) msg += ` (HTTP ${this.statusCode})`;
    if (this.isRetryable) msg += " - Retryable";
    return msg;
  }
}

export function isProviderError(err: unknown): err is ProviderError {
  return err instanceof ProviderError;
}
