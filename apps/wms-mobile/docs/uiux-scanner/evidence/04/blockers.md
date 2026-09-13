# Blockers — Prompt 04 Nhập kho

| ID | Status | Detail | Required next step |
| --- | --- | --- | --- |
| B04-01 | RESOLVED | `gsap@3.13.0` is pinned and used only by `ScanBeam.web.tsx` at the BusinessScanScreen call-site. The native adapter is a no-op. Reduced-motion skips render/tween; cleanup kills the tween. Web runtime captures 1.2s apart show the beam moved; Vite build passed. | No remaining action for Prompt 04. |
| B04-02 | RESOLVED | Physical Android device `fbb9e686` (model `2206122SC`, arm64-v8a) opened the BusinessScan camera with CAMERA permission granted; CameraKit client was `ACTIVE` and the preview rendered live frames without a crash or LogBox. | Keep this device evidence with the gate record. |

Core Inbound UI/data flow and the approved Web scan-beam motion are implemented
and tested. No Prompt 04 blocker remains.
