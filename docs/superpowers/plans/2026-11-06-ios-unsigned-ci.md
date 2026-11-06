# iOS unsigned IPA CI Implementation Plan

> Use superpowers:executing-plans with independent native modules delegated under superpowers:dispatching-parallel-agents. The user selected CI macOS execution and unsigned Ksign output; do not ask for the same permission again.

**Goal:** download an actual unsigned iphoneos IPA from a successful macOS CI build.

**Architecture:** matching official RN0.87.1 target + current App snapshot, native Swift/Objective-C bridges and platform-specific JS, isolated branch-only GitHub workflow. No main checkout reset and no backend/signing/publishing action.

**Tech stack:** React Native0.87.1/React19.2.3, TypeScript, Swift5 mode/Foundation/Security/UIKit/PDFKit/CoreNFC, Xcode/CocoaPods, GitHub Actions macOS, Python package verifier.

**Spec:** ../specs/2026-11-06-ios-unsigned-ci-design.md.

## Constraints/review focus

- Unsigned device build (iphoneos arm64), not simulator-only artifact; no signing assets or Apple credentials.
- Existing DEV/TEST guards and real error semantics stay. iOS push is OFF/unsupported until a separate iOS/APNs BE contract exists.
- Secrets/session/owner diagnostic files must not enter public source branch or build logs.
- Native output errors, unsupported entitlements and scope changes must fail visibly; no fake data.
- Preserve source and logs; original shared Windows checkout is read-only during iOS implementation.

## Tasks

- [x] Verify repository permission/Actions availability and official template integrity; isolate branch and snapshot current App.
- [ ] Add native helper RED tests and bridge contracts in separate Security/Document/NFC files. Run initial macOS preflight and preserve RED evidence.
- [ ] Implement Security/Document/NFC helper/bridge logic to pass tests; compile UIKit/CoreNFC integration in Xcode.
- [ ] Add IOS platform capability tests RED→GREEN and wire explicit unsupported push without Android impersonation.
- [ ] Register native sources/frameworks, Info.plist permissions/display/bundle IDs and Podfile in the iOS target. Keep Android behavior intact.
- [ ] Add branch-only macOS workflow: source checks, Swift package tests, npm ci/typecheck, pod install, unsigned archive, package verification and artifact/log upload.
- [ ] Secret review + local tests, commit/push dedicated branch and inspect actual CI. Resolve concrete build failures; do not weaken gates to make build green.
- [ ] Download/verify IPA; retain CI logs/artifacts and report source/build SHA plus iPhone/signing/NFC/push limitations.

## Task ownership

Root: snapshot/template/project registration/workflow/packaging/push/CI/platform push JS and final integration.
Security agent: Native/SecurityCore package, WmsSecurityModules.swift/.m only.
Documents agent: Native/DocumentCore package, WmsDocumentModules.swift/.m, native p12Files.ios.ts/p18Preview.ios.ts and their tests only.
NFC agent: Native/NfcCore package, WmsNfcModule.swift/.m only.

Root alone edits pbxproj/Podfile/workflow; agents do not run external/device/backend actions or modify the original App. Helper packages live under Native/<Domain>Core, tests stay in those packages and are excluded from app compile by registration script. Main app includes package Sources Swift files; bridge references their public classes without importing another app module. No child agents needed.
