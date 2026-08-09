export type VideoOutputPreset = 'social-vertical' | 'social-square' | 'social-landscape';

export interface VideoMetadata {
  formatName: string | null;
  durationSeconds: number;
  sizeBytes: number;
  videoCodec: string;
  audioCodec: string | null;
  width: number;
  height: number;
  frameRate: number | null;
}

export interface ProcessResult {
  stdout: string;
  stderr: string;
}

export interface ProcessRunOptions {
  timeoutMs: number;
  maxBufferBytes: number;
}

export interface ProcessRunner {
  run(command: string, args: readonly string[], options: ProcessRunOptions): Promise<ProcessResult>;
}

export interface GeneratedVideoAsset {
  outputPath: string;
  expiresAt: string;
}
