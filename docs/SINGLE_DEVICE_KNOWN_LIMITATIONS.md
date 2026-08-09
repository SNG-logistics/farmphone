# PHASE 1 — Single Device Known Limitations

## 1. Current Verdict

`SINGLE_DEVICE_NOT_READY`

Implementation gaps previously reported for the plural command endpoint, dedicated schema, 5-second heartbeat, 15-second watchdog and production Dashboard mock removal have been resolved. They are no longer listed as missing

## 2. Remaining Acceptance Limitations

| ID | Limitation | Impact | Resolution required |
|---|---|---|---|
| SDL-001 | Docker command is not installed/available in the current validation environment | PostgreSQL/Redis/MinIO, migration deploy, persistence and fresh deployment were not exercised here | Install/start Docker Desktop and capture compose, health and migration evidence |
| SDL-002 | ADB command is not installed/available in the current validation environment | Real detection, telemetry and every physical command remain unverified | Install Android Platform Tools and run against PHONE-001 |
| SDL-003 | No physical PHONE-001 evidence set exists | Final verdict cannot be READY | Run TEST-001..017 physical/manual cases and store evidence |
| SDL-004 | TEST-003, 004, 014 and 015 require operator actions | Automated contract alone cannot unplug/reconnect USB or restart real services safely | Execute manual procedures with timestamps/video/logs |
| SDL-005 | Fresh Docker Deployment is not proven | Migration deploy and persistence from a clean deployment remain acceptance blockers | Build core services from source, confirm migrations and repeat mandatory subset |
| SDL-006 | TARGET_ANDROID_PACKAGE has not been validated against a real installed app | HEALTH_CHECK/OPEN_APP/STOP_APP cannot be accepted | Set a real package and capture `pm path`, visual and Job evidence |
| SDL-007 | Screenshot, push checksum and reboot verification have no real-device artifacts | Command code can pass automated contracts without proving phone behavior | Capture PNG, remote hash/size, reboot/reconnect logs and video |
| SDL-008 | Failure injection has not run on live services | Bounded recovery and understandable production errors are not established | Run every injection in the Test Plan and verify no stuck RUNNING jobs |

## 3. Operational Constraints

- Host Device Agent is recommended on Windows because direct USB/ADB access is more reliable than container passthrough
- Optional Compose Agent requires a reachable host ADB server through `ADB_SERVER_SOCKET=tcp:host.docker.internal:5037`
- `ANDROID_DEVICE_SERIAL` is optional only when exactly one authorized device is connected; multiple ready devices without it intentionally fail with `CONFIGURATION_ERROR`
- `DEVICE_AGENT_TOKEN`, JWT secrets and storage credentials in examples are development placeholders and must be replaced before production
- Dashboard local development can use the loopback principal; production requires real JWT authentication and RBAC
- The `legacy-multi-device` Compose profile remains in the repository but must not be started during PHASE 1
- DLQ retry is an explicit operator action and must be audited during acceptance; no infinite retry is enabled

## 4. Automated Evidence Boundary

Current automated results:

- API E2E: `42/42 passed`
- Device Agent: `6/6 passed`
- TEST-018 static production mock-data scan: `PASS`

These results prove code-level contracts only. They do not prove USB behavior, ADB authorization, physical image origin, Android foreground/process state, remote filesystem checksum, service restart persistence or a clean Docker deployment

## 5. Verdict Rule

Do not change the verdict until:

- TEST-001 through TEST-018 are `PASS`
- Required failure injections are `PASS`
- Fresh Docker Deployment is `PASS`
- Critical bugs = 0
- High severity bugs = 0
- Failed mandatory tests = 0
- Production mock data = 0
- Evidence manifest and checksums are complete

Current verdict remains:

`SINGLE_DEVICE_NOT_READY`
