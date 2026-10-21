export class AIProviderError extends Error {
  public readonly providerName: string;
  public readonly code: string;

  constructor(message: string, providerName: string, code = 'AI_PROVIDER_ERROR') {
    super(`[${providerName}] ${message}`);
    this.name = 'AIProviderError';
    this.providerName = providerName;
    this.code = code;
  }
}