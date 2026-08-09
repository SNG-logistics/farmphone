import { BadRequestException, Injectable } from '@nestjs/common';
import { MockPlatformAutomationAdapter } from './mock-platform.adapter';
import { PlatformAutomationAdapter } from './platform-adapter';
import { isMockAutomationEnabled, normalizeAutomationPlatform } from './platform-automation.types';
import {
  FacebookAutomationAdapter,
  InstagramAutomationAdapter,
  TikTokAutomationAdapter,
  YouTubeAutomationAdapter,
} from './production-platform.adapters';

@Injectable()
export class PlatformAutomationRegistry {
  private readonly adapters: ReadonlyMap<string, PlatformAutomationAdapter>;

  constructor(
    tiktok: TikTokAutomationAdapter,
    youtube: YouTubeAutomationAdapter,
    facebook: FacebookAutomationAdapter,
    instagram: InstagramAutomationAdapter,
    mock: MockPlatformAutomationAdapter,
  ) {
    const adapters: [string, PlatformAutomationAdapter][] = [
      ['tiktok', tiktok],
      ['youtube', youtube],
      ['facebook', facebook],
      ['instagram', instagram],
    ];
    if (isMockAutomationEnabled()) adapters.push(['mock', mock]);
    this.adapters = new Map<string, PlatformAutomationAdapter>(adapters);
  }

  get(platform: string): PlatformAutomationAdapter {
    const normalized = normalizeAutomationPlatform(platform);
    const adapter = this.adapters.get(normalized);
    if (!adapter) {
      throw new BadRequestException(`Unsupported automation platform: ${platform}`);
    }
    return adapter;
  }

  list() {
    return [...this.adapters.values()].map((adapter) => adapter.definition);
  }
}
