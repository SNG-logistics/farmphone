# PRODUCTION RELEASE CHECKLIST

**Project:** FARM PHONE AI OFFICE — Autonomous Multi-Device Control Platform  
**Audit Date:** 2026-07-28  
**Status:** READY FOR RELEASE  

---

## Pre-Deployment Verification Checklist

- [x] **Monorepo Typecheck:** Run `npm run typecheck` across all 9 packages (100% Passed).
- [x] **Unit & Integration Tests:** Run `npm test` (100% Passed).
- [x] **E2E Mock API Test Suite:** Run `npm run test:e2e:mock --workspace @farm-phone/api` (8/8 Suites Passed, 43/43 Tests Passed).
- [x] **Single-Device Live Contract:** Run `node --test tests/live-one-device.contract.mjs` (PASSED).
- [x] **Multi-Tenant Isolation:** Verify `organizationId` scope filtering on all Prisma queries.
- [x] **Secrets Management:** Ensure production `.env` contains valid `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, and `COMETAPI_API_KEY`.
- [x] **Prisma Database Migration:** Run `npm run db:migrate` and `npm run db:generate`.
- [x] **Docker Deployment:** Execute `docker-compose -f docker/docker-compose.yml up -d` to launch PostgreSQL 16, Redis, MinIO, and API/Worker containers.
- [x] **Content Studio:** Verify `/content` short-form video editor loads with SNG Express Promo 9:16 script & Thai TTS voiceover synthesizer.
- [x] **MVP AI Office Dashboard:** Verify `/ai-office` loads 4/4 MVP Agents (`16bit.MANAGER`, `16bit.DEVICE`, `16bit.QA`, `16bit.LOG`) and batch activation trigger works smoothly.
