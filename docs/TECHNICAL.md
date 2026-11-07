# SHIPSHAPE: technical notes

The physics, data sources, ship models and developer workflow behind the simulator. For an overview in plain language, see the [README](../README.md); for how the physics compares with published tests and real ships, see the [physics audit](PHYSICS_AUDIT.md).

> Training simulator. **Not for navigation.** The 278 m cruise ship is modelled on the published particulars of an Azipod cruise ship of the *Valiant Lady* class; hull derivatives, windage and bow-thruster data are estimates, the Amsterdam passenger terminal is a schematic, and the real-chart areas (PortMiami, Los Angeles–Long Beach, IJmuiden–Amsterdam) are reduced, gridded and simplified from official charts and surveys that may be out of date. Behaviour will differ from any real vessel.

## What's inside

- **3-DOF manoeuvring model** (Fossen/MMG form): rigid-body + added mass from Clarke (1983), added-mass Coriolis with the Munk moment, viscous remainder of Clarke's derivatives, strip-wise cross-flow drag with local current, ITTC-57 resistance, shallow-water factors, RK4 at 20 Hz.
- **Azipods**: K_T(J) thrust, reversed-propeller braking, strut lift, propeller cross-flow momentum drag, hull-wash and pod-to-pod losses, 7.5°/s azimuth, 60 s reversal, reverse interlock, shared switchboard, berthing split, build tolerances.
- **Ships**: a 293 m Spirit-class cruise ship (Carnival Spirit's published particulars: 260.6 m Lpp, 32.2 m beam, 7.8 m draught, 2 × 17.6 MW Azipods, 3 × 1.91 MW bow thrusters), a 278 m Lady-class cruise ship (2 × 16 MW), and a 135 m twin-Azipod training ship. The cruise scenarios use the Spirit-class ship, drawn in 3D from a detailed 1:300 model (Carnival Spirit hobby model from 3D Warehouse, converted to STL by iconic3dmodels) with livery painted per pixel: antifouling, boot top, sheer stripe, portholes, balcony bands that light up at night, teak decks, lifeboats and funnel. `tools/ship/stl_to_ship.py` converts an STL into the app's compact model format.
- **Sound and haptics**: procedural Web Audio, no samples. Each pod's motor and propeller churn follows its actual rpm and load, panned port and starboard, and gets rougher through a reversal or crash stop. Also bow thruster roar, azimuth servo while the pods slew, water past the hull, wind, a thud and squeal on fenders, ringing plating and scraping on steel-to-concrete contact, a grounding rumble, mooring lines creaking under load, a crack when a line parts, and alert chimes. Vibration (Android / Chrome) on lever detents (zero rpm, every 10 %, every 15° of azimuth), landings scaled by severity, collisions, grounding and parted lines; iOS Safari has no web vibration. Settings under *Sensors & display*.
- **Real charts**: three areas built from official charts and surveys (see *Areas and data* below). PortMiami from official NOAA ENC harbour cells (S-57, 1:12 000): IHO S-52-style depth shading against the ship's safety contour, depth contours, spot soundings, dredged channels and berths, buoys, beacons and lights. A 10 m depth grid built from the soundings and contours, clamped to the charted depth areas, drives under-keel clearance, squat and grounding, and the charted land and wharves are the contact model. Start: Main Channel, berth at Terminal V. `tools/chart/` holds the fetch (GitHub Actions, `chart data` workflow) and build scripts; the raw extract lives on the `chart-data` branch.
- **Harbours**: Amsterdam, Passenger Terminal Amsterdam on the IJ (600 m quay, 10 m alongside, 60 t tugs), plus the training berths and open-water trials areas.
- **Harbour physics**: Barrass squat and grounding, bank suction, pod wash off walls, discrete cone fenders, six mooring lines on winches, tugs.
- **3D view** (v3): out-of-the-window view from the wheelhouse, either bridge wing, or a chase camera, as a split screen with the chart or full screen. Drag to look around, pinch or scroll to zoom (binoculars), double-tap to reset. In the chase camera, drag down to take the camera below the surface (or pick the PODS camera): the Azipods turn to their actual azimuth, slewing at the real rate, the propellers spin with the actual rpm and reverse with it, and the wash streams bubbles in the jet direction; bow thruster tunnels show on both sides. Day, dusk and night follow the chart palette; navigation lights, quay lamps, compressing fenders, sagging mooring lines, tugs, and the predicted track on the water. Uses WebGPU where the browser has it and WebGL2 otherwise; loaded only when you open it. Physically based sky with clouds lights the scene (image-based lighting, ACES tone mapping); the sun casts shadows; the water reflects the sky (and, at High quality, the ship and quays through a planar mirror) with Fresnel and sun glitter; ambient occlusion at High quality; foam from each pod's actual wash, the bow thruster jet, the bow wave and the stern wake. *3D quality* (Auto / Low / High) under Sensors & display: Auto picks High on desktops, Low on phones. PortMiami scenery: land from the NOAA ENC, and about 13,000 buildings with their real footprints and heights, parks and beaches, roads and bridges (MacArthur Causeway, Port Boulevard), palms and the port's 14 container gantries from OpenStreetMap; facades get window grids that reflect the sky by day and light up at night. Building and road data © OpenStreetMap contributors, available under the Open Database License (ODbL 1.0); `tools/osm/` fetches (GitHub Actions, `osm data` workflow) and builds it.
- **Conning display**: readouts from simulated DGNSS / gyro / ROT / log / anemometer (optional AIS-feed lag), dynamic predictor with ghost hulls and what-if tracks, forward/aft side speed, joystick with heading and position hold.
- **IMO A.601 pilot card and wheelhouse poster** generated from the model, plus **validation** against the published 277 m twin-Azipod stopping tests (TransNav).
- **3D ship models**: besides the Spirit, every ship except the push convoy is drawn with a real 3D model: from Sketchfab under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), or supplied for the project (Paspaley Pearl). The CB Baltic uses the tanker model, fitted to her size and painted in her class livery (after her sister Baltic Sun II: red bottom up to the summer mark, so it shows in ballast; charcoal topsides; maroon decks, piping and crane; white house with maroon decks; a yellow funnel casing with a black top; orange lifeboat davit): a model without colours of its own can carry a paint scheme (`look.paint`), applied surface by surface from where each sits on the ship, with the deck level found from the model. Each is fitted to the ship's length, beam and draught, simplified, its textures compressed to WebP, and its own propellers and rudders replaced by the simulator's moving ones. A model shows the type of ship, not that exact ship. Models load the first time a ship is shown and are kept for offline use from then on; the offline single-file copy draws ships procedurally. Credits:
  - lady: “[Viking Cruise Ship](https://sketchfab.com/3d-models/none-c82a7e2bbf4c44e3ac1d1e7bac42e2b7)” by jfactory
  - cruise-shaft: “[Carnival Fantasy](https://sketchfab.com/3d-models/none-eced5ea7f7b8460aaf91e8d9bb34427f)” by gmanisdabossatbeastmode
  - becancour: “[MS Vesteraalen](https://sketchfab.com/3d-models/none-58cc913aad14466c8b83ca44f3a8043c)” by gmanisdabossatbeastmode
  - hsc-cat: “[A fast passenger catamaran ferry](https://sketchfab.com/3d-models/none-1325955eece245fb91bc20ed6d666194)” by kekgaminglive986
  - asd-tug: “[Rastar 3200 tugboat](https://sketchfab.com/3d-models/none-1bbadbe4ab0a4b2599cd3f450942e6fe)” by davidbroutian
  - rotor-tug: “[Tug Boat](https://sketchfab.com/3d-models/none-2260a148c83c41c0b9ffc491f8ee7863)” by agt14032013
  - vsp-tug: “[Tug Boat 02](https://sketchfab.com/3d-models/none-1b64860d3aaa41e8b82afcb0d56fae52)” by agt14032013
  - psv, ahts: “[Multi Purpose Offshore Vessel](https://sketchfab.com/3d-models/none-c604045da67a4a0b93d8ce4dc8db3e56)” by agt14032013
  - icebreaker: “[Icebreaker](https://sketchfab.com/3d-models/none-1ed361672e6e42298fa5b92dd61127bd)” by agt14032013
  - superyacht: “[Frickie's Yacht](https://sketchfab.com/3d-models/frickies-yacht-a5b72f2a23cd4e1f9eaf49059606c7a3)” by rubenn, [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/): non-commercial only, so this model must be replaced if SHIPSHAPE is ever sold or carries ads
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

- **Propulsion physics**: MMG-standard shaft, propeller and rudder (Yasukawa & Yoshimura 2015) with transverse thrust, four-quadrant propeller, flap and Schilling rudders; two-stroke engine with air starts, reversal (astern start below 40 % rpm after 20 s to reverse the camshaft), minimum and barred speeds, load-up and load-down programmes and stalls; CPP with pitch servo; Z-drives and Azipods on the pod model; Voith Schneider as a lagged thrust vector; waterjets from momentum flux with a pump power balance, reversing bucket, cavitation limit; tunnel thrusters; power management on the switchboard. KVLCC2 matches an independent implementation of the published MMG model within 1 % in turning and zig-zags.
- **Hulls**: Clarke's derivatives for most ships, the published MMG hull for KVLCC2, catamaran demi-hulls with the resistance hump of fast slender hulls, tug fallbacks where Clarke's regression runs out, and a lifting skeg.
- **Trials**: IMO MSC.137(76) turning, initial turning, zig-zags and stopping for conventional ships; reported but not graded for pods, VSP and waterjets; HSC turning, crash stop and passenger accelerations against the HSC Code.
- **Tugs and escort**: roll as a fourth degree of freedom from the lateral forces and their heights (deck edge, girting, capsize); an HMPE towline with brake, render, heave, pay out and quick release; the escorted VLCC runs her own model and autopilot, and her rudder jams on cue.
- **Dynamic positioning**: thrust allocation over every unit with forbidden sectors and saturation; joystick, auto heading and auto position with wind feed-forward; three position references with median voting; consequence analysis; capability plot intact and after the worst single failure; instructor faults (unit trip, blackout and restart, single and common-mode DGNSS drift).
- **Other ships, ice and wind**: ship–ship interaction when meeting and overtaking (shape after Varyani et al. 2004), traffic on scripted tracks; level ice from Lindqvist (1989) with the broken channel behind the ship; Flettner rotor sails on Magnus lift; river currents that follow the bend.
- **More scenarios**: crude-oil jetty, tug escort of a laden VLCC, channel meeting and overtaking, river bend with a bridge span, fast ferry entering harbour at speed, DP supply run at a platform, breaking a channel in ice, ocean passage under rotor sails.
- **Regression**: `npm run golden` re-runs the original Azipod ships through every scenario, the predictor, trials and validation and compares at full precision, so new ships and units never change the old ones.

## Keys

Azipod ships: port pod `A` `D` azimuth, `W` `S` rpm · stbd pod `J` `L`, `I` `K` · bow thruster `Q` `E` · joystick arrows. Telegraph and lever ships: `W` `S` engine order, `A` `D` helm, `X` stop, `M` midships. Waterjets: `J` joystick mode. DP: `1` `2` `3` modes, `W` `A` `S` `D` `Q` `E` joystick, `I` `J` `K` `L` `U` `O` move the setpoint. Everywhere: `H` head-up · `V` chart / split / 3D · `C` 3D camera.

## Starting position and berth layout

- **Start:** if the ship chosen draws too much for a scenario's start (the water along her whole keel must exceed the draught plus 30 cm, or 3 %), she starts at the nearest spot within a few hundred metres that is deep enough, same heading, with a toast saying so. Example: a 3600 TEU container ship in PortMiami moves 25 m north, into the deeper side of the channel. A scenario's own ship always keeps its start.
- **Berth editor** (`src/ui/berthedit.ts`; Menu → Berth → Edit on the chart):
  - + BOLLARD puts a bollard 1.5 m in from the nearest quay, pier or dolphin edge.
  - + FENDER puts a fender on that face, facing the water, like the nearest existing fender (or a 1 m cone, SCN 1000 class).
  - REMOVE takes away the nearest one within 12 m; a line made fast to a removed bollard is let go.
  - The layout is kept per scenario in this browser. RESET restores the scenario's own, and the 3D harbour is rebuilt when editing ends.
- **Crude terminal:** quick-release hooks at both ends of each breasting dolphin (springs) and on the loading platform, with mooring dolphins at ±160, ±185 and ±230 m (breasts, head and stern lines). All six lines reach a bollard for every ship that fits the berth.

## Areas and data

Three real-chart areas, each one *area pack* (depths and land for the physics) and one chart, built by `tools/chart/build_region.py` from the raw extract that `tools/chart/fetch_region.py` (or the `chart data` workflow) downloads:

| Area | Sources | Depth grids | Datum | IALA | Scenarios |
| --- | --- | --- | --- | --- | --- |
| PortMiami and Biscayne Bay approaches | NOAA ENC (public domain) | 10 m harbour, 40 m approaches | MLLW, tide +0.3 m | B | Terminal V; from the sea buoy to Berth 4; container ship to Fisherman's Channel |
| Ports of Los Angeles and Long Beach | 16 NOAA ENC cells, band 4–5 (public domain) | 10 m inside the breakwaters, 40 m outside | MLLW, mid tide +1.0 m | B | 400 m ULCV to Pier 400; laden VLCC to the T121 crude jetty; World Cruise Center; Angels Gate with traffic |
| IJmuiden, the Noordzeekanaal and Amsterdam | Rijkswaterstaat inland ENC 1R7NK000, 1R7NK008, 1R7IJ020; Rijkswaterstaat 1 m bathymetry (WCS); PDOK buoys and beacons (all CC0); EMODnet Bathymetry DTM (CC BY 4.0) | 4 m at the locks, 10 m harbour and canal, 50 m sea | NAP: the tide outside, NAP −0.40 m in the canal | A | In from the sea; Zeesluis inbound, outbound and with a ballast VLCC; the canal to the Amerikahaven |

- **Packs** (`src/scenes/pack.ts`): gzip of a binary file: a JSON header, Int16 depth grids in centimetres (finest first wins), Int32 decimetre land tiles (150 m squares, near the water only) and the charted bollards. The chart is gzip JSON (depth areas, contours, soundings, land, aids, labels). Both are fetched when an area is first opened and kept by the service worker (`area-data` cache); *Install & offline → Download all areas now* fetches them all. The single-file copy carries them inside (≈ 11 MB in all). The predictor worker gets the same pack posted from the main thread.
- **Depths**: the chart's soundings and contours interpolated, held to each depth area's range; the dredged areas at least their dredged depth; surveys where there are some (Rijkswaterstaat 1 m mosaics, LAT converted to NAP with the offset measured between the two North Sea mosaics, +1.045 m), but never shallower than the chart's depth area by more than 0.3 m or deeper by more than 1 m: an old survey must not show less water than the current chart guarantees (it did in the Zeesluis approach, dredged since). The open sea off IJmuiden, which no survey covers outside the IJgeul, takes EMODnet's 1/16′ grid (below LAT, to NAP). A quay wall keeps the water's depth right up to it; under the land the nearest water depth is carried in (the wall is the contact model's).
- **IENC depths** are below the local mean water level; they are taken as below NAP, which is up to 0.4 m on the safe side in the canal.
- **Coordinates**: metres north and east of each area's origin on a transverse Mercator plane (WGS84 for NOAA, RD New → WGS84 for Rijkswaterstaat).

## Berths and equipment

**Every berth** means every quay, pier, jetty, dolphin or lock-wall face at least 30 m long with at least 3 m of water off it where a ship of the fleet can lie: the charted shoreline constructions (wharves, piers, sea walls, lock walls, fender lines), shore edges the chart draws as plain land but gives charted bollards along (or a charted berth), and the berths of the hand-built harbours. Each is fitted out by one rule set (`src/physics/berths.ts`), the same for charted and hand-built berths:

- the **design ship** is the largest of the fleet that fits the berth's usable length (its face plus the room past each end, up to 35 % or 45 m, less where a quay or shallower water stands in the way) and the depth along it (5 % keel clearance), for the beam she has;
- **fenders** (SCN-type cones) are sized for her berthing energy (PIANC WG33: E = ½·M·v²·C_m·C_e, approach speed after Brolsma, the abnormal-impact factor of the berth's kind) and spaced at most 0.15 of the smallest ship's length: 20 m on container, cruise and tanker berths, 12.5 m for ferries, 5 m for tugs, 6 m rubbing strips on lock walls. Where a whole wharf and its numbered berths share fenders, they are sized for the biggest ship any stretch of it takes;
- **bollards** stand 1–2 m back every 15–30 m, carried on past the ends while the quay edge runs on, so that head, stern, breast and spring lines all reach for the smallest, the design and the largest ship that fit; safe working loads from the design ship's displacement;
- **tanker berths in open water** get four breasting dolphins at ±0.18 and ±0.38 of the design ship's length, mooring dolphins abreast and beyond her ends, quick-release hooks and a loading platform;
- **lock walls** get wall-top bollards every 30 m and floating bollards in the wall every 60 m, which ride with the chamber.

A scenario's own gear (and the charted bollards of an area) is kept first and as it was; the rules fill the gaps. Counts: PortMiami 64 berths (752 fenders, 685 bollards); Los Angeles–Long Beach 572 berths (5154 fenders, 4350 bollards); IJmuiden–Amsterdam 280 berths (2831 fenders, 9941 bollards, 8327 of them charted); the hand-built harbours 32 berths. Charted mooring posts that stand in open water (marina piles, the Afrikahaven barge pile rows) and the walls of the three locks that are not worked are kept as mooring points but are not berths. Every berth is tested: fenders and bollards along all of it, energy enough for the design ship, the smallest, design and largest fitting ship clear of the structure and afloat alongside, either side to, with all six lines reaching; and parallel landings of the design ship at 0.10 m/s (0.08 above 100 000 t) stay inside the fenders' rated deflection on the scenarios' own berths and five random berths of each area.

## Charts and S-52

- `src/ui/chart/`: the chart model in 1 km tiles at three levels of detail (Douglas–Peucker 0, 3 and 15 m), clipped and drawn as Path2D; depth shading against the **safety contour** of the ship in use (the smallest charted contour at least her draught + 2 m), contours, spot soundings in the S-52 style, dredged areas, land, shoreline constructions, bridges, berth names.
- **Aids**: every IENC/ENC buoy, beacon and light with its shape (BOYSHP 1 conical, 2 can …), colour pattern, topmark and light: lateral (IALA A or B by area), cardinal, isolated danger, safe water and special marks; light characteristics read from S-57 (`Fl(2)G.6s8m4M`), sectors drawn, and every light flashing in its real rhythm, on the chart and in 3D, where buoys and beacons are instanced with their bands and topmarks and distant lights stay a few pixels across.
- **Hand-built harbours** get a synthetic chart (`src/scenes/synth.ts`): exact depth areas and contours from the scenario's depths and shoals, soundings sampled from the physics, and IALA-correct marks from per-scenario hints (channel edges, cardinals on shoals, pier-head lights, platform lights).

## Water levels and locks

- **Levels** (`src/physics/levels.ts`): a harmonic tide (IJmuiden: M2 0.70 m, S2 0.15 m, M4 0.08 m about NAP +0.1 m: high water about +1.0, low water about −0.7, estimates kept as config), a held canal level (NAP −0.40 m), and a lock chamber at its own level. Which water is which comes from the builder's flood fill from the sea around the lock complex (10 m cells; water that reaches the sea without passing a chamber or a gate is outside). Depth anywhere is the bed below datum plus the level of the water there; the ship, the other ships and the 3D water float at that level.
- **The Zeesluis** (`src/physics/lock.ts`, `src/scenes/ijmuiden.ts`): the chamber from the IENC lock basin (544 × 70 m, 500 m between the gates), sill NAP −18 m, two rolling gates that run sideways into their recesses in 150 s (config) and stop for a hull in their way, solid while shut ("lock gate" on contact). The Noordersluis, Middensluis and Zuidersluis stand shut.
- **Levelling**: dη/dt = Q / (A_chamber − A_waterplane), Q = μ·A_v(t)·√(2g·|ΔH|), the valves (30 m², μ 0.7, config) opening over 180 s: about 12 minutes for the 1.3 m between high water and the canal with the Spirit in the chamber, 9 with the ballast VLCC.
- **Forces on a ship in the chamber** (PIANC WG155): the translatory wave's slope, F = Δ·g·(dQ/dt)/(g·A_wet), away from a filling end and toward an emptying one; filling through the gates, half the blockage share of the jet's momentum ρQ²/A_open; coming in with the far gate shut, the piston resistance −½ρ·0.3·A_s·u|u|·(m/(1−m))² with m the blockage. Shown in kN and in ‰ of her weight against PIANC's 1 ‰; the default programme stays under it (about 0.1 ‰), fast valves do not.
- **Mooring lines in 3D**: where levels change, a line runs from the fairlead (the ship's level plus her freeboard) to the bollard (a wall top fixed, a floating bollard riding with the chamber); its length is three-dimensional and only the horizontal pull acts on the hull. As the chamber rises a line from a high fairlead to the wall top tightens on the brake, holds near its setting on auto, and does not change on a floating bollard.
- **The lock master** (VHF 22 in the app; config): answers a call with the draught check against the sill and both charted approaches (14.4 m outer basin, 14.9 m canal; under-keel clearance 10 %, at least 1 m), turns the chamber round if it stands at the other level, opens the gate, and warns about speed (2 kn in the lock), fewer than two lines, a hull in a gate's path or leaving with lines fast. The laden VLCC, the 16 m ULCV and the laden Panamax cannot pass (the canal and the approaches are too shallow for them, not the chamber); every other ship of the fleet can, at any state of the tide (a ship of 12.5–13 m would have to wait for it: the outer basin has 13.7 m at low water). CEVNI lights at each end: red, red and green (the gate is opening, get ready), green.
- **The predictor** gets the levels and the gates as they stand; random traffic plans round the worked chamber.

## Deep links

`?scenario=<id>&ship=<id>&view=2d|split|3d&cam=bridge|port|stbd|chase|pods&tod=day|dusk|night&t=<seconds to run on>&zoom=<× the scenario's>`, for example `?scenario=ijm-lock-in&view=3d&cam=chase`.

`&guide=on[,vectors][,explain][,notips][,nosteps]` turns the training guide on and sets those options (saved like any other change), for example `?scenario=trials&guide=on,vectors`.

## Damage

`src/physics/damage.ts`, on in the app (Menu → Damage: Realistic / Off), off in the test harness and the regression runs.

- **Impact energy.** Every hard contact point (quay, bank, pier, a fender crushed past 110 % of its rated deflection, another ship) adds its contact force × closing speed, counted only for impacts faster than 5 cm/s, plus friction × sliding speed above 0.2 m/s (raking). Every grounded keel point adds its grounding force × speed over the bottom. Contact energy matches the kinetic energy taken off: about 24 MJ for the Spirit square onto a quay at 2 kn.
- **Hull zones.** Five sections (stern, aft, midships, forward, bow, at 0.15/0.35/0.6/0.8 L), each port, starboard and bottom.
  - The plating dents at 8 % of the rupture energy, and breaches at E_b = max(0.4 MJ, 4 MJ × (Δ/10 000 t)^(2/3)). That is a calibration, not a single-source value; it scales with structural size.
  - Hole area grows as (E − E_b) / 47.2 MJ m⁻³ / 0.25 m (Minorsky's energy–volume slope over a smeared plating thickness), capped at a quarter of the section's side.
- **Flooding.**
  - Orifice flow, 0.6 A √(2 g h), with head from the waterline to the hole (T/3 for the side, T for the bottom) less the water inside.
  - Compartments are the five sections at permeability 0.85 up to the main deck. The bilge pumps take 0.05 m³/s per 100 m of length from the wettest compartment.
  - A side hole's water stays on that side until cross-flooding spreads it (time constant 3 min).
- **Floating position.**
  - Sinkage: water / (0.85 L B).
  - Trim: Σ w x / (Δ · GM_L), with GM_L ≈ 0.06 L² / T.
  - List: Σ w · asym · B/4 / (Δ · GM_eff), where GM_eff = GM − free surface (15 % of the full-width value for partly full compartments).
- **Consequences.**
  - Extra draught along the hull feeds the grounding check and the under-keel clearance.
  - Added resistance from the extra displacement (as (1 + w/Δ)^(2/3)) and from the holes.
  - A unit within 0.08 L of a hit (or two diameters) loses thrust: 85 % for a heavy side hit or 70 % for a propeller strike on the bottom, 40 % past rupture. The bow thruster within 0.06 L: 80 % / 30 %.
- **Lost.** Capsized when the list passes 25° or GM is gone; foundered when the deck at an end (the bow with 1.5 × the midship freeboard for sheer) stays under for a minute. A ship resting on the bottom cannot founder. When she is lost the simulation pauses and offers a restart.
- **Other ships** are solid: near traffic hulls are moving obstacles in the contact model (steel on steel, closing speed relative to the other ship).
- **Interface.** A DAMAGE button (red and flashing while flooding beats the pumps) opens damage control: a hull plan with the sections, damage and flooding, the units by thrust left, draught fore and aft, trim, list, GM, water in, inflow and pumps, and the log. Dents and breaches show on the chart's own-ship outline, and in 3D she settles, trims and lists.
- **Tests:** a 0.3 kn touch leaves no mark; 4 kn square on breaches the bow and floods one compartment, and she survives by the head; raking a rock wall at 12 kn opens five and capsizes her; running onto a 6 m shelf at 6 kn tears the bottom, and she does not founder while resting on it; going astern into a quay damages the pods; damage off leaves her untouched; ramming a stopped ship stops you and dents you.

## Random traffic and AIS

`src/physics/aitraffic.ts` adds traffic to any scenario (menu, Traffic: Off / Light / Busy; New traffic draws another set). Scripted scenario traffic is unchanged.

- **Where it can go:** a 6 × 6 km navigation grid (20 m cells) round own ship's start. It is built from the scenario's depth model and its land, quay and bank polygons, and keeps the distance from every cell to water too shallow for a given draught.
- **The fleet:** ships come from the fleet in water that suits their draught (no barges outside the river), at most two of a kind. There are fewer in narrow water.
- **Starting conditions:**
  - About 30 % lie stopped: at anchor (cable 3 × depth + 20 m, up to 150 m), or holding station where it is deeper than 80 m.
  - No ship starts on a collision course within ten minutes.
- **Steering:** first-order Nomoto yaw (K′ 1.6, T′ 1.8) with a rudder moving at 2.5°/s.
- **Speed:** a lag growing with length (20–150 s, slower to lose way than to gain it).
- **Routes:**
  - A* on the grid, cheaper mid-channel, string-pulled to straight legs, then shifted to the starboard side of the fairway (Rule 9).
  - Steered with a correction for the current across the track; ships slow for turns and with shoal water inside their turning distance, and re-plan whenever the run to the next point is no longer clear.
  - Ships lying stopped, and the whole swinging circle of an anchored ship, are planned round.
- **Lookout, once a second (COLREG):**
  - A ship gives way when the other is on her starboard side, head-on, or being overtaken. As stand-on she acts once a close-quarters situation develops.
  - Her action is the first of 20° / 35° / 60° / 90° to starboard (speed kept) or slowing right down that clears every ship under way, with water to do it. Once taken it is held, and only ever made bigger.
  - Inside about a minute: hard to starboard and stop.
- **Safety nets:** a step that would put her bow, middle or stern on the ground, or her hull against another, is not taken. She stops short, and if stuck goes astern off the edge and re-plans.
- **Validation:** traffic never hits own ship unless own ship runs into it. A sweep of 14 scenarios × 8 random sets × 10 minutes, with own ship blindly at 8 kn, has no grounding and no traffic-on-traffic contact. The only contacts were three where own ship ran into traffic that had stopped for her.
- **AIS mini map** (`src/ui/ais.ts`):
  - A plot round own ship that turns with the chart. It shows the coastline and shallows from the traffic's navigation grid, range rings, and targets as AIS triangles with COG vectors (anchored targets as a ringed dot).
  - The range fits the targets (up to 6 nm) or is fixed by tapping the range button: 0.25–6 nm, then back to auto.
  - Range and bearing, CPA and TCPA come from own ship's sensed position and ground velocity.
  - A target is dangerous at CPA < 0.2 nm (or the half-lengths + 100 m) within 10 minutes. It turns red and is named, here and on the chart.
  - Tap a target for its type, size, draught, MMSI, range, bearing, speed, course, status and where she is bound.
  - The wind and current dial steps left of the card when they would overlap.
- **Chart:** an AIS triangle when the hull is too small to see, a course-over-ground vector as long as own ship's, an anchor mark, and a frame on the selected target.

## Control feel

Every lever, slider and dial runs its raw drag position through `src/ui/controls.ts` before anything reaches the ship. Rendering is unchanged.

- **Levers and sliders through zero** (Azipod rpm, pitch and propulsion levers, waterjet levers, bow and stern thrusters, the joystick yaw bar, combi-lever and Voith power) use `LinearDetent`:
  - Within ±4 % of centre the order is exactly 0.
  - One firm click (sound and a 24 ms vibration) fires on entering the zero band. It doesn't fire again until the lever has moved 2 % beyond the band.
  - A light tick sounds every 10 %.
  - Letting go inside the band locks the lever at 0.
- **Rotary controls** (Azipod dials, combi-lever and Voith direction, helm and nozzle helm) use `AngleDetent`:
  - Orders are in whole degrees, with a light tick every 5°.
  - The dial snaps to 000° and 180° (the helm only to midships) within ±3°, with a double-knock vibration, and lets go 1.5° further out.
  - On release the order stays exactly where it was.
- **Tuning** is in `CONTROL` (`deadzoneThreshold`, `angleStepDegrees`, `cardinalSnapDegrees`, the hysteresis values, `enableHaptics`). A control can pass its own values; the combi-lever, for example, has a 12 % hub. `enableHaptics` turns off the vibration and leaves the click sound. The user's haptics setting must also be on.
- **Feedback** goes through `onFeel`, so the module has no DOM dependency and is unit tested in `npm test`.
- **Not covered:** the telegraph has fixed steps. The 2-D joysticks keep their per-axis deadband and their centre click.

## Training guide

Optional and off by default (Menu → Training guide). Three layers, each with its own switch: **tips** (one situational line at a time), **steps** (drills and practice exercises, run only when started) and **vectors** (dashed suggestions on the chart and the controls, off even when the guide is on). Brief or Explain level. Settings and what has been seen are saved under `azb-guide`. The guide only reads the simulator (`S` and the `Runtime`): it never steers, scores or touches the physics, and with it off none of it runs per frame. The golden regression is unaffected.

- **Content is data** (`src/guide/content/`: cards, drills, exercises). Every statement about the real world is a claim with sources and a confidence tag (measured, published, rule, derived). What the model does goes in a separate `sim` note. A figure in our own words is a `{token}` bound to the ship or a published value. `lint.ts` enforces this in `npm test`. [TRAINING.md](TRAINING.md) gives the rules, the sources with what was actually read, the open items and where the model differs from the published figures; [TRAINING-CLAIMS.md](TRAINING-CLAIMS.md) (generated by `npm run guide:dossier`) lists every shipped claim for review. Every card starts as `draft`.
- **It knows what the bridge knows.** `context.ts` builds its view from the sensor estimates, the dials and the quay lines, not the true state.
- **Tips**: `rules.ts` holds the situations, `coach.ts` the timing (the situation must hold, a cool-down per tip, one tip at a time, seen memory).
- **Drills** (`procedures.ts`) run each step's live check: the furthest step that holds counts, nothing is forced, and a step can be skipped. **Exercises** (`exercises.ts`) open a scenario with a ship and weather, measure, and end in a debrief that sets what you did beside a reference. No scores: no authoritative numeric standard exists for these manoeuvres.
- **Vectors** (`align.ts`, `vectors.ts`): the closing-speed guideline on the quay tags (the lower of Ishihata's half-the-distance rule and `approachSpeed`, from the estimated velocities); the pivot point (where the sideways speed is zero); for twin-pod ships with a bow thruster, a pod suggestion (a simple docking rule turns the closing speeds, the swing and the along-berth speed into a joystick demand, and `allocate()` turns that into pod angles, rpm and bow thruster, drawn as dashed outlines on the dials, rpm levers and thruster slider); for assist tugs, the same demand shared over the two tugs, with their grip falling off with ship speed, shown on the tug sliders. The player drags the real control onto the outline.
- **Tests** (`scripts/guide-test.ts`, part of `npm test`): the content rules; a scripted headless run for every drill (`proofs.ts`) against which its card is checked; a test for every note on the model, including figures written out in words; every drill walked through on a real run; the pod suggestion tested closed-loop (following it takes the way off a ship drifting onto a quay).

## Develop

```bash
npm ci
npm run dev          # local dev server
npm test             # physics and control regression tests
npm run golden       # Azipod ships bit-identical to the reference
npm run trials       # IMO-style sea trials in the terminal
npm run validate     # 277 m stopping-test comparison
npm run build:all    # dist/ = PWA + shipshape-offline.html (also kept at the old name, azipod-bridge-offline.html)
npm run guide:dossier  # rewrite docs/TRAINING-CLAIMS.md after changing a training-guide card
```

Every push to `main` runs the tests, builds, and publishes to GitHub Pages (`.github/workflows/pages.yml`).
