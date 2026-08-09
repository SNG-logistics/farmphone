import { BadRequestException, Injectable } from '@nestjs/common';
import { lstat, mkdir, mkdtemp, readdir, rm, stat } from 'fs/promises';
import { tmpdir } from 'os';
import { basename, extname, isAbsolute, join, relative, resolve } from 'path';

const ALLOWED_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v', '.webm']);
const MAX_SOURCE_BYTES = 2 * 1024 * 1024 * 1024;

@Injectable()
export class VideoPathService {
  private readonly allowedRoots = this.readAllowedRoots();
  private readonly temporaryRoot = resolve(process.env.VIDEO_PROCESSING_TEMP_ROOT || join(tmpdir(), 'farm-phone-video-processing'));

  async assertSourceFile(sourcePath: string) {
    if (!isAbsolute(sourcePath)) throw new BadRequestException('sourcePath must be an absolute path');

    const normalizedPath = resolve(sourcePath);
    if (!this.allowedRoots.some((root) => this.isInside(normalizedPath, root))) {
      throw new BadRequestException('sourcePath is outside the configured media roots');
    }
    if (!ALLOWED_EXTENSIONS.has(extname(normalizedPath).toLowerCase())) {
      throw new BadRequestException('sourcePath must use an allowed video extension');
    }

    try {
      const fileStats = await lstat(normalizedPath);
      if (!fileStats.isFile() || fileStats.isSymbolicLink()) throw new BadRequestException('sourcePath must be a regular file');
      if (fileStats.size <= 0 || fileStats.size > MAX_SOURCE_BYTES) {
        throw new BadRequestException('sourcePath has an unsupported file size');
      }
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('sourcePath does not exist or cannot be read');
    }
    return normalizedPath;
  }

  async createWorkspace() {
    await mkdir(this.temporaryRoot, { recursive: true });
    return mkdtemp(join(this.temporaryRoot, 'job-'));
  }

  outputPath(workspace: string, fileName: string) {
    const candidate = resolve(workspace, basename(fileName));
    if (!this.isInside(candidate, workspace)) throw new BadRequestException('Invalid generated output path');
    return candidate;
  }

  async removeWorkspace(workspace: string) {
    if (!this.isInside(resolve(workspace), this.temporaryRoot)) return;
    await rm(workspace, { recursive: true, force: true });
  }

  async cleanupExpiredOutputs(olderThanSeconds: number) {
    await mkdir(this.temporaryRoot, { recursive: true });
    const cutoff = Date.now() - olderThanSeconds * 1000;
    const entries = await readdir(this.temporaryRoot, { withFileTypes: true });
    let removed = 0;
    for (const entry of entries) {
      const candidate = resolve(this.temporaryRoot, entry.name);
      if (!entry.isDirectory() || !this.isInside(candidate, this.temporaryRoot)) continue;
      const directoryStats = await stat(candidate);
      if (directoryStats.mtimeMs < cutoff) {
        await rm(candidate, { recursive: true, force: true });
        removed += 1;
      }
    }
    return removed;
  }

  private readAllowedRoots() {
    const configured = process.env.VIDEO_PROCESSING_ALLOWED_ROOTS
      ?.split(';')
      .map((item) => item.trim())
      .filter(Boolean);
    return (configured?.length ? configured : [process.cwd()]).map((root) => resolve(root));
  }

  private isInside(candidate: string, parent: string) {
    const pathRelative = relative(resolve(parent), resolve(candidate));
    return pathRelative === '' || (!pathRelative.startsWith('..') && !isAbsolute(pathRelative));
  }
}
