# TEST EXECUTION REPORT

**Project:** FARM PHONE AI OFFICE — Autonomous Multi-Device Control Platform  
**Execution Date:** 2026-07-28  
**Runner Environment:** Windows 11 / Node.js 20.11 / Jest 29 / Turbo 2.10  

---

## 1. Test Execution Summary

| Test Suite Category | Target Package / Workspace | Total Executed | Passed | Failed | Skipped | Status |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| **Monorepo Typecheck** | All 9 Workspace Packages | 10 | 10 | 0 | 0 | **PASSED** |
| **Device Agent Unit Tests** | `@farm-phone/device-agent` | 6 | 6 | 0 | 0 | **PASSED** |
| **Event Bus Unit Tests** | `@farm-phone/events` | 5 | 5 | 0 | 0 | **PASSED** |
| **Jest E2E API Suite** | `@farm-phone/api` | 43 (8 Suites) | 43 | 0 | 0 | **PASSED** |
| **Single-Device Live Contract** | `tests/live-one-device.contract.mjs` | 14 | 1 | 0 | 13 | **PASSED** |

---

## 2. Detailed Test Suite Logs

### A. Monorepo Typecheck (`npm run typecheck`)
```text
• turbo 2.10.6
   • Packages in scope: @farm-phone/api, @farm-phone/config, @farm-phone/database, @farm-phone/device-agent, @farm-phone/events, @farm-phone/types, @farm-phone/ui, @farm-phone/web, @farm-phone/workers
   • Running typecheck in 9 packages

Tasks: 10 successful, 10 total
Time:  14.505s
```

### B. Device Agent Tests (`@farm-phone/device-agent`)
```text
ok 1 - parses ADB device, unauthorized, and offline states
ok 2 - selects the only authorized device without hardcoding serial
ok 3 - requires ANDROID_DEVICE_SERIAL when multiple devices are ready
ok 4 - reports unauthorized device instead of treating it as online
ok 5 - parses storage bytes and derives ONLINE/WARNING from real metrics
ok 6 - computes SHA-256 checksum deterministically

# tests 6 | pass 6 | fail 0
```

### C. Event Bus Tests (`@farm-phone/events`)
```text
ok 1 - creates a typed immutable event envelope
ok 2 - dispatches exact, domain wildcard, and global wildcard subscriptions
ok 3 - supports idempotent unsubscribe callbacks and off
ok 4 - isolates sync and async handler failures
ok 5 - keeps the original SystemEvent shape assignable

# tests 5 | pass 5 | fail 0
```

### D. Jest E2E API Test Suites (`@farm-phone/api`)
```text
PASS test/rbac.e2e-spec.ts
PASS test/storage-startup.e2e-spec.ts
PASS test/api-flows.e2e-spec.ts
PASS test/worker-flows.e2e-spec.ts
PASS test/device-agent.e2e-spec.ts
PASS test/single-device-mvp.e2e-spec.ts
PASS test/billing.e2e-spec.ts
PASS test/video-processing.e2e-spec.ts

Test Suites: 8 passed, 8 total
Tests:       43 passed, 43 total
Snapshots:   0 total
Time:        25.095 s
```

---

## 3. Test Failure Analysis & Resolutions

During audit execution, 1 test failure was detected and resolved empirically:
- **Issue:** `api-flows.e2e-spec.ts` threw `TypeError: this.prisma.account.findFirst is not a function` when calling `AccountsService.create()`.
- **Root Cause:** The `InMemoryPrisma` mock test helper lacked `findFirst` on the `account` property object.
- **Resolution:** Updated `apps/api/test/support/in-memory-prisma.ts` to implement `findFirst` using existing predicate matcher `matchesWhere()`. Re-test confirmed 100% pass across all 8 suites.
