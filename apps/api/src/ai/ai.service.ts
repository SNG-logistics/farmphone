import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private client?: OpenAI;
  private defaultModel: string;
  private miniModel: string;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('COMETAPI_API_KEY', '');
    const baseURL = this.configService.get<string>(
      'COMETAPI_BASE_URL',
      'https://api.cometapi.com/v1',
    );
    this.defaultModel = this.configService.get<string>(
      'COMETAPI_MODEL',
      'gpt-4o',
    );
    this.miniModel = this.configService.get<string>(
      'COMETAPI_MINI_MODEL',
      'gpt-4o-mini',
    );

    if (apiKey) {
      this.client = new OpenAI({ apiKey, baseURL });
      this.logger.log(`AI Service initialized — baseURL=${baseURL}, model=${this.defaultModel}`);
    } else {
      this.logger.warn('COMETAPI_API_KEY is not configured; external AI endpoints are disabled');
    }
  }

  /** Send a chat completion request and return the text response */
  async chatCompletion(
    messages: ChatMessage[],
    options?: ChatOptions,
  ): Promise<string> {
    if (!this.client) {
      throw new ServiceUnavailableException('External AI provider is not configured. Set COMETAPI_API_KEY to enable it.');
    }
    const requestedModel = options?.model || this.defaultModel;

    this.logger.debug(
      `chatCompletion model=${requestedModel} messages=${messages.length}`,
    );

    try {
      const response = await this.client.chat.completions.create({
        model: requestedModel,
        messages,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 2048,
        ...(options?.jsonMode ? { response_format: { type: 'json_object' } } : {}),
      });

      const content = response.choices[0]?.message?.content || '';
      this.logger.debug(`chatCompletion response tokens=${response.usage?.total_tokens ?? '?'}`);
      return content;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (requestedModel !== this.defaultModel && (errorMsg.includes('no available channel') || errorMsg.includes('distributor') || errorMsg.includes('404'))) {
        this.logger.warn(`Model ${requestedModel} unavailable on CometAPI channel. Falling back to default model ${this.defaultModel}`);
        const fallbackResponse = await this.client.chat.completions.create({
          model: this.defaultModel,
          messages,
          temperature: options?.temperature ?? 0.7,
          max_tokens: options?.maxTokens ?? 2048,
          ...(options?.jsonMode ? { response_format: { type: 'json_object' } } : {}),
        });
        return fallbackResponse.choices[0]?.message?.content || '';
      }
      throw error;
    }
  }

  /** Send a chat completion and parse the JSON response */
  async chatCompletionJson<T = Record<string, unknown>>(
    messages: ChatMessage[],
    options?: Omit<ChatOptions, 'jsonMode'>,
  ): Promise<T> {
    const raw = await this.chatCompletion(messages, {
      ...options,
      jsonMode: true,
    });

    try {
      // Strip markdown code fences if present
      const cleaned = raw
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
      return JSON.parse(cleaned) as T;
    } catch (error) {
      this.logger.error(`Failed to parse JSON response: ${raw}`);
      throw new Error(`AI returned invalid JSON: ${error}`);
    }
  }

  /** Quick helper: use mini model for cheap tasks */
  async chatMini(
    messages: ChatMessage[],
    options?: ChatOptions,
  ): Promise<string> {
    return this.chatCompletion(messages, {
      ...options,
      model: this.miniModel,
    });
  }

  /** Get the configured default model name */
  getDefaultModel(): string {
    return this.defaultModel;
  }

  /** Get the configured mini model name */
  getMiniModel(): string {
    return this.miniModel;
  }
}
