import { AIProviderError } from '../errors';

export interface AIRequest {
  stage: 'detection' | 'isolation' | 'extraction' | 'prettify';
  imageUrl: string;
  box?: { x: number; y: number; width: number; height: number };
  prompt: string;
}

export interface AIProviderTransport {
  generate(request: AIRequest): Promise<unknown>;
}

export interface HttpJsonTransportOptions {
  providerName: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

export class HttpJsonTransport implements AIProviderTransport {
  private readonly options: Required<Pick<HttpJsonTransportOptions, 'providerName' | 'baseUrl' | 'apiKey' | 'model' | 'timeoutMs'>> & Pick<HttpJsonTransportOptions, 'headers'>;

  constructor(options: HttpJsonTransportOptions) {
    this.options = { timeoutMs: 30000, ...options };
  }

  async generate(request: AIRequest): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);
    try {
      const response = await fetch(this.options.baseUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.options.apiKey}`,
          ...this.options.headers,
        },
        body: JSON.stringify({
          model: this.options.model,
          stage: request.stage,
          image_url: request.imageUrl,
          box: request.box,
          prompt: request.prompt,
        }),
        signal: controller.signal,
      });

      const body = await response.text();
      if (!response.ok) {
        throw new AIProviderError(`Provider request failed with HTTP ${response.status}`, this.options.providerName, 'AI_PROVIDER_HTTP_ERROR');
      }

      try {
        return JSON.parse(body) as unknown;
      } catch {
        return body;
      }
    } catch (error) {
      if (error instanceof AIProviderError) throw error;
      const message = error instanceof DOMException && error.name === 'AbortError'
        ? `Provider request timed out after ${this.options.timeoutMs}ms`
        : error instanceof Error ? error.message : 'Unknown provider transport failure';
      throw new AIProviderError(message, this.options.providerName, 'AI_PROVIDER_TRANSPORT_ERROR');
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createHttpJsonTransportFromEnv(stage: AIRequest['stage']): HttpJsonTransport {
  const baseUrl = process.env.AI_PROVIDER_BASE_URL;
  const apiKey = process.env.AI_PROVIDER_API_KEY;
  const model = process.env.AI_PROVIDER_MODEL;
  if (!baseUrl || !apiKey || !model) {
    throw new AIProviderError(`Missing AI provider configuration for ${stage}`, 'ConfiguredProvider', 'AI_PROVIDER_CONFIG_ERROR');
  }
  const timeoutMs = Number(process.env.AI_REQUEST_TIMEOUT_MS ?? 30000);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new AIProviderError('AI_REQUEST_TIMEOUT_MS must be a positive number', 'ConfiguredProvider', 'AI_PROVIDER_CONFIG_ERROR');
  }
  return new HttpJsonTransport({ providerName: process.env.AI_PROVIDER_NAME ?? 'ConfiguredProvider', baseUrl, apiKey, model, timeoutMs });
}
