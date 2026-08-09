const message = [
  'Legacy multi-device worker is disabled for PHASE 1.',
  'PHONE-001 commands are consumed by JobQueueService inside @farm-phone/api.',
  'Do not enable the legacy-multi-device Docker profile until Single Device Acceptance passes.',
].join(' ');

console.info(message);
process.exitCode = 0;

