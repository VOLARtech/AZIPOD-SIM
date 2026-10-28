# Azipod Bridge: technical notes

The physics, data sources, ship models and developer workflow behind the simulator. For an overview in plain language, see the [README](../README.md).

> Training simulator. **Not for navigation.** The 278 m cruise ship is modelled on the published particulars of an Azipod cruise ship of the *Valiant Lady* class; hull derivatives, windage and bow-thruster data are estimates, the Amsterdam harbour is a schematic, and the PortMiami chart is reduced and simplified from NOAA ENCs and may be out of date. Behaviour will differ from any real vessel.

## What's inside

- **3-DOF manoeuvring model** (Fossen/MMG form): rigid-body + added mass from Clarke (1983), added-mass Coriolis with the Munk moment, viscous remainder of Clarke's derivatives, strip-wise cross-flow drag with local current, ITTC-57 resistance, shallow-water factors, RK4 at 20 Hz.
- **Azipods**: K_T(J) thrust, reversed-propeller braking, strut lift, propeller cross-flow momentum drag, hull-wash and pod-to-pod losses, 7.5°/s azimuth, 60 s reversal, reverse interlock, shared switchboard, berthing split, build tolerances.
- **Ships**: a 293 m Spirit-class cruise ship (Carnival Spirit's published particulars: 260.6 m Lpp, 32.2 m beam, 7.8 m draught, 2 × 17.6 MW Azipods, 3 × 1.91 MW bow thrusters), a 278 m Lady-class cruise ship (2 × 16 MW), and a 135 m twin-Azipod training ship. The cruise scenarios use the Spirit-class ship, drawn in 3D from a detailed 1:300 model (Carnival Spirit hobby model from 3D Warehouse, converted to STL by iconic3dmodels) with livery painted per pixel: antifouling, boot top, sheer stripe, portholes, balcony bands that light up at night, teak decks, lifeboats and funnel. `tools/ship/stl_to_ship.py` converts an STL into the app's compact model format.
- **Sound and haptics**: procedural Web Audio, no samples. Each pod's motor and propeller churn follows its actual rpm and load, panned port and starboard, and gets rougher through a reversal or crash stop. Also bow thruster roar, azimuth servo while the pods slew, water past the hull, wind, a thud and squeal on fenders, ringing plating and scraping on steel-to-concrete contact, a grounding rumble, mooring lines creaking under load, a crack when a line parts, and alert chimes. Vibration (Android / Chrome) on lever detents (zero rpm, every 10 %, every 15° of azimuth), landings scaled by severity, collisions, grounding and parted lines; iOS Safari has no web vibration. Settings under *Sensors & display*.
- **Real chart**: PortMiami from official NOAA ENC harbour cells (S-57, 1:12 000): IHO S-52-style depth shading against the ship's safety contour, depth contours, spot soundings, dredged channels and berths, buoys, beacons and lights. A 10 m depth grid built from the soundings and contours, clamped to the charted depth areas, drives under-keel clearance, squat and grounding, and the charted land and wharves are the contact model. Start: Main Channel, berth at Terminal V. `tools/chart/` holds the fetch (GitHub Actions, `chart data` workflow) and build scripts; the raw extract lives on the `chart-data` branch.
- **Harbours**: Amsterdam, Passenger Terminal Amsterdam on the IJ (600 m quay, 10 m alongside, 60 t tugs), plus the training berths and open-water trials areas.
- **Harbour physics**: Barrass squat and grounding, bank suction, pod wash off walls, discrete cone fenders, six mooring lines on winches, tugs.
- **3D view** (v3): out-of-the-window view from the wheelhouse, either bridge wing, or a chase camera, as a split screen with the chart or full screen. Drag to look around, pinch or scroll to zoom (binoculars), double-tap to reset. In the chase camera, drag down to take the camera below the surface (or pick the PODS camera): the Azipods turn to their actual azimuth, slewing at the real rate, the propellers spin with the actual rpm and reverse with it, and the wash streams bubbles in the jet direction; bow thruster tunnels show on both sides. Day, dusk and night follow the chart palette; navigation lights, quay lamps, compressing fenders, sagging mooring lines, tugs, and the predicted track on the water. Uses WebGPU where the browser has it and WebGL2 otherwise; loaded only when you open it. Physically based sky with clouds lights the scene (image-based lighting, ACES tone mapping); the sun casts shadows; the water reflects the sky (and, at High quality, the ship and quays through a planar mirror) with Fresnel and sun glitter; ambient occlusion at High quality; foam from each pod's actual wash, the bow thruster jet, the bow wave and the stern wake. *3D quality* (Auto / Low / High) under Sensors & display: Auto picks High on desktops, Low on phones. PortMiami scenery: land from the NOAA ENC, and about 13,000 buildings with their real footprints and heights, parks and beaches, roads and bridges (MacArthur Causeway, Port Boulevard), palms and the port's 14 container gantries from OpenStreetMap; facades get window grids that reflect the sky by day and light up at night. Building and road data © OpenStreetMap contributors, available under the Open Database License (ODbL 1.0); `tools/osm/` fetches (GitHub Actions, `osm data` workflow) and builds it.
- **Conning display**: readouts from simulated DGNSS / gyro / ROT / log / anemometer (optional AIS-feed lag), dynamic predictor with ghost hulls and what-if tracks, forward/aft side speed, joystick with heading and position hold.
- **IMO A.601 pilot card and wheelhouse poster** generated from the model, plus **validation** against the published 277 m twin-Azipod stopping tests (TransNav).
- **3D ship models**: besides the Spirit, every ship except the push convoy is drawn with a real 3D model: from Sketchfab under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), or supplied for the project (Paspaley Pearl). Each is fitted to the ship's length, beam and draught, simplified, its textures compressed to WebP, and its own propellers and rudders replaced by the simulator's moving ones. A model shows the type of ship, not that exact ship. Models load the first time a ship is shown and are kept for offline use from then on; the offline single-file copy draws ships procedurally. Credits:
  - lady: “[Viking Cruise Ship](https://sketchfab.com/3d-models/none-c82a7e2bbf4c44e3ac1d1e7bac42e2b7)” by jfactory
  - cruise-shaft: “[Carnival Fantasy](https://sketchfab.com/3d-models/none-eced5ea7f7b8460aaf91e8d9bb34427f)” by gmanisdabossatbeastmode
  - becancour: “[MS Vesteraalen](https://sketchfab.com/3d-models/none-58cc913aad14466c8b83ca44f3a8043c)” by gmanisdabossatbeastmode
  - hsc-cat: “[A fast passenger catamaran ferry](https://sketchfab.com/3d-models/none-1325955eece245fb91bc20ed6d666194)” by kekgaminglive986
  - asd-tug: “[Rastar 3200 tugboat](https://sketchfab.com/3d-models/none-1bbadbe4ab0a4b2599cd3f450942e6fe)” by davidbroutian
  - rotor-tug: “[Tug Boat](https://sketchfab.com/3d-models/none-2260a148c83c41c0b9ffc491f8ee7863)” by agt14032013
  - vsp-tug: “[Tug Boat 02](https://sketchfab.com/3d-models/none-1b64860d3aaa41e8b82afcb0d56fae52)” by agt14032013
  - psv, ahts: “[Multi Purpose Offshore Vessel](https://sketchfab.com/3d-models/none-c604045da67a4a0b93d8ce4dc8db3e56)” by agt14032013
  - icebreaker: “[Icebreaker](https://sketchfab.com/3d-models/none-1ed361672e6e42298fa5b92dd61127bd)” by agt14032013
  - superyacht: “[Clio](https://sketchfab.com/3d-models/none-306ef5879ba44031851be0555b80484d)” by gmanisdabossatbeastmode
  - kvlcc2, kvlcc2-ballast: “[Oil tanker](https://sketchfab.com/3d-models/none-63339c2e2f274672a9bdcf924864ae62)” by factorydottcat
  - lng: “[Gas Carrier Ship](https://sketchfab.com/3d-models/none-0fe1b96ac2754fb59e0745443294eb50)” by medialog
  - panamax, panamax-rotor: “[Bulk Carrier](https://sketchfab.com/3d-models/none-93c076900f004102b78dfac989efae1d)” by medialog
  - kcs, ulcv: “[Container Ship](https://sketchfab.com/3d-models/none-aaa41cca946b4a08bc08cf692b7757be)” by RM02
  - ropax: “[PRIDE OF KENT (P&O Ferries)](https://sketchfab.com/3d-models/none-f7c269fbb81e4072b72e28b085e52c7e)” by ipierre
  - frigate: “[1:1 Low poly US NAVY DDG-51 USS Arleigh Burke.](https://sketchfab.com/3d-models/none-17be09c31c6047e4a5969b68c29eba03)” by WTigerTw
  - paspaley-pearl: “Paspaley Pearl”, supplied by VOLARtech (not from Sketchfab; source in `tools/ship/sources/`, unpacked by `fetch_sketchfab.py` like a download)

  `tools/ship/` rebuilds them: `fetch_sketchfab.py` (needs `SKETCHFAB_TOKEN`), then `build_models.py`, which runs `prepare_ship.py` (fit, clean) and `optimise.sh` (gltf-transform: simplify, WebP, meshopt) and writes `src/view3d/models/`. The bridge camera stands just ahead of each model's wheelhouse, found from its height profile; `eye` in `tools/ship/models.json` overrides it where that guess is wrong, and `build_models.py WORKDIR --registry` rewrites only the registry.
- **Fleet and propulsion** (pick a ship in the menu; each brings its own bridge station). The plan behind it is in [`expansion/PLAN.md`](expansion/PLAN.md).

  | Propulsion | Ships | Station |
  | --- | --- | --- |
  | Twin Azipods | Spirit-class and Lady-class cruise ships, 135 m training ship, 53.5 m expedition yacht *Paspaley Pearl*; three-pod icebreaker | Azipod levers and joystick; combi-levers on the icebreaker |
  | Single screw, direct-reversing two-stroke | VLCC on the KVLCC2 hull (laden and ballast), 3600 TEU container ship on the KCS hull, Panamax bulker (also with four Flettner rotor sails), 24 000 TEU container ship, twin-skeg LNG carrier | Engine telegraph, helm, rpm gauge, starting air |
  | Twin CPP, flap rudders | Ro-Pax ferry, frigate on the DTMB 5415 hull | Pitch levers (constant rpm or combinator) |
  | Electric shafts | Twin-screw cruise ship, superyacht | Propulsion levers through zero |
  | Reversing gearboxes, flanking rudders | Four-barge push convoy | Levers, helm for steering and flanking rudders |
  | Z-drives, Voith Schneider, three azimuths | ASD escort tug, Voith tractor tug, rotor tug | Combi-levers or VSP pads, towline winch, heel |
  | Waterjets | 70 m fast-ferry catamaran | Bucket/rpm levers, nozzle helm, joystick, comfort |
  | DP thruster suites | Platform supply vessel, anchor-handling tug | DP console |

- **Propulsion physics**: MMG-standard shaft, propeller and rudder (Yasukawa & Yoshimura 2015) with transverse thrust, four-quadrant propeller, flap and Schilling rudders; two-stroke engine with air starts, reversal, minimum and barred speeds, load programme and stalls; CPP with pitch servo; Z-drives and Azipods on the pod model; Voith Schneider as a lagged thrust vector; waterjets from momentum flux with a pump power balance, reversing bucket, cavitation limit; tunnel thrusters; power management on the switchboard. KVLCC2 matches an independent implementation of the published MMG model within 1 % in turning and zig-zags.
- **Hulls**: Clarke's derivatives for most ships, the published MMG hull for KVLCC2, catamaran demi-hulls with the resistance hump of fast slender hulls, tug fallbacks where Clarke's regression runs out, and a lifting skeg.
- **Trials**: IMO MSC.137(76) turning, initial turning, zig-zags and stopping for conventional ships; reported but not graded for pods, VSP and waterjets; HSC turning, crash stop and passenger accelerations against the HSC Code.
- **Tugs and escort**: roll as a fourth degree of freedom from the lateral forces and their heights (deck edge, girting, capsize); an HMPE towline with brake, render, heave, pay out and quick release; the escorted VLCC runs her own model and autopilot, and her rudder jams on cue.
- **Dynamic positioning**: thrust allocation over every unit with forbidden sectors and saturation; joystick, auto heading and auto position with wind feed-forward; three position references with median voting; consequence analysis; capability plot intact and after the worst single failure; instructor faults (unit trip, blackout and restart, single and common-mode DGNSS drift).
- **Other ships, ice and wind**: ship–ship interaction when meeting and overtaking (shape after Varyani et al. 2004), traffic on scripted tracks; level ice from Lindqvist (1989) with the broken channel behind the ship; Flettner rotor sails on Magnus lift; river currents that follow the bend.
- **More scenarios**: crude-oil jetty, tug escort of a laden VLCC, channel meeting and overtaking, river bend with a bridge span, fast ferry entering harbour at speed, DP supply run at a platform, breaking a channel in ice, ocean passage under rotor sails.
- **Regression**: `npm run golden` re-runs the original Azipod ships through every scenario, the predictor, trials and validation and compares at full precision, so new ships and units never change the old ones.

## Keys

Azipod ships: port pod `A` `D` azimuth, `W` `S` rpm · stbd pod `J` `L`, `I` `K` · bow thruster `Q` `E` · joystick arrows. Telegraph and lever ships: `W` `S` engine order, `A` `D` helm, `X` stop, `M` midships. Waterjets: `J` joystick mode. DP: `1` `2` `3` modes, `W` `A` `S` `D` `Q` `E` joystick, `I` `J` `K` `L` `U` `O` move the setpoint. Everywhere: `H` head-up · `V` chart / split / 3D · `C` 3D camera.

## Develop

```bash
npm ci
npm run dev          # local dev server
npm test             # physics and control regression tests
npm run golden       # Azipod ships bit-identical to the reference
npm run trials       # IMO-style sea trials in the terminal
npm run validate     # 277 m stopping-test comparison
npm run build:all    # dist/ = PWA + azipod-bridge-offline.html
```

Every push to `main` runs the tests, builds, and publishes to GitHub Pages (`.github/workflows/pages.yml`).
