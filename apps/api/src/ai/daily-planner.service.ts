import { Injectable, Logger } from '@nestjs/common';
import { AiService } from './ai.service';
import { ScriptGeneratorService, ViralVideoScript } from './script-generator.service';

export interface BusinessProfile {
  businessName: string;
  industry?: string;
  targetAudience: string;
  brandTone: string;
  coreUSP: string;
  targetPlatform?: 'tiktok' | 'facebook' | 'instagram' | 'shopee';
}

export interface ScheduledPeakSlot {
  slotName: 'MORNING' | 'EVENING' | 'NIGHT';
  timeRange: string;
  recommendedTime: string;
  hookConcept: string;
  prompt: string;
  script: ViralVideoScript;
}

export interface Daily3PeakPlanResult {
  businessName: string;
  brandPersona: string;
  visualIdentity: string;
  generatedDate: string;
  slots: {
    morning: ScheduledPeakSlot;
    evening: ScheduledPeakSlot;
    night: ScheduledPeakSlot;
  };
}

@Injectable()
export class DailyPlannerService {
  private readonly logger = new Logger(DailyPlannerService.name);

  constructor(
    private readonly aiService: AiService,
    private readonly scriptGenerator: ScriptGeneratorService,
  ) {}

  /**
   * Generates an AI Brand Persona and 3-Peak Daily Posting Schedule for a business
   */
  async generateDaily3PeakPlan(profile: BusinessProfile): Promise<Daily3PeakPlanResult> {
    this.logger.log(`Generating Daily 3-Peak Plan for Business: "${profile.businessName}"`);

    const platform = profile.targetPlatform || 'tiktok';

    // 1. Generate 3 unique prompts tailored for the 3 peak time windows
    const morningPrompt = `สินค้า/บริการ: ${profile.businessName} (${profile.coreUSP}). เน้นสำหรับช่วงพักเที่ยง (11:30 - 13:00 น.) - เน้นข่าวไว พลังงานความสดชื่น ได้ผลลัพธ์รวดเร็ว สำหรับกลุ่ม ${profile.targetAudience}`;
    const eveningPrompt = `สินค้า/บริการ: ${profile.businessName} (${profile.coreUSP}). เน้นสำหรับช่วงเลิกงาน (18:00 - 19:30 น.) - เน้นการให้รางวัลตัวเอง คลายเครียดจากการทำงาน ปลดล็อกความสุข สำหรับกลุ่ม ${profile.targetAudience}`;
    const nightPrompt = `สินค้า/บริการ: ${profile.businessName} (${profile.coreUSP}). เน้นสำหรับช่วงก่อนนอน (21:30 - 23:00 น.) - เน้นการเล่าเรื่องราวลึกซึ้ง (Storytelling) เผยเคล็ดลับลับ และโปรโมชั่นเด็ด Flash Sale คืนนี้เท่านั้น สำหรับกลุ่ม ${profile.targetAudience}`;

    // 2. Generate 3 distinct viral scripts concurrently
    const [morningScript, eveningScript, nightScript] = await Promise.all([
      this.scriptGenerator.generateViralScript({
        spokenPrompt: morningPrompt,
        brandName: profile.businessName,
        targetPlatform: platform,
        productCategory: profile.industry,
      }),
      this.scriptGenerator.generateViralScript({
        spokenPrompt: eveningPrompt,
        brandName: profile.businessName,
        targetPlatform: platform,
        productCategory: profile.industry,
      }),
      this.scriptGenerator.generateViralScript({
        spokenPrompt: nightPrompt,
        brandName: profile.businessName,
        targetPlatform: platform,
        productCategory: profile.industry,
      }),
    ]);

    const result: Daily3PeakPlanResult = {
      businessName: profile.businessName,
      brandPersona: `แบรนด์ ${profile.businessName} สื่อสารด้วยโทน ${profile.brandTone} เน้นกลุ่มผู้ฟัง ${profile.targetAudience} ด้วยจุดเด่น ${profile.coreUSP}`,
      visualIdentity: `วิดีโอสั้น 9:16 ความละเอียด 1080x1920 คอนทราสต์สูง มีซับไตเติลภาษาไทยขยับตามเสียงพากย์ และเอฟเฟกต์กระตุกสายตาช่วง 3 วินาทีแรก`,
      generatedDate: new Date().toISOString().slice(0, 10),
      slots: {
        morning: {
          slotName: 'MORNING',
          timeRange: '11:30 - 13:00 น. (Lunch Break)',
          recommendedTime: '12:15 น.',
          hookConcept: '☀️ พักเที่ยงเติมพลังความสดชื่น',
          prompt: morningPrompt,
          script: morningScript,
        },
        evening: {
          slotName: 'EVENING',
          timeRange: '18:00 - 19:30 น. (After Work)',
          recommendedTime: '18:45 น.',
          hookConcept: '🌆 เลิกงานแล้ว ให้รางวัลชีวิตตัวเอง',
          prompt: eveningPrompt,
          script: eveningScript,
        },
        night: {
          slotName: 'NIGHT',
          timeRange: '21:30 - 23:00 น. (Bedtime Scroll)',
          recommendedTime: '22:15 น.',
          hookConcept: '🌙 เคล็ดลับลับ & Flash Sale คืนนี้เท่านั้น',
          prompt: nightPrompt,
          script: nightScript,
        },
      },
    };

    this.logger.log(`Daily 3-Peak Plan generated successfully for ${profile.businessName}`);
    return result;
  }
}
