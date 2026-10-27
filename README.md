# Azipod Bridge

A twin-Azipod ship-handling simulator that runs in any modern browser, on phone or desktop, and keeps working offline once installed.

**Open it:** https://volartech.github.io/AZIPOD-SIM/

> Training simulator. **Not for navigation.** The 278 m cruise ship is modelled on the published particulars of an Azipod cruise ship of the *Valiant Lady* class; hull derivatives, windage and bow-thruster data are estimates, the Amsterdam harbour is a schematic, and the PortMiami chart is reduced and simplified from NOAA ENCs and may be out of date. Behaviour will differ from any real vessel.

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
- **Ships**: a 278 m twin-Azipod cruise ship (2 × 16 MW pods, bow thrusters, ~22 kn) and a 135 m twin-Azipod training ship.
- **Real chart**: PortMiami from official NOAA ENC harbour cells (S-57, 1:12 000): IHO S-52-style depth shading against the ship's safety contour, depth contours, spot soundings, dredged channels and berths, buoys, beacons and lights. A 10 m depth grid built from the soundings and contours, clamped to the charted depth areas, drives under-keel clearance, squat and grounding, and the charted land and wharves are the contact model. Start: Main Channel, berth at Terminal V. `tools/chart/` holds the fetch (GitHub Actions, `chart data` workflow) and build scripts; the raw extract lives on the `chart-data` branch.
- **Harbours**: Amsterdam, Passenger Terminal Amsterdam on the IJ (600 m quay, 10 m alongside, 60 t tugs), plus the training berths and open-water trials areas.
- **Harbour physics**: Barrass squat and grounding, bank suction, pod wash off walls, discrete cone fenders, six mooring lines on winches, tugs.
- **3D view** (v3): out-of-the-window view from the wheelhouse, either bridge wing, or a chase camera, as a split screen with the chart or full screen. Drag to look around, pinch or scroll to zoom (binoculars), double-tap to reset. Day, dusk and night follow the chart palette; navigation lights, quay lamps, compressing fenders, sagging mooring lines, tugs, and the predicted track on the water. Uses WebGPU where the browser has it and WebGL2 otherwise; loaded only when you open it.
- **Conning display**: readouts from simulated DGNSS / gyro / ROT / log / anemometer (optional AIS-feed lag), dynamic predictor with ghost hulls and what-if tracks, forward/aft side speed, joystick with heading and position hold.
- **IMO A.601 pilot card and wheelhouse poster** generated from the model, plus **validation** against the published 277 m twin-Azipod stopping tests (TransNav).

## Keys

Port pod `A` `D` azimuth, `W` `S` rpm · stbd pod `J` `L`, `I` `K` · bow thruster `Q` `E` · joystick arrows · `H` head-up · `V` chart / split / 3D · `C` 3D camera.

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
