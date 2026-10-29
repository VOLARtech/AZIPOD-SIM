# Physics audit, October 2026

An audit of the simulator's ship physics, every propulsion system, every ship's layout, and the controls and graphics that show them. The aim was to check each part against published data and real-life practice, fix what was wrong, and record honestly what could not be checked.

**Summary**
- **Sound:** the core model, the propulsion force models and the sign conventions through the whole chain. Physics, levers, dials, 2D chart and 3D view all agree on which way things push and turn.
- **Problems found and fixed:**
  - Bow and stern thrusters lost far too much push under way.
  - The tugs' hulls were modelled too deep, which made two of them handle backwards or uncontrollably.
  - The escort towline tension was read at the wrong moment, so the escorted tanker hardly felt a steady pull.
  - Four ships had rudders too far behind their propellers.
  - The ballast tanker's propeller and rudder were modelled half out of the water.
  - Several trial and display errors (listed under "Trials and displays").
- **Still open:** the items under "Open questions" have no reliable published data to settle them.

## How it was checked

1. **Code review.** Every force in the manoeuvring model was read against its source method:
   - Hull: Fossen/MMG equations, Clarke's regression, MMG derivatives for KVLCC2.
   - Propulsors: pods and azimuth drives, shaft propeller and rudder (MMG standard method), two-stroke engine, CPP, Voith Schneider, waterjet.
   - Other forces: tunnel thrusters, wind, contact, towline.
2. **Geometry audit.** A script checked, for all 23 ships:
   - Every propulsor, rudder, thruster and the bridge against the hull outline.
   - Propeller diameter against draught.
   - The gap from propeller to rudder.
   - The centre of gravity position.
3. **Fleet trials.** Every ship ran the trials: speed, turning circle, zig-zag, crash stops, turning on the spot, coast-down and wind drift. Results were compared with published tests and with IMO MSC.137(76).
4. **Display audit.** The direction and rate of every lever, dial, chart symbol and 3D part were traced back to the physics.

## Verified correct

- **Axes and signs:** the conventions hold everywhere.
  - **Axes:** x forward, y to starboard, positive yaw turns the bow to starboard.
  - **Units:** positive azimuth pushes to starboard; positive rudder turns the ship to starboard; a waterjet nozzle to starboard throws the jet to starboard and turns the ship to starboard.
  - **Displays:** helm, combi-levers, Voith pads and Azipod dials match these. So do the 2D rudder and pod symbols, and the 3D pod yaw, rudder deflection and nozzle swing.
- **Propeller walk:**
  - **Fixed propellers:** a right-handed propeller walks the stern to starboard ahead (weakly) and to port astern (strongly).
  - **CPP:** turning ahead with astern pitch, it walks like a left-handed fixed propeller.
  - **Twin-screw ships:** they turn outward (port shaft left-handed), so their walks cancel.
  - Direction as in standard ship-handling texts. The astern magnitude is 3–9 % of thrust by ship type.
- **KVLCC2, the international benchmark tanker:**
  - Our 35° turn from 15.5 kn gives an advance of 3.60 L and a tactical diameter of 3.66 L.
  - That is within 0.5 % of an independent implementation of the published MMG model, and within about 2 % of the MMG paper's own full-scale prediction (Yasukawa & Yoshimura 2015).
  - The paper's 7 m model tests give 3.1–3.3 L. The difference is scale effect on the wake, which the paper discusses.
- **Azipod crash stop with the pods swung outward:**
  - Our three Azipod ships stop in 2.2–2.8 L.
  - Sea trials of the Azipod cruise ship *Elation* gave 2.4 L (TransNav, "Stopping of Ships Equipped with Azipods").
- **Pivot point in a steady turn:**
  - Published values are 0.12–0.25 L from the bow (closer for full hulls), with about 1/3 L as the seaman's rule of thumb. A full-scale Panamax trial measured 0.17 L.
  - Most ships here fall at 0.07–0.24 L. The fullest ones (Lady-class, LNG carrier, the VLCC in ballast) sit at or just ahead of the bow end of that range in hard-over turns.
  - The pivot point is not a setting: it comes out of the dynamics as the point with no sideways velocity, x = −v/r.
- **Propeller-to-rudder spacing and propeller immersion:** within normal practice for the other ships after the fixes below.

## Fixed

| What | Was | Now | Why |
| --- | --- | --- | --- |
| Bow and stern thrusters under way | Side force fell to 38 % at 4 kn, 21 % at 6 kn, 8 % at 10 kn | About 50 % by 3–4 kn, then level | Two independent model-test studies (a 60 000 dwt tanker, *Int. Shipbuilding Progress* 14/156, 1967; Japanese side-thruster tests, 1975) show the side force halving by 3–4 kn and then staying nearly constant. The joystick and DP allocators use the same curve. |
| Tug hulls (ASD, rotor, Voith) | Hull modelled to the navigational draught, the bottom of the drives or guard plate | Hull at its own draught (ASD 4.3 m, rotor 3.8 m, Voith 2.9 m); drives, fin and guard below it. Depth, grounding and under-keel clearance still use the full draught | The hull's destabilising moment grows with draught squared. Modelled 5 m deep, the rotor tug locked into a turn its thrusters could not check, and the Voith tractor turned the wrong way when thrust was put to the side at the bow. Voith describes the tractor as "a comparatively flat ship hull" with the propellers, guard plate and fin below it, the fin giving course stability and moving the centre of lateral resistance aft. Displacements are now realistic (about 700–830 t). |
| Escort towline | Tension read with the tanker's fairlead where it was at the start of the step; a steadily loaded line read slack | Tension taken with both ends at the same instant | The tow gauge showed about 0 t during a steady tow, and the escorted tanker got its reaction from that reading, so it barely felt the tug except for snatch loads. |
| Rudder positions | Twin-screw cruise ship 1.79 D behind the propeller, push convoy 2.05 D (and beyond the transom), superyacht 1.23 D, LNG carrier 1.13 D | 0.7–0.8 D, under the hull | Rudders sit close behind the propeller, in its slipstream. |
| VLCC in ballast | Even keel at 10.5 m: propeller tip at the surface, a third of the rudder in the air | Trimmed by the stern (about 12 m aft): propeller immersed, immersed rudder area 81 m² of 112.5 m² with its lift slope reduced for the shorter span | VLCCs ballast trimmed by the stern to keep the propeller and rudder working. |
| Trials: steering | Every unit given the same angle | Units forward of the centre of gravity steer the opposite way to those aft | The rotor tug's two forward thrusters fought the aft one (zig-zag overshoot 408°); the Voith tractor turned the wrong way. |
| Trials: Voith "hard over" | Thrust 35° to the side | 45°: full ahead and full steering together saturate the Voith order | How a Voith Schneider control combines its steering and propulsion orders. |
| Trials: rpm-reversal crash stop | Run for units that cannot reverse, giving a meaningless distance and a "NaN" time | "Not applicable": the units turn to go astern | ASD and rotor tugs, the PSV and Voith Schneider units have no astern rpm. |
| Trials: turn on the spot | "0°/min" for ships without a bow thruster | A thrust couple from the units themselves | Tugs and the icebreaker turn on their own units. |
| Trials: IMO grading | Every ship graded | Graded only where MSC.137(76) applies: ships of 100 m and over, plus all gas carriers and chemical tankers. Shorter ships still show the figures, with the limit as a note | Tugs and yachts were shown as "failing" a standard that does not cover them. |
| Ship sheet | Every Azipod ship described as "7.5°/s, 60 s reversal" | That ship's own azimuth rate and reversal time | Paspaley Pearl's smaller pods slew at 10°/s and reverse in 30 s. |
| 2D chart, waterjets | Jet symbol rotated with the nozzle, so the wash showed on the wrong side | Drawn along the jet's thrust axis | A waterjet pushes against its jet. |
| 2D chart, Z-drives | Drawn with the propeller ahead, like a pulling Azipod | Propeller behind the leg | Tug Z-drives push. |
| 3D propellers | Every pod at 140 rpm; spin direction taken from the unit's place in the list | Shaft speed from a typical blade-tip speed (about 130 rpm on a 6 m pod, 420 rpm on a 2 m pod); outward-turning by which side the unit is on | Small pods turn much faster than big ones. The list order happened to give the right directions for today's ships, but a new ship could have got them wrong. |

The regression baseline for the original Azipod ships was re-recorded. The bow-thruster correction is the only change to them: with the old curve put back, all records match exactly. The baseline now also covers every scenario.

## Fleet trials after the audit

Deep, calm water, from full speed. Turning at hard over (35°; 45° for the Voith tractor), crash stop full astern (pods swung outward on pod ships).

| Ship | L (m) | Speed | Advance | Tactical diam. | 10/10 1st overshoot | Crash stop (track reach) | Pivot point (from bow) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| MV Bécancour | 130 | 16.6 kn | 2.85 L | 3.52 L | 1.9° | 2.56 L | 0.11 L |
| Lady-class 278 m | 250 | 22.4 kn | 2.82 L | 3.47 L | 1.7° | 2.76 L | 0.08 L |
| Spirit-class 293 m | 260.6 | 23.6 kn | 2.63 L | 3.38 L | 1.5° | 2.15 L | 0.12 L |
| VLCC · KVLCC2 hull | 320 | 15.8 kn | 3.60 L | 3.71 L | 5.8° | 14.37 L | 0.11 L |
| VLCC · KVLCC2 hull, ballast | 320 | 17.2 kn | 3.81 L | 4.32 L | 2.1° | 13.20 L | −0.03 L |
| Container 3600 TEU · KCS hull | 230 | 25.0 kn | 3.62 L | 4.07 L | 3.6° | 12.45 L | 0.17 L |
| Panamax bulk carrier | 222 | 15.7 kn | 4.01 L | 4.47 L | 3.5° | 16.08 L | 0.14 L |
| Container 24 000 TEU | 383 | 22.8 kn | 3.81 L | 4.37 L | 3.0° | 14.80 L | 0.13 L |
| LNG carrier 174 000 m³ | 285 | 18.6 kn | 3.27 L | 3.56 L | 2.9° | 14.66 L | 0.07 L |
| Ro-Pax ferry · twin CPP | 186 | 23.6 kn | 2.77 L | 3.09 L | 2.8° | 2.89 L | 0.11 L |
| Cruise ship · twin screw | 233 | 21.5 kn | 3.03 L | 3.36 L | 2.9° | 4.58 L | 0.11 L |
| ASD tug | 29 | 13.8 kn | 2.33 L | 1.72 L | 6.6° | 1.45 L | 0.10 L |
| Voith tractor tug | 29.5 | 11.8 kn | 7.67 L | 14.64 L | 0.6° | 1.00 L | 0.93 L |
| Rotor tug | 30 | 13.4 kn | 2.37 L | 2.29 L | 4.6° | 1.39 L | 0.29 L |
| Fast ferry (nozzles 30°) | 63 | 36.9 kn | 4.20 L | 5.17 L | 2.4° | 1.89 L | – |
| Platform supply vessel | 81 | 13.7 kn | 2.48 L | 2.51 L | 5.1° | 2.95 L | 0.21 L |
| Anchor-handling tug supply | 72 | 16.3 kn | 2.33 L | 2.22 L | 7.1° | 2.54 L | 0.14 L |
| Icebreaker · 3 Azipods | 96 | 16.7 kn | 2.32 L | 2.42 L | 4.1° | 1.76 L | 0.17 L |
| Push convoy | 190 | 11.1 kn | 2.32 L | 2.22 L | 2.5° | 3.02 L | 0.24 L |
| Frigate · DTMB 5415 hull | 142 | 28.8 kn | 2.38 L | 2.48 L | 4.5° | 2.28 L | 0.21 L |
| Superyacht | 80 | 20.4 kn | 2.57 L | 2.60 L | 4.7° | 4.29 L | 0.17 L |
| Bulk carrier · rotor sails | 222 | 15.7 kn | 4.01 L | 4.47 L | 3.5° | 16.08 L | 0.14 L |
| Paspaley Pearl | 47 | 12.6 kn | 2.41 L | 2.73 L | 2.9° | 1.89 L | 0.18 L |

IMO MSC.137(76) limits, where they apply: advance < 4.5 L, tactical diameter < 5 L, 10/10 first overshoot 10–20° depending on L/V, crash stop < 15 L.

## Open questions

These were looked into but could not be settled from published data. They are listed rather than tuned to a guess.

- **Two-stroke crash stops (VLCC, Panamax, LNG, container ships).**
  - **What happens now:** after the stop order the propeller keeps the engine turning (windmilling) at 32–42 % rpm for minutes. The engine waits for 32 % before an astern start, so the Panamax travels 9.7 L before astern power is applied and stops in 16 L.
  - **What sources say:** braking air is applied below about 40 % rpm (MAN B&W reversing descriptions). One source puts reversal at 15–30 s after the order.
  - **Why not changed:**
    - A 40 % threshold shortens the stops to 9–11 L, for example the VLCC in 13.8 minutes.
    - A training text puts a laden 200 000 t tanker at about 25 minutes from 16 kn, which argues the other way.
    - No trial data for these ships was found, so the threshold was left at 32 %.
- **Azipod stopping methods "pods 90°, rpm kept".** Against the six published model-test methods for a 277 m twin-Azipod ship, four agree within ±22 %; these two come out 56–64 % long. This predates the audit.
- **Voith tractor free-running turns.** With the hull and fin corrected she is very course-stable and turns about her fin: tactical diameter about 15 L at full speed and 45° steering. No published free-running turning data for these tugs was found; Voith publishes steering forces and simulator models built from captive tests, not turning circles.
- **3D bridge positions.** On seven ships the 3D model's bridge (where the bridge camera stands) is more than 8 % of the length away from the ship's conning position used for the GNSS antenna and the chart's reference point:
  - KCS and the 24 000 TEU ship share one model with a midships bridge; their real types have it aft and forward respectively.
  - Also the LNG carrier, the icebreaker, Bécancour, the fast ferry and the ASD tug.

  The physics keeps the type-correct position; better-matched 3D models would close the gap.
- **No public trial data** was found for most of these specific ship types (Panamax and VLCC crash stops, tug and yacht turning circles). Their values are typical of their classes, not one ship's measured data, as each ship's notes say.

## Sources

- Yasukawa, H. and Yoshimura, Y. (2015), *Introduction of MMG standard method for ship maneuvering predictions*, J. Mar. Sci. Technol. 20, 37–52, [doi:10.1007/s00773-014-0293-y](https://doi.org/10.1007/s00773-014-0293-y).
- Stern, F. et al. (2011), *Experience from SIMMAN 2008*, J. Ship Research 55(2), 135–147 ([MARIN](https://www.marin.nl/en/publications/experience-from-simman-2008-the-first-workshop-on-verification-and-validation-of-ship-maneuvering-simulation-methods)).
- *Stopping of Ships Equipped with Azipods*, TransNav ([PDF](https://www.transnav.eu/files/Stopping_of_Ships_Equipped_with_Azipods,519.pdf)).
- *Influence of forward speed on the manoeuvrability of a ship with a side thruster* ([TRID](https://trid.trb.org/View/159173)); *International Shipbuilding Progress* 14/156 ([IOS Press](https://content.iospress.com/articles/international-shipbuilding-progress/isp14-156-01)); *Experimental studies on the effectiveness of the side thruster* ([TRID](https://trid.trb.org/View/85435)).
- Tzeng, C.-Y. (1998), *Analysis of the pivot point for a turning ship*, J. Marine Science and Technology 6(1) ([JMSTT](https://jmstt.ntou.edu.tw/journal/vol6/iss1/5)); pivot-point practice ([KoreaScience](https://koreascience.kr/article/CFKO201224542272818.pdf)); full-scale Panamax trial ([KSMA](https://rep.ksma.ks.ua/bitstreams/ec2f54e4-b7ea-412c-9bf0-7531b7073a4a/download)).
- Jürgens, D. and Palm, M., *Voith Water Tractor – improved manoeuvrability and seakeeping behaviour* ([PDF](https://towmasters.wordpress.com/wp-content/uploads/2009/06/voithwatertractor.pdf)); Wärtsilä Encyclopedia, [Voith Water Tractor](https://www.wartsila.com/encyclopedia/term/voith-water-tractor).
- MAN B&W reversing ([marinediesels.info](https://www.marinediesels.info/2_stroke_engine_parts/Other_info/MANB&W_reversing.htm)); crash manoeuvring procedure ([marinesite.info](https://www.marinesite.info/2019/07/crash-manouvering-crash-stop-main-engine.html)).
- IMO MSC.137(76) criteria, as summarised in the ABS *Guide for Vessel Maneuverability* ([PDF](https://ww2.eagle.org/content/dam/eagle/rules-and-guides/current/conventional_ocean_service/145_vesselmaneuverability/Vessel_Maneuverability_Guide_e-Feb17.pdf)).
