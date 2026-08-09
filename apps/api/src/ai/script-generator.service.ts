import { Injectable, Logger } from '@nestjs/common';
import { AiService } from './ai.service';
import { GeminiService } from './gemini.service';

export interface ViralScriptRequest {
  spokenPrompt: string;
  brandName?: string;
  targetPlatform?: 'tiktok' | 'facebook' | 'instagram' | 'shopee';
  productCategory?: string;
}

export interface ScriptScene {
  sceneNumber: number;
  start: number;
  end: number;
  visual: string;
  overlayText: string;
  transition: string;
}

export interface VoiceoverLine {
  start: number;
  end: number;
  text: string;
}

export interface ViralVideoScript {
  title: string;
  brand: string;
  aspectRatio: string;
  resolution: string;
  durationSeconds: number;
  hook: string;
  concept: string;
  voiceover: VoiceoverLine[];
  scenes: ScriptScene[];
  caption: string;
  hashtags: string[];
}

@Injectable()
export class ScriptGeneratorService {
  private readonly logger = new Logger(ScriptGeneratorService.name);

  constructor(
    private readonly aiService: AiService,
    private readonly geminiService: GeminiService,
  ) {}

  /**
   * Generates a 3-part viral marketing video script from plain spoken Thai text
   */
  async generateViralScript(dto: ViralScriptRequest): Promise<ViralVideoScript> {
    this.logger.log(`Generating viral video script for spoken prompt: "${dto.spokenPrompt}"`);

    const systemPrompt = `คุณคือผู้เชี่ยวชาญระดับโลกด้านการทำวิดีโอสั้นไวรัล (Short Video Marketing Expert) สำหรับ TikTok, Reels และ Shopee Live.
หน้าที่ของคุณคือรับข้อความภาษาพูดธรรมดาจากลูกค้า แล้วแปลงเป็นสคริปต์วิดีโอไวรัล 20-30 วินาที ที่เน้นการหยุดดู (Scroll Stopper 0-3 วินาทีแรก) และกระตุ้นยอดขายแบบ 100%.

โครงสร้างวิดีโอต้องแบ่งออกเป็น 3 ท่อนชัดเจน:
1. Hook (0-3s): ประโยคกระตุกสายตาหรือคำถามที่ทำให้คนต้องหยุดดูทันที
2. Body/Solution (3-18s): นำเสนอจุดเด่นของสินค้า ภาพรวม และรีวิวสั้นๆ
3. CTA (18-25s): ชวนให้กดสั่งในตะกร้าสินค้าทันที

ส่งคืนคำตอบเป็น JSON Object ที่ตรงตามโครงสร้างนี้เท่านั้น:
{
  "title": "ชื่อหัวข้อวิดีโอสั้นๆ ที่ดึงดูด",
  "brand": "${dto.brandName || 'แบรนด์สินค้า'}",
  "aspectRatio": "9:16",
  "resolution": "1080x1920",
  "durationSeconds": 25,
  "hook": "ประโยค Hook 3 วินาทีแรก",
  "concept": "แนวคิดการนำเสนอภาพรวม",
  "voiceover": [
    { "start": 0, "end": 4, "text": "ประโยคพากย์ท่อน Hook" },
    { "start": 4, "end": 12, "text": "ประโยคพากย์ท่อนเสนอจุดเด่นสินค้า" },
    { "start": 12, "end": 18, "text": "ประโยคพากย์การใช้งานและรีวิว" },
    { "start": 18, "end": 25, "text": "ประโยคพากย์ Call To Action ให้กดสั่งซื้อ" }
  ],
  "scenes": [
    { "sceneNumber": 1, "start": 0, "end": 4, "visual": "คำอธิบายภาพในฉากที่ 1", "overlayText": "ข้อความพาดหัวบนจอ", "transition": "fast_zoom" },
    { "sceneNumber": 2, "start": 4, "end": 12, "visual": "คำอธิบายภาพในฉากที่ 2", "overlayText": "ข้อความสไลด์จุดเด่น", "transition": "slide_left" },
    { "sceneNumber": 3, "start": 12, "end": 18, "visual": "คำอธิบายภาพในฉากที่ 3", "overlayText": "ข้อความเน้นย้ำคุณภาพ", "transition": "fade" },
    { "sceneNumber": 4, "start": 18, "end": 25, "visual": "คำอธิบายภาพในฉากที่ 4", "overlayText": "กดสั่งที่ตะกร้าซ้ายล่าง!", "transition": "bounce" }
  ],
  "caption": "ข้อความแคปชั่นสำหรับโพสต์ลงโซเชียล พร้อมคำอธิบายและจุดขาย",
  "hashtags": ["#แฮชแท็ก1", "#แฮชแท็ก2", "#แฮชแท็ก3", "#สินค้าขายดี"]
}`;

    const userMessage = `ภาษาพูดของลูกค้า: "${dto.spokenPrompt}"
หมวดหมู่สินค้า: ${dto.productCategory || 'ทั่วไป'}
แพลตฟอร์ม: ${dto.targetPlatform || 'TikTok'}`;

    try {
      const resultJson = await this.aiService.chatCompletionJson<ViralVideoScript>(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        { temperature: 0.7 },
      );

      this.logger.log(`Viral script generated successfully: "${resultJson.title}"`);
      return resultJson;
    } catch (error) {
      this.logger.error(`Error generating viral script: ${error}`);
      // Return structured fallback script if AI call encounters temporary glitch
      return {
        title: `${dto.spokenPrompt.slice(0, 30)}...`,
        brand: dto.brandName || 'FARM PHONE',
        aspectRatio: '9:16',
        resolution: '1080x1920',
        durationSeconds: 25,
        hook: 'อย่าเพิ่งซื้อถ้ายังไม่ได้ดูคลิปนี้!',
        concept: dto.spokenPrompt,
        voiceover: [
          { start: 0, end: 5, text: `ถ้าคุณกำลังตามหา ${dto.spokenPrompt} ต้องดูคลิปนี้ให้จบ!` },
          { start: 5, end: 18, text: `สินค้าคุณภาพจัดเต็ม คุ้มค่า คุ้มราคา ส่งตรงถึงบ้านคุณทันใจ` },
          { start: 18, end: 25, text: `กดสั่งซื้อในตะกร้าสินค้าเหลืองซ้ายล่างได้เลยตอนนี้!` },
        ],
        scenes: [
          { sceneNumber: 1, start: 0, end: 5, visual: 'ภาพเปิดไฮไลท์สินค้า', overlayText: 'อย่าเพิ่งซื้อ! ดูคลิปนี้ก่อน', transition: 'fast_zoom' },
          { sceneNumber: 2, start: 5, end: 18, visual: 'เจาะลึกจุดเด่นสินค้า', overlayText: 'คุณภาพจัดเต็ม ส่งไว', transition: 'fade' },
          { sceneNumber: 3, start: 18, end: 25, visual: 'ภาพตะกร้าสินค้าและปุ่มสั่งซื้อ', overlayText: 'กดสั่งที่ตะกร้าซ้ายล่าง!', transition: 'bounce' },
        ],
        caption: `${dto.spokenPrompt}\nสั่งซื้อวันนี้รับโปรโมชั่นพิเศษด่วน!`,
        hashtags: ['#สินค้าขายดี', '#โปรโมชั่น', '#ส่งฟรี', '#ของมันต้องมี'],
      };
    }
  }
}
