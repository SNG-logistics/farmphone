import { Injectable } from '@nestjs/common';
import { basename } from 'path';
import { AdbService } from '../devices/adb.service';
import { StorageService } from '../content/storage.service';
import { PlatformAutomationRegistry } from '../platform-automation';

@Injectable()
export class PlatformUploaderService {
  constructor(
    private adb: AdbService,
    private storage: StorageService,
    private automation: PlatformAutomationRegistry,
  ) {}

  async prepare(input: { jobId: string; serial: string; platform: string; contentUrl: string; accountIdentifier: string; caption?: string | null }) {
    const adapter = this.automation.get(input.platform);

    const localPath = await this.storage.downloadToTemp(input.contentUrl);
    try {
      const remotePath = `/sdcard/Movies/FarmPhone/${basename(localPath)}`;
      await this.adb.pushFile(input.serial, localPath, remotePath);
      const plan = adapter.createPublishPlan({
        jobId: input.jobId,
        accountIdentifier: input.accountIdentifier,
        remoteMediaPath: remotePath,
        caption: input.caption || undefined,
        visibility: 'PUBLIC',
      });
      await this.adb.launchPackage(input.serial, plan.packageName);
      const ui = adapter.inspectUi(await this.adb.captureUiSnapshot(input.serial));
      const evidenceUrl = await this.storage.uploadEvidence(await this.adb.screenshot(input.serial), input.jobId);
      return {
        remotePath,
        packageName: plan.packageName,
        evidenceUrl,
        plan,
        ui: { ...ui, screenshotUrl: evidenceUrl },
        checkpoint: ui.challenge ? ui.state : 'PRE_PUBLISH_REVIEW',
        instructions: ui.challenge?.reason || 'ตรวจบัญชี หน้าแอป และเนื้อหาก่อนอนุมัติการโพสต์',
      };
    } finally {
      await this.storage.removeTemp(localPath);
    }
  }
}
