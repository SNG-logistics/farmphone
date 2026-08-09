import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI, Part } from '@google/generative-ai';
import OpenAI from 'openai';

export interface ImageInput {
  base64?: string;
  buffer?: Buffer;
  mimeType?: string;
}

export interface ScreenElement {
  label: string;
  type: 'button' | 'input' | 'text' | 'image' | 'icon' | 'popup' | 'unknown';
  x: number; // percentage (0-100) or pixel
  y: number; // percentage (0-100) or pixel
  description?: string;
}

export interface ScreenAnalysisResult {
  screenType: string;
  summary: string;
  elements: ScreenElement[];
  detectedText: string[];
  hasPopupOrModal: boolean;
  suggestedNextSteps: string[];
  rawOutput?: string;
}

export interface DeviceActionDecision {
  action: 'tap' | 'swipe' | 'type' | 'key_event' | 'wait' | 'finish' | 'unknown';
  targetLabel?: string;
  x?: number;
  y?: number;
  endX?: number;
  endY?: number;
  text?: string;
  keyCode?: string | number;
  confidence: number;
  reasoning: string;
}

@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private genAI?: GoogleGenerativeAI;
  private cometClient?: OpenAI;
  private defaultVisionModel = 'gemini-1.5-flash';

  constructor(private readonly configService: ConfigService) {
    const geminiKey =
      this.configService.get<string>('GEMINI_API_KEY') ||
      process.env.GEMINI_API_KEY ||
      this.configService.get<string>('GOOGLE_API_KEY') ||
      process.env.GOOGLE_API_KEY;

    const cometKey =
      this.configService.get<string>('COMETAPI_API_KEY') ||
      process.env.COMETAPI_API_KEY;

    const cometBaseUrl = this.configService.get<string>(
      'COMETAPI_BASE_URL',
      'https://api.cometapi.com/v1',
    );

    this.defaultVisionModel = this.configService.get<string>(
      'GEMINI_VISION_MODEL',
      'gemini-1.5-flash',
    );

    if (cometKey) {
      this.cometClient = new OpenAI({ apiKey: cometKey, baseURL: cometBaseUrl });
      this.logger.log(
        `GeminiService configured via CometAPI (${cometBaseUrl}, default=${this.defaultVisionModel})`,
      );
    } else if (geminiKey) {
      this.genAI = new GoogleGenerativeAI(geminiKey);
      this.logger.log(
        `GeminiService configured via Google Generative AI SDK (model=${this.defaultVisionModel})`,
      );
    } else {
      this.logger.warn(
        'Neither COMETAPI_API_KEY nor GEMINI_API_KEY is configured; Gemini Vision features disabled.',
      );
    }
  }

  isAvailable(): boolean {
    return !!(this.cometClient || this.genAI);
  }

  private extractBase64AndMime(image: ImageInput): { base64Data: string; mimeType: string } {
    const mimeType = image.mimeType || 'image/png';
    let base64Data = '';

    if (image.base64) {
      base64Data = image.base64.replace(/^data:image\/\w+;base64,/, '');
    } else if (image.buffer) {
      base64Data = image.buffer.toString('base64');
    } else {
      throw new Error('Image input must provide either base64 string or Buffer');
    }

    return { base64Data, mimeType };
  }

  private async queryCometWithFallback(
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
    initialModel: string,
  ): Promise<string> {
    const fallbackModels = [initialModel, 'gpt-4o', 'gpt-4o-mini', 'gemini-1.5-pro'].filter(
      (m, i, arr) => arr.indexOf(m) === i,
    );

    let lastError: unknown;
    for (const modelName of fallbackModels) {
      try {
        this.logger.debug(`Querying CometAPI vision model: ${modelName}`);
        const response = await this.cometClient!.chat.completions.create({
          model: modelName,
          messages,
          response_format: { type: 'json_object' },
        });
        const content = response.choices[0]?.message?.content || '';
        if (content) {
          if (modelName !== initialModel) {
            this.logger.log(`CometAPI Vision fallback succeeded with model: ${modelName}`);
          }
          return content;
        }
      } catch (error) {
        lastError = error;
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Model ${modelName} failed on CometAPI: ${errorMsg}`);
        if (
          errorMsg.includes('no available channel') ||
          errorMsg.includes('distributor') ||
          errorMsg.includes('503') ||
          errorMsg.includes('404')
        ) {
          continue;
        }
        throw error;
      }
    }
    throw lastError;
  }

  /**
   * Analyze mobile device screenshot with Vision model via CometAPI or Direct Google API
   */
  async analyzeScreen(
    image: ImageInput,
    customPrompt?: string,
  ): Promise<ScreenAnalysisResult> {
    if (!this.isAvailable()) {
      throw new ServiceUnavailableException(
        'AI Provider is not configured. Set COMETAPI_API_KEY or GEMINI_API_KEY.',
      );
    }

    const systemPrompt =
      customPrompt ||
      `Analyze this mobile UI screenshot for automated phone control.
Return a valid JSON object matching this TypeScript structure:
{
  "screenType": "home_screen | app_login | settings | video_feed | popup_dialog | unknown",
  "summary": "Brief description of current screen state",
  "elements": [
    {
      "label": "Button text or visual element name",
      "type": "button | input | text | image | icon | popup | unknown",
      "x": 50, // estimated center x position in percentage (0-100)
      "y": 80, // estimated center y position in percentage (0-100)
      "description": "Short details"
    }
  ],
  "detectedText": ["list of main text snippets seen"],
  "hasPopupOrModal": false,
  "suggestedNextSteps": ["Step 1", "Step 2"]
}`;

    const { base64Data, mimeType } = this.extractBase64AndMime(image);

    try {
      let responseText = '';

      if (this.cometClient) {
        responseText = await this.queryCometWithFallback(
          [
            {
              role: 'user',
              content: [
                { type: 'text', text: systemPrompt },
                {
                  type: 'image_url',
                  image_url: { url: `data:${mimeType};base64,${base64Data}` },
                },
              ],
            },
          ],
          this.defaultVisionModel,
        );
      } else if (this.genAI) {
        const model = this.genAI.getGenerativeModel({
          model: this.defaultVisionModel,
          generationConfig: { responseMimeType: 'application/json' },
        });
        const result = await model.generateContent([
          systemPrompt,
          { inlineData: { data: base64Data, mimeType } },
        ]);
        responseText = result.response.text();
      }

      const cleanedJson = responseText
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

      const parsed = JSON.parse(cleanedJson) as ScreenAnalysisResult;
      parsed.rawOutput = responseText;
      return parsed;
    } catch (error) {
      this.logger.error(`Error analyzing screen: ${error}`);
      throw new Error(`Screen Analysis failed: ${error}`);
    }
  }

  /**
   * Decide the next ADB action (tap, swipe, input text) given a screenshot and a target goal
   */
  async decideDeviceAction(
    image: ImageInput,
    goalContext: string,
  ): Promise<DeviceActionDecision> {
    if (!this.isAvailable()) {
      throw new ServiceUnavailableException(
        'AI Provider is not configured. Set COMETAPI_API_KEY or GEMINI_API_KEY.',
      );
    }

    const prompt = `You are an AI Device Agent controlling an Android smartphone via ADB touch actions.
Your overall goal is: "${goalContext}"

Inspect the provided screenshot and determine the single next optimal ADB action to take to reach the goal.
Calculate exact target tap/swipe coordinates in percentages (x: 0 to 100, y: 0 to 100) relative to screen dimensions.

Return a valid JSON object matching this structure:
{
  "action": "tap | swipe | type | key_event | wait | finish | unknown",
  "targetLabel": "Name of button or element being interacted with",
  "x": 50, // Percentage from left (0 to 100)
  "y": 75, // Percentage from top (0 to 100)
  "endX": 50, // Optional for swipe (0 to 100)
  "endY": 25, // Optional for swipe (0 to 100)
  "text": "Text to type into input field if action is 'type'",
  "keyCode": "KEYWORDS like BACK, HOME, ENTER or keycode number if key_event",
  "confidence": 0.95, // Confidence score (0.0 to 1.0)
  "reasoning": "Explanation of why this action was selected based on screen visual"
}`;

    const { base64Data, mimeType } = this.extractBase64AndMime(image);

    try {
      let responseText = '';

      if (this.cometClient) {
        responseText = await this.queryCometWithFallback(
          [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                {
                  type: 'image_url',
                  image_url: { url: `data:${mimeType};base64,${base64Data}` },
                },
              ],
            },
          ],
          this.defaultVisionModel,
        );
      } else if (this.genAI) {
        const model = this.genAI.getGenerativeModel({
          model: this.defaultVisionModel,
          generationConfig: { responseMimeType: 'application/json' },
        });
        const result = await model.generateContent([
          prompt,
          { inlineData: { data: base64Data, mimeType } },
        ]);
        responseText = result.response.text();
      }

      const cleanedJson = responseText
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

      return JSON.parse(cleanedJson) as DeviceActionDecision;
    } catch (error) {
      this.logger.error(`Error deciding device action: ${error}`);
      throw new Error(`Device Action Decision failed: ${error}`);
    }
  }
}
