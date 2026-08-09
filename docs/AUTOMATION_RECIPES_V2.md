# FARM PHONE V2 Automation Recipes

Automation Recipes are reusable, deterministic Android action definitions. Creating or editing a recipe does not touch a phone. Running an `ACTIVE` recipe compiles it into one `AUTOMATION_SEQUENCE` job per selected physical device and sends every job through the existing backend queue and Device Agent.

## Execution path

1. `POST /api/v1/automation-recipes/:id/runs` validates every requested device code in the operator organization.
2. A production run is rejected when a device record has no ADB `serialNumber` or is marked `metadata.simulated=true`.
3. The recipe compiler produces ordered deterministic steps. It never asks an LLM to execute a JSON plan.
4. `SingleDeviceCommandsService` creates a persisted `Job`, `DeviceCommand`, and initial `JobLog`, then enqueues the job.
5. `JobQueueService` assigns the job to the Device Agent registered for that device and waits for the structured response.
6. The Device Agent executes ADB actions, returns per-step timings/output/failure reasons, and captures configured screenshots.
7. The backend stores screenshots as uploaded evidence, replaces base64 payloads with signed evidence URLs, and persists the final job state.

Only one active device command is accepted for a device at a time. A second request receives the existing active job with reason `DEVICE_ALREADY_BUSY`.

## Recipe shape

```json
{
  "name": "Open app and find create button",
  "description": "Calibrated from a physical phone UI dump",
  "status": "ACTIVE",
  "steps": [
    {
      "id": "open-app",
      "command": "OPEN_APP",
      "parameters": { "packageName": "com.example.app" },
      "evidence": { "after": true, "onFailure": true }
    },
    {
      "id": "wait-create",
      "command": "WAIT_UI",
      "timeoutMs": 15000,
      "selector": {
        "resourceId": "com.example.app:id/create",
        "contentDescription": "Create",
        "text": "Create post"
      },
      "evidence": { "onFailure": true }
    },
    {
      "id": "tap-create",
      "command": "TAP_UI",
      "selector": {
        "resourceId": "com.example.app:id/create",
        "contentDescription": "Create",
        "text": "Create post",
        "coordinate": { "x": 540, "y": 1600 }
      },
      "evidence": { "before": true, "after": true, "onFailure": true }
    }
  ]
}
```

The compiler always emits selector fallback order:

1. `resourceId`
2. `contentDescription`
3. `text`
4. explicit `coordinate`

A coordinate is never invented. Add it only after calibration from a real selected phone.

Supported recipe commands are `HEALTH_CHECK`, `SCREENSHOT`, `OPEN_APP`, `STOP_APP`, `TAP`, `TAP_UI`, `SWIPE`, `TYPE_TEXT`, `KEYEVENT`, `BACK`, `HOME`, `WAIT_UI`, and `DUMP_UI`.

## API examples

Set a valid manager token first:

```powershell
$farmToken = '<JWT>'
$farmHeaders = @{ Authorization = "Bearer $farmToken"; 'Content-Type' = 'application/json' }
```

Create:

```powershell
$recipeBody = Get-Content -Raw .\recipe.json
Invoke-RestMethod -Method Post -Uri http://localhost:3001/api/v1/automation-recipes -Headers $farmHeaders -Body $recipeBody
```

List/get/update/archive:

```powershell
Invoke-RestMethod -Method Get -Uri http://localhost:3001/api/v1/automation-recipes -Headers $farmHeaders
Invoke-RestMethod -Method Get -Uri http://localhost:3001/api/v1/automation-recipes/<RECIPE_ID> -Headers $farmHeaders
Invoke-RestMethod -Method Patch -Uri http://localhost:3001/api/v1/automation-recipes/<RECIPE_ID> -Headers $farmHeaders -Body '{"status":"ARCHIVED"}'
```

Run on physical devices:

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:3001/api/v1/automation-recipes/<RECIPE_ID>/runs -Headers $farmHeaders -Body '{"deviceCodes":["PHONE-001","PHONE-002"]}'
```

The response contains `runId`, `recipeId`, `recipeVersion`, and the real persisted job for each device. Observe each returned job with the existing Jobs API/dashboard.

## Failure and safety states

Each failed step returns a structured `failureReason` containing at least `code`, `message`, `retryable`, `stepIndex`, `stepId`, and `command`. Selector failures also contain `selectorAttempts` and a safe UI summary.

The Device Agent inspects UI state before risky input and after UI mutations. Login, CAPTCHA, OTP, consent/permission, and account challenge signals stop the sequence. The backend persists the job and device command as `ACTION_REQUIRED`; it does not retry or report success. Challenge bypass is not implemented.

Common codes include:

- `ACTION_REQUIRED`
- `UI_SELECTOR_NOT_FOUND`
- `UI_TIMEOUT`
- `UI_DUMP_FAILED`
- `INVALID_AUTOMATION_SEQUENCE`
- `AUTOMATION_RESULT_INCOMPLETE`
- `DEVICE_AGENT_OFFLINE`

## Run and verify

From the repository root:

```powershell
npm run typecheck --workspace @farm-phone/database
npm run typecheck --workspace @farm-phone/api
npm test --workspace @farm-phone/device-agent
npm run test:e2e:mock --workspace @farm-phone/api -- --runTestsByPath test/automation-recipes.contract-spec.ts
npm run build --workspace @farm-phone/api
```

The automated contract tests use captured XML-shaped fixtures and mocked transport; they prove the compiler, queue state handling, selector ordering, and executor path without claiming a physical-phone acceptance run. Before calibrating a platform recipe, run `DUMP_UI` against the selected physical phone and keep the resulting job/evidence as the selector source.
