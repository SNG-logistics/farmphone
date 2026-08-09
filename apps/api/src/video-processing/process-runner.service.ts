import { Injectable } from '@nestjs/common';
import { execFile } from 'child_process';
import { ProcessResult, ProcessRunOptions, ProcessRunner } from './video-processing.types';

@Injectable()
export class ExecFileProcessRunner implements ProcessRunner {
  run(command: string, args: readonly string[], options: ProcessRunOptions): Promise<ProcessResult> {
    return new Promise((resolve, reject) => {
      execFile(command, [...args], {
        encoding: 'utf8',
        maxBuffer: options.maxBufferBytes,
        shell: false,
        timeout: options.timeoutMs,
        windowsHide: true,
      }, (error, stdout, stderr) => {
        if (error) {
          reject(error);
          return;
        }
        resolve({ stdout, stderr });
      });
    });
  }
}
