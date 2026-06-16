---
name: testflight
description: >-
  Builds, uploads, and distributes a new Gist iPhone app TestFlight build via
  App Store Connect. Loads ASC credentials from repo-root .env, bumps build
  number, archives with xcodebuild, uploads the IPA, waits for processing, and
  always attaches the build to internal testers. Use when the user pushes a new
  TestFlight build, says testflight, upload to TestFlight, or ships the Gist
  iOS beta (Plan 234 Phase 5).
---

# TestFlight (Gist iPhone app)

Ship a new **Gist** (`packages/ios-app`) build to TestFlight end-to-end. This
skill is **gist-only** — not the crossfade Aperture flow.

**Not** generic `deploy` (Worker/Firebase) or `ios` (Simulator + Mobile Safari).
Use those for backend ship and web-on-iOS debugging.

## One-time setup (before first upload)

1. **Create the ASC app record** in [App Store Connect](https://appstoreconnect.apple.com)
   → My Apps → **+** → iOS. There is no API for this step.
   - Name: **Gist**
   - Bundle ID: `com.mattmireles.gist`
   - SKU: any unique string (e.g. `gist-ios-v1`)
2. After creation, note the numeric **ASC app id** from the app URL or run
   `python3 scripts/asc_check_build_status.py` (once scripts resolve the app).
   Optionally pin it in repo-root `.env` as `GIST_ASC_APP_ID=<id>`.
3. Confirm the sibling **botnet** checkout exists at `../../../botnet` relative
   to `packages/ios-app` (Kokoro CoreML Swift package — Plan 234 Phase 4+).
4. Xcode logged in with team **6ETYBAJKY8**; automatic signing enabled in
   `packages/ios-app/project.yml`.

## Credentials (.env)

Read scalar values from repo-root `.env` with `read_env_scalar` or Python
`asc_provision_gist._load_dotenv` — **never** `source .env` or `. ./.env`.

| Variable | Role |
| --- | --- |
| `ISSUER_ID` | ASC API issuer UUID (`--apiIssuer` / JWT `iss`) |
| `APP_STORE_CONNECT_API_KEY_ID` | ASC API key id (`--apiKey` / JWT `kid`) |
| `APP_STORE_CONNECT_API_KEY` | Optional PEM body; materializes `AuthKey_<KEY_ID>.p8` when the file is missing |
| `GIST_ASC_APP_ID` | Optional; ASC internal app id once the Gist app record exists |

Fallback aliases used by provisioning scripts: `ASC_ISSUER_ID`, `ASC_KEY_ID`,
`ASC_KEY_PATH`, `APP_STORE_CONNECT_API_ISSUER_ID`.

The `.p8` file lives at repo root: `AuthKey_${APP_STORE_CONNECT_API_KEY_ID}.p8`.
Do not commit it; derive from `APP_STORE_CONNECT_API_KEY` only on the build machine.

## Fixed product constants

| Constant | Value |
| --- | --- |
| Main bundle ID | `com.mattmireles.gist` |
| Share extension | `com.mattmireles.gist.share` |
| App Group | `group.com.mattmireles.gist` |
| Team | `6ETYBAJKY8` |
| IPA output | `Scratchpad/GistAppExport/GistApp.ipa` |
| Xcode project | `packages/ios-app/GistApp.xcodeproj` |
| Plan | `README/Plans/234-iphone-app-share-read-listen-plan.md` Phase 5 |

## Workflow checklist

Copy and track:

```
TestFlight progress:
- [ ] ASC app record exists (one-time UI)
- [ ] Pre-flight: swift test + xcodegen sanity
- [ ] Bump GIST_BUILD_VERSION (must be unused)
- [ ] Archive + export IPA (xcodebuild)
- [ ] Upload to ASC
- [ ] Wait for processing + export compliance
- [ ] Attach to Internal testers (always)
- [ ] Ask user about external groups
```

### 0. Pre-flight

```bash
cd packages/ios-app && swift test
cd packages/ios-app && xcodegen generate --spec project.yml
```

Fix parity failures before archiving. Kokoro listen builds need the botnet
sibling and Core ML model resources under `App/Resources/Kokoro/`.

### 1. Bump build number

TestFlight rejects a reused `CFBundleVersion`. Query the latest ASC build, then
bump:

```bash
python3 scripts/asc_check_build_status.py | head -5
export GIST_BUILD_VERSION=<next_integer>
```

The build script writes this into both `App/Info.plist` and
`ShareExtension/Info.plist` before archive.

### 2. Archive + export IPA

Primary path — **automatic signing** via Xcode (logged-in developer Mac):

```bash
GIST_BUILD_VERSION="${GIST_BUILD_VERSION}" scripts/build_gist_app_ipa.sh
```

Output: `Scratchpad/GistAppExport/GistApp.ipa`.

**Headless signing fallback** (no Xcode GUI session): provision App Store
profiles first, then re-sign — only if automatic archive fails:

```bash
python3 scripts/asc_provision_gist.py
# -> Scratchpad/GistAppProfiles/gist_appstore.mobileprovision
```

### 3. Upload

Preferred headless path (credentials from `.env`):

```bash
GIST_UPLOAD=1 GIST_BUILD_VERSION="${GIST_BUILD_VERSION}" scripts/build_gist_app_ipa.sh
```

Or upload only:

```bash
xcrun altool --upload-app \
  -f Scratchpad/GistAppExport/GistApp.ipa \
  -t ios \
  --apiKey "${APP_STORE_CONNECT_API_KEY_ID}" \
  --apiIssuer "${ISSUER_ID}"
```

GUI fallback: drag the IPA into **Transporter.app** or **Xcode Organizer**.

If saving upload logs under `Scratchpad/`, redact `--apiKey` / `--apiIssuer`
values first.

### 4. Wait, compliance, internal distribution (always)

```bash
GIST_BUILD_VERSION="${GIST_BUILD_VERSION}" python3 scripts/asc_distribute_testflight.py
```

This script:

1. Polls until the target build is `VALID` (or use `--build-version N`).
2. Answers export compliance (`usesNonExemptEncryption=false`) when missing.
3. **Always** attaches the build to the **Internal** beta group.

`--no-wait` skips polling when the build is already `VALID`.

### 5. External groups — ask the user

After internal distribution succeeds, **stop and ask**:

> Add this build to an external TestFlight group as well? Available groups are
> listed by `asc_check_build_status.py`.

Only attach external groups when the user names one. External groups may need
beta review before testers can install.

```bash
python3 scripts/asc_distribute_testflight.py --external "Friends"
```

Repeat `--external` for multiple groups.

### 6. Report back

Tell the user:

- Build version uploaded (`GIST_BUILD_VERSION`)
- Processing state (`VALID` / still processing)
- Internal group attached (yes)
- External groups attached (if any)
- Link: App Store Connect → Gist → TestFlight

Record build number + delivery notes in `README/Notes/` (via `write-notes`) for
milestone uploads per Plan 234 Phase 5.

## Diagnostics

```bash
python3 scripts/asc_check_build_status.py          # builds + beta groups
python3 scripts/asc_check_build_status.py --set-compliance  # compliance only
```

## Failure modes

| Symptom | Fix |
| --- | --- |
| `no app` / `GIST_ASC_APP_ID` unset and lookup empty | Create the ASC app record once in the UI; set `GIST_ASC_APP_ID` in `.env`. |
| Duplicate build version | Bump `GIST_BUILD_VERSION`. |
| Build stuck `PROCESSING` | Wait; re-run `asc_distribute_testflight.py`. |
| `ASC no build with version N` right after upload | ASC ingest lag — retry inside the poll loop or wait and re-run. **Always verify attach** (`asc_check_build_status.py` or `=== distributed build vN ===`). |
| Missing export compliance | `asc_distribute_testflight.py` sets it; or `--set-compliance`. |
| Archive signing errors | Confirm Xcode account + team 6ETYBAJKY8; run `asc_provision_gist.py` for headless fallback. |
| Kokoro / botnet link errors | Ensure `../../../botnet` exists; see `packages/ios-app/README.md`. |
| `swift test` parity red | Fix `SlideTextContracts` / fixtures before shipping audio builds. |

## Related

- App README: [packages/ios-app/README.md](../../../packages/ios-app/README.md)
- Plan gate: [README/Plans/234-iphone-app-share-read-listen-plan.md](../../../README/Plans/234-iphone-app-share-read-listen-plan.md) Phase 5
- Simulator debugging (not TestFlight): **`ios`** skill
- Kokoro on-device synth: **`kokoro`** skill
- Tester messaging (not mechanics): **`growth`** skill
