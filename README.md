# Azipod Bridge

A twin-Azipod ship-handling simulator that runs in any modern browser, on phone or desktop, and keeps working offline once installed.

**Open it:** https://volartech.github.io/AZIPOD-SIM/

> Training simulator. **Not for navigation.** Ship data are fictional and the physics, while checked against published model tests, will differ from any real vessel.

## Install

| Device | How |
| --- | --- |
| Android, Windows, macOS, Linux, ChromeOS (Chrome or Edge) | Tap **INSTALL** in the app's button row, or the install icon in the address bar |
| iPhone, iPad | Open in Safari → Share → **Add to Home Screen** |
| No install, no internet | Download [`azipod-bridge-offline.html`](https://volartech.github.io/AZIPOD-SIM/azipod-bridge-offline.html) and open it in any browser |

Installed copies update themselves; the app offers a **RELOAD** button when a new version is out.

## What's inside

- **3-DOF manoeuvring model** (Fossen/MMG form): rigid-body + added mass from Clarke (1983), added-mass Coriolis with the Munk moment, viscous remainder of Clarke's derivatives, strip-wise cross-flow drag with local current, ITTC-57 resistance, shallow-water factors, RK4 at 20 Hz.
- **Azipods**: K_T(J) thrust, reversed-propeller braking, strut lift, propeller cross-flow momentum drag, hull-wash and pod-to-pod losses, 7.5°/s azimuth, 60 s reversal, reverse interlock, shared switchboard, berthing split, build tolerances.
- **Harbour**: Barrass squat and grounding, bank suction, pod wash off walls, discrete cone fenders, six mooring lines on winches, two 40 t tugs.
- **Bridge view**: readouts from simulated DGNSS / gyro / ROT / log / anemometer (optional AIS-feed lag), dynamic predictor with ghost hulls and what-if tracks, forward/aft side speed, joystick with heading and position hold.
- **IMO A.601 pilot card and wheelhouse poster** generated from the model, plus **validation** against the published 277 m twin-Azipod stopping tests (TransNav).

## Develop

```bash
npm ci
npm run dev          # local dev server
npm test             # physics and control regression tests
npm run trials       # IMO-style sea trials in the terminal
npm run validate     # 277 m stopping-test comparison
npm run build:all    # dist/ = PWA + azipod-bridge-offline.html
```

Every push to `main` runs the tests, builds, and publishes to GitHub Pages (`.github/workflows/pages.yml`).

## Licence

Not yet chosen: all rights reserved by VOLARtech until a licence is added.
