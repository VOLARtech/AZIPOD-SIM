# Training guide: sources, rules and open items

The training guide is an optional layer in SHIPSHAPE (Menu → Training guide, off by default). It offers
tips, step-by-step procedures and suggested vectors for the Azipod ships, the tugs and the specialised
propulsion (two-stroke telegraph ships, controllable-pitch and electric twin screws, waterjets, Voith
Schneider, DP and thrusters). This page says how its content is kept honest. What actually ships is
listed, claim by claim, in [TRAINING-CLAIMS.md](TRAINING-CLAIMS.md), which is generated from the code.

It is a training aid built on published sources. There is no single global standard for handling
podded or azimuthing propulsion: the ship's own manual and the company's procedures always come first.
Like the rest of SHIPSHAPE it is **not for navigation**.

## Rules for the content

1. **No source, no card.** Every statement about the real world sits in a `real` claim with at least one
   source from `src/guide/sources.ts`. The only exception is a statement about this simulator's own
   model, marked `derived` and shown as "in SHIPSHAPE".
2. **Confidence is earned.** `measured` needs a paper (trial or model-test data). `published` needs a
   standard, manual, port rule, incident report, guidance or paper. `rule` is a cited rule of thumb.
   `npm test` checks this.
3. **Real world and simulator are separate.** What the real world says (`real`) is never mixed with how
   the model behaves (`sim`). Where the model differs from a published figure the card says so.
4. **Numbers are bound.** A figure in our own words (`brief`, `why`, `sim`) is a `{token}`: the ship's
   own particular (for example the reverse-order limit) or a published figure (for example the model-test
   stopping distances in `src/physics/validation.ts`). A loose "30 s" fails the build. The lint cannot
   see a figure written out in words ("about twenty seconds"); each of those in a `sim` note has its own
   test in `scripts/guide-test.ts` that runs the model and fails if the note stops being true.
5. **`brief` and `why` restate the claims.** Nothing in them asserts a real-world fact that is not in a
   `real` claim below it.
6. **Sources that disagree are both shown.** The two published Azipod crash-stop variants (pods turned
   outward, pods turned inward) are an example.
7. **Paraphrase, don't copy.** Short facts and figures with a citation; no long quotations.
8. **Procedures are run.** Every procedure has a scripted headless run in the tests; if the model
   disagrees with the published outcome the card says so instead of passing quietly.
9. **Draft until reviewed.** Every card starts as `draft` (a small DRAFT chip in the Explain view). Only
   the captain promotes cards to `reviewed`, track by track, after reading the claims register.

## Confidence levels

| Level | Meaning | Needs |
|---|---|---|
| `measured` | published trial or model-test data | a paper |
| `published` | standard, manual, port rule, incident report, pilot or manufacturer guidance | a standard, manual, guidance, incident report or paper |
| `rule` | cited textbook or web rule of thumb | any source |
| `derived` | computed from this simulator's own model | nothing (shown as "in SHIPSHAPE") |

## Source register

Every source in `src/guide/sources.ts` is listed here (a test keeps the two in step). "Checked" says how
much of it has been read against the claims that cite it; it is updated as the cards are written.

| id | Source | Kind | Used for | Checked |
|---|---|---|---|---|
| `nowicki-2014` | Nowicki (2014), *Stopping of Ships Equipped with Azipods*, TransNav 8(3) | paper | the six stopping methods (model of a ~150 000 m³ LNG carrier with two pulling azipods) and the *Elation* sea trial | full text read (Nov 2026); numbers match `PUBLISHED` in `validation.ts` |
| `striga-impa` | Striga, *AZIPODS memento for the pilots' use*, IMPA | guidance | pod handling cautions: lever orientation, opposite-order lockout, a little astern to slow, berth-side pod | full text read (Nov 2026) |
| `abb-azipod-co` | ABB, *Azipod CO product introduction* | manual | how the pod works, operating principles | read for the pulling-propeller and steering-convention passages (Nov 2026) |
| `azipilot-2011` | AZIPILOT project, Deliverable 3.10 (2011) | guidance | what training for azimuth control must cover | not yet cited |
| `brolsma-1977` | Brolsma, Hirs and Langeveld (1977), PIANC congress | paper | berthing-speed curves (`berths.approachSpeed`) | not yet cited |
| `pianc-wg33` | PIANC (2002), WG33 fender guidelines | standard | berthing energy and velocities | not yet cited |
| `pianc-wg211` | *Recommendations for Berthing Velocity in PIANC WG 211* | paper | later review of berthing speeds | not yet cited |
| `ishihata-1988` | Ishihata (1988), actual berthing speed of VLCCs | paper | closing speed in cm/s about half the distance to the berth in m | abstract only |
| `ral-escort` | Robert Allan Ltd (2025), *Escort Towage* | guidance | indirect and direct escort modes | full article read (Nov 2026) |
| `artyszuk-2014` | Artyszuk (2014), generic ASD tug in escort operation, TransNav 8(3) | paper | tug performance in escort pull | abstract, introduction and conclusions read (Nov 2026); an analytical model, not validated against real hulls |
| `ishikura-2013` | Ishikura et al. (2013), global standard manoeuvring orders for tugboats, TransNav 7(4) | paper | standard tug orders | full text read (Nov 2026) |
| `flinders-tug-orders` | Flinders Ports Holdings, *Tug orders* | guidance | tug order phrasing | full page read (Nov 2026) |
| `mhpa-towage-2021` | Milford Haven Port Authority (2021), *Towage guidelines* | guidance | tug practice, speeds, positions | introduction, girting, Coanda, safe speed, orders and escort sections read (Nov 2026) |
| `maib-ijsselstroom` | MAIB report, girting and capsize of tug *IJsselstroom* | incident | the girting hazard | summary page read (Nov 2026); the full report is not read |
| `mgn468-annex2` | MCA, MGN 468 (M) Amendment 1, Annex 2 | standard | competence standards for ship-assist towage | Annex 2 page read (Nov 2026) |
| `jurgens-voith` | Jürgens and Palm, *Voith Water Tractor* | paper | Voith Schneider tractor principle | first part read: the tractor, the unit and the operating modes (Nov 2026) |
| `hamiltonjet-hj` | HamiltonJet (2014), HJ Series brochure | manual | waterjet steering and reversing | manoeuvrability list, the ahead/astern and control-functions sections read in full (Nov 2026); a manufacturer's brochure |
| `kijima-1975` | Kijima and Inoue (1975), side thruster and forward speed | paper | thruster effectiveness falls with ship speed | abstract read (Nov 2026) |
| `fujino-1978` | Fujino, Saruta and Ida (1978), effectiveness of the side thruster | paper | stern thrusters under way | abstract read (Nov 2026) |
| `wikipedia-dp` | Wikipedia, *Dynamic positioning* | web | the three DP equipment classes (a summary of IMO MSC/Circ.645) | read (Nov 2026); the IMO text is not |
| `marinesite-crash` | Crash manoeuvring, crash stop of the main engine (marinesite.info) | web | crash astern sequence | full page read (Nov 2026); an informal teaching page, so every claim from it is tagged "rule" |
| `imo-a601` | IMO A.601(15), manoeuvring information on board | standard | pilot card, wheelhouse poster | annex read: application, pilot card, wheelhouse poster, booklet (Nov 2026) |
| `imo-msc137` | IMO MSC.137(76), ship manoeuvrability (via the ABS guide) | standard | trial limits such as the crash-stop distance | scope, criteria table and the turning, zig-zag, initial-turning and track-reach sections of the ABS guide read (Nov 2026); the IMO text and its explanatory notes are not |

## Open items: not found, so not shipped

These came up in the research without a usable source. They stay out of the app until the captain
supplies one or a source is found.

- Response times of Voith Schneider units and waterjets from the manufacturers' manuals.
- Rotor-tug (three-drive) handling procedures.
- The IMO DP guidelines themselves (MSC/Circ.645, MSC.1/Circ.1580) and the IMCA guidance: the class definitions come from a secondary summary, and the USCG review guideline could not be fetched. DP alert levels are not covered.
- The MAN B&W reversing description cited in the physics audit (the page could not be read).
- Operating double-acting icebreakers with Azipods.
- Textbook procedures for controllable-pitch and electric twin screws.
- The full Ishihata paper (Japanese); only the abstract has been read.
- Port towage guidelines whose pages came back empty (Peel Ports, Falmouth).
- Measured crash-stop data for waterjet craft, and published astern-start timings for direct-reversing engines (the model's wait comes from how fast the propeller slows, not from a published figure).
- The IMO text of MSC.137(76) and its explanatory notes (MSC/Circ.1053): the criteria come from the ABS guide's summary.

## Where the simulator differs from the published figures

These are stated in the guide, not fixed by it (changing them alters tug or pod dynamics inside the
golden regression fixtures, so each needs its own decision).

1. **Assist-tug push/pull swap.** The model takes 60 s to swap between pushing and pulling
   (`updateTugs`, `src/physics/mooring.ts`); about 5–10 s or more is reported for ASD and Voith units.
2. **Azipod "pods 90°, rpm kept" stops.** Both variants (pods 90° outward, 90° inward) run 56–64 % long
   against the model tests (`docs/PHYSICS_AUDIT.md`); the other four methods agree within ±22 %. The
   guide recommends only methods the model reproduces and shows the published figure for the others.
3. **Response times** of the Voith Schneider (2.5 s) and waterjet (2 s) units are unverified.
4. **Berthing speeds.** The Brolsma curve behind `approachSpeed` dates from the 1970s and later PIANC
   work questions it; the card cites both.
5. **Stop and astern orders on a direct-reversing engine.** The model cuts the fuel the moment a stop
   or astern order is given; a real engine runs its load programme on a stop order from full ahead
   (marinesite.info). It also merges the brake-air kicks and the astern start into one air start once
   the shaft is down to 40 % of full rpm. The card says both.
6. **Waterjet crash stop.** From 70 % of top speed the fast ferry stops in about a ship length and
   twelve seconds with the buckets down; no published crash-stop figure for waterjet craft was found
   to compare it with, so the card describes the model and quotes the manufacturer only for the
   thrust (up to 60 % of ahead) and the principle.
7. **Stern thruster fall-off.** Fujino et al. found a stern thruster loses less under way than a bow
   thruster and can gain in shallow water; the model gives both the same fall-off. The card says so.
8. **Common-mode reference drift.** The DP scenario drifts both DGNSS units together at a fixed rate
   from a fixed time; real drift is not so tidy. The exercise debrief reports the true position error
   beside the one the console showed, which is the point of the scenario.

## Working on the content

```bash
npm test                 # content rules, sources, claims register, and (as they are added) the scripted procedure runs
npm run guide:dossier    # rewrite docs/TRAINING-CLAIMS.md after changing a card
```

Content lives in `src/guide/content/` (`azipod.ts`, `tugs.ts`, `propulsion.ts`, `common.ts`), the
citations in `src/guide/sources.ts`, the number tokens in `src/guide/tokens.ts`, and the rules in
`src/guide/lint.ts`.
