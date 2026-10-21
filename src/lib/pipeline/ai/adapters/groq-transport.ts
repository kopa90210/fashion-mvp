/**
 * Phase 4B Gate 4: Real Groq Vision Transport
 *
 * Implements actual Groq OpenAI-compatible chat completions API.
 * Uses vision capability to analyze images and return structured JSON.
 *
 * API Spec:
 *   POST https://api.groq.com/openai/v1/chat/completions
 *   Authorization: Bearer {apiKey}
 *   Content-Type: application/json
 *
 *   Request body:
 *   {
 *     "model": "qwen/qwen3.6-27b",
 *     "messages": [
 *       {
 *         "role": "user",
 *         "content": [
 *           { "type": "text", "text": "..." },
 *           { "type": "image_url", "image_url": { "url": "..." } }
 *         ]
 *       }
 *     ],
 *     "temperature": 0,
 *     "max_tokens": 1024
 *   }
 *
 *   Response:
 *   {
 *     "choices": [
 *       {
 *         "message": {
 *           "role": "assistant",
 *           "content": "..."
 *       }
 *     ]
 *   }
 */

import { AIProviderError } from '../errors';

export interface GroqVisionRequest {
  imageUrl: string;
  prompt: string;
}

export interface GroqVisionResponse {
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface GroqTransportOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  timeoutMs?: number;
}

/**
 * Real Groq chat/vision transport.
 * Sends actual OpenAI-compatible chat completion requests to Groq API.
 * Returns raw text from the model, which is then parsed by the adapter layer.
 */
export class GroqVisionTransport {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(options: GroqTransportOptions) {
    if (!options.apiKey || !options.model) {
      throw new AIProviderError('Missing required Groq configuration (apiKey, model)', 'Groq', 'AI_PROVIDER_CONFIG_ERROR');
    }
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.baseUrl = options.baseUrl ?? 'https://api.groq.com/openai/v1';
    this.timeoutMs = options.timeoutMs ?? 30000;
  }

  async generate(request: GroqVisionRequest): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: request.prompt },
                { type: 'image_url', image_url: { url: request.imageUrl } },
              ],
            },
          ],
          temperature: 0,
          max_tokens: 2048,
        }),
        signal: controller.signal,
      });

      // Handle rate limiting explicitly
      if (response.status === 429) {
        throw new AIProviderError(
          `Rate limit exceeded (HTTP 429)`,
          'Groq',
          'AI_PROVIDER_RATE_LIMIT'
        );
      }

      if (!response.ok) {
        const errorBody = await response.text();
        throw new AIProviderError(
          `Groq API request failed: HTTP ${response.status}: ${errorBody}`,
          'Groq',
          'AI_PROVIDER_HTTP_ERROR'
        );
      }

      const data = (await response.json()) as GroqVisionResponse;

      // Extract content from Groq response
      if (!data.choices || data.choices.length === 0) {
        throw new AIProviderError(
          'Groq response missing choices array',
          'Groq',
          'AI_PROVIDER_INVALID_RESPONSE'
        );
      }

      const message = data.choices[0]?.message?.content;
      if (typeof message !== 'string') {
        throw new AIProviderError(
          'Groq response missing or invalid message content',
          'Groq',
          'AI_PROVIDER_INVALID_RESPONSE'
        );
      }

      return message;
    } catch (error) {
      if (error instanceof AIProviderError) throw error;

      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new AIProviderError(
          `Groq request timed out after ${this.timeoutMs}ms`,
          'Groq',
          'AI_PROVIDER_TIMEOUT'
        );
      }

      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new AIProviderError(`Groq transport error: ${message}`, 'Groq', 'AI_PROVIDER_TRANSPORT_ERROR');
    } finally {
      clearTimeout(timeout);
    }
  }

  static fromEnv(): GroqVisionTransport {
    const apiKey = process.env.AI_PROVIDER_API_KEY;
    const model = process.env.AI_PROVIDER_MODEL;
    const baseUrl = process.env.AI_PROVIDER_BASE_URL;
    const timeoutMs = Number(process.env.AI_REQUEST_TIMEOUT_MS ?? 30000);

    if (!apiKey) {
      throw new AIProviderError(
        'AI_PROVIDER_API_KEY not configured',
        'Groq',
        'AI_PROVIDER_CONFIG_ERROR'
      );
    }
    if (!model) {
      throw new AIProviderError(
        'AI_PROVIDER_MODEL not configured (recommend: qwen/qwen3.6-27b)',
        'Groq',
        'AI_PROVIDER_CONFIG_ERROR'
      );
    }
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new AIProviderError(
        'AI_REQUEST_TIMEOUT_MS must be a positive number',
        'Groq',
        'AI_PROVIDER_CONFIG_ERROR'
      );
    }

    return new GroqVisionTransport({
      apiKey,
      model,
      baseUrl,
      timeoutMs,
    });
  }
}
