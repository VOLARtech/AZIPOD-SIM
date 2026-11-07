# Training guide: claims register

Generated from `src/guide/content` by `npm run guide:dossier`. Do not edit by hand: `npm test` fails when it is out of date.
The sources are listed in [TRAINING.md](TRAINING.md). Numbers written as `{token}` are filled in from the ship's own particulars or a published figure.

**27 cards · 6 procedures · 7 exercises · 40 draft · 0 reviewed**

## Azipod ships

### `pod-pull` · Pods pull: dial where you want the pull · draft

Applies to: pod

- **Brief:** Set each dial where you want the stern pulled, not where you want the ship to go.
- **Why:** The pilots' memento puts it plainly: the pods are tractors, so the lever points the way the pull is wanted.
- **Real world:**
  - `published` The pods are tractors: the bridge levers have to be oriented in the direction where the pulling is required, and not in the direction the ship should go. — *striga-impa*
  - `published` An Azipod is a podded electric main propulsion and steering device driving a fixed-pitch propeller at variable speed. The Azipod CO is designed for the preferential use of the directly driven pulling propeller when driving ahead, and it azimuths without limit through 360°. — *abb-azipod-co*
- **In SHIPSHAPE:** The dial's handle is the ordered direction of pull and the coloured needle is the pull she is giving. LINKED sets both pods from one dial.

### `pod-slew` · Pods swing slowly and the plant lags · draft

Applies to: pod

- **Brief:** A pod swings at {slew}°/s and the plant answers slowly: order early, and don't chase with quick orders.
- **Why:** Half a turn takes {slew180} s at her slew rate and full rpm takes {rpmTime} s. Short, fast orders have no chance to be effective.
- **Real world:**
  - `published` Pod slew speed generally lies between 5 and 7.5 °/s, so the opposite position is reached after 24 to 36 s. Reversing the propeller takes about 60 s because it is electrically driven, where a classical diesel plant takes from a few to several minutes. — *nowicki-2014*
  - `published` There is a long delay between the order and the reaction of the electronic and mechanical plant: a succession of short and fast orders will not have any chance to be effective. — *striga-impa*
- **In SHIPSHAPE:** Her pods slew at {slew}°/s and take {rpmTime} s to reach full rpm, {rpmReverse} s from full ahead to full astern.

### `pod-reverse-order` · Take the rpm off before you order astern · draft

Applies to: pod · tip when `rev-blocked` (hold 1 s, cool 45 s, priority 3)

- **Brief:** A reverse order is ignored above {rev} % rpm. Bring the rpm down first, then order astern.
- **Why:** Above that speed the controller treats an opposite-direction order as a mistake and leaves the pod as it is.
- **Real world:**
  - `published` When the pod speed is over 50 rpm (of a 180 rpm maximum), an order in the opposite sense is taken by the computer as a mistake and the unit does not change the pod speed or direction of pull. If the order is not changed within a short, adjustable delay, the rpm is set to zero without any alarm. The handler must bring the rpm under 50 before ordering astern. — *striga-impa*
- **In SHIPSHAPE:** Here the pod holds its rpm and the dial reads REV BLOCKED until the rpm is below {rev} %. The model does not go on to set the rpm to zero.

### `pod-zero-lever` · Lever at zero does not slow her · draft

Applies to: pod

- **Brief:** Under way, zero rpm adds no braking. To slow her, give a small astern order once the rpm is low enough.
- **Why:** With the lever at zero the wake keeps the propeller turning, so there is no resisting torque to slow the ship.
- **Real world:**
  - `published` While the ship is proceeding with the lever at zero, the screw is kept rotating by the wake, so the ship is not slowed because there is no resisting torque. To slow down, the handler has to give a small negative rpm order. — *striga-impa*
  - `measured` In the model tests, a stop with the propellers windmilling and the pods turned 90° outward took {pub.inertia} ship lengths from about 12 kn, against {pub.swing180} for the best powered method. — *nowicki-2014*
- **In SHIPSHAPE:** Here too zero rpm barely slows her. A small astern order brakes her much more, but only once the rpm is below {rev} %.

### `pod-stopping` · Stopping from speed: six methods tested · draft

Applies to: pod

- **Brief:** Turning twin pods through 180° stopped the model in {pub.swing180} L; reversing the propellers took {pub.reverse} L.
- **Why:** Model tests of a twin-pod LNG carrier compared six ways of stopping, from letting the propellers windmill to turning the pods through 180°.
- **Real world:**
  - `measured` Model of a large LNG carrier (277.5 m, two pulling azipods), deep water, from about 12 kn (65 % of service speed). Track reach in ship lengths with the propeller rpm kept: pods 90° outward {pub.out90}; pods 90° inward {pub.in90}. Inertia stop, propellers windmilling, pods 90° outward: {pub.inertia}. — *nowicki-2014*
  - `measured` Same model with the rpm changed: pods turned 180° with the rpm eased during the turn {pub.swing180}; propellers reversed to the same astern rpm as ahead {pub.reverse}; pods 30° outward with the propellers reversed {pub.indirect}. — *nowicki-2014*
  - `measured` The author concludes that the pods give a relatively short stop whatever the method, about 3.5 L on average from 12 kn. The indirect manoeuvre (pods angled outward, propellers reversed) was not the best: its track reach was about 37 % greater than turning the pods around. Turning the pods 90° inward or outward made a small difference (4 L against 3.8 L). — *nowicki-2014*
  - `measured` A manual stop wanders: small asymmetries in the pod angles or timing give a large deviation from a straight track, so the heading needs constant control. — *nowicki-2014*
  - `measured` Sea trials of the Azipod cruise ship Elation, reported by Kurimo and cited by Nowicki, gave 2.4 L for the indirect manoeuvre with the pods deflected 35°. — *nowicki-2014*
  - `published` Pilot advice: in a crash stop it is better to rotate the handle 180° and give the maximum rpm than to order directly astern, where the maximum is lower (150 rpm against 180). — *striga-impa*
  - `rule` Masters and pilots commonly hold that a pod ship's crash stop can be half that of a conventional ship, and that it depends strongly on how it is carried out. — *nowicki-2014*
- **In SHIPSHAPE:** The model matches the inertia, 180° turn, reversal and 30° methods to within a quarter. Its two 90° "rpm kept" stops run far too long, so do not trust its numbers for those two. The Validation section of the menu has the comparison.

### `pod-turn-round` · Ease the rpm while the pods swing round · draft

Applies to: pod · tip when `pods-across-flow` (hold 1.5 s, cool 60 s, priority 2)

- **Brief:** Turning the pods round to stop: ease the rpm while they pass 60 to 70° to the flow, then bring it back.
- **Why:** That is where the blade loads are worst, and easing the thrust during the turn reduces them.
- **Real world:**
  - `published` Turning the pods around is not for single-pod ships (the heading changes too much). For twin-pod ships it is acceptable and, according to many test results, more effective than reversing the propellers. The drawback is blade loading, worst with a pod about 60 to 70° from the ship's velocity; reducing the thrust while the pods turn may reduce it. — *nowicki-2014*
  - `measured` In the model test of this method the rpm was reduced while the pods turned and returned afterwards. It gave the shortest track reach of the six methods, {pub.swing180} L. — *nowicki-2014*
- **In SHIPSHAPE:** The model has no blade-load limit: it shows only how far she goes.

### `pod-berth-pods` · Alongside: one pod along, one across · draft

Applies to: pod (becancour, lady, spirit, paspaley-pearl)

- **Brief:** Near the berth, put the berth-side pod fore-and-aft and the other across the ship, like a stern thruster.
- **Why:** The shipyards advise it. The control system favours the fore-and-aft pod and cuts the power to the other.
- **Real world:**
  - `published` The shipyards advise, close to the berth, putting the pod on the berth side in a longitudinal position to move ahead or astern, and the other perpendicular to the berth, acting like a stern thruster. The electronic plant gives preference to the longitudinal pod and automatically reduces the power available to the perpendicular one. — *striga-impa*
- **In SHIPSHAPE:** In INDEP mode, with one pod fore-and-aft and the other across, the cross pod is held back and the dial reads SPLIT.

### `pod-shared-power` · Pods and thrusters share one switchboard · draft

Applies to: pod (becancour, lady, spirit, paspaley-pearl) · tip when `power-limited` (hold 3 s, cool 90 s, priority 2)

- **Brief:** Full bow thruster and full pods together exceed the switchboard: expect a power limit on the dials.
- **Why:** The ship's electrical power is not enough to run the pods and the bow thrusters all at full power together.
- **Real world:**
  - `published` The ship's electrical power is not sufficient to supply both the pods and the bow thrusters operating all together at full power, so the handler has to remember that the pods' whole power is not available while the thrusters run at maximum. — *striga-impa*
- **In SHIPSHAPE:** She has {avail} MW on the switchboard for pods and thrusters together. The dials read PWR LIMIT when it runs short.

### `pod-bow-first` · Set the bow first, then the stern · draft

Applies to: pod (becancour, lady, spirit, paspaley-pearl)

- **Brief:** The pods are far stronger than the bow thruster: adjust the bow's position before the stern's.
- **Why:** The pilots' memento asks the handler to keep the difference in power in mind and to position the bow before the stern.
- **Real world:**
  - `published` The pods' efficiency is considerably bigger than the bow thrusters': the handler has to keep the difference in power in mind to adjust the position of the bow before the position of the stern. — *striga-impa*
- **In SHIPSHAPE:** Her bow thruster gives {btT} t of thrust against {podT} t of bollard pull from each pod.

### `pod-outlines` · The dashed outlines: what the joystick would do · draft

Applies to: pod (becancour, lady, spirit, paspaley-pearl)

- **Brief:** With VECTORS on and INDEP selected, dashed outlines show the pod and thruster settings the joystick would use.
- **Why:** They aim to close the quay at the guideline speed and hold her parallel. Neutral is both pods pulling inward against each other.
- **In SHIPSHAPE:** This is the joystick allocator's answer for a simple docking rule of this model's own (both ends of the hull closing at the guideline speed), not a published procedure. Within range of a quay and with a berth chosen, drag each dial, lever and the thruster onto its outline.

### `pod-closing-speed` · Closing speed: half the distance · draft

Applies to: pod · tip when `closing-fast` (hold 2 s, cool 60 s, priority 2)

- **Brief:** Sideways closing speed in cm/s: about half the distance to the berth in metres.
- **Why:** It comes from an analysis of 47 VLCC berthings, whose manoeuvres fell into three types: efficient, prudent and unstable.
- **Real world:**
  - `measured` From 47 observed VLCC berthings: the approach speed of berthing (in cm/s) is conveniently half of the distance (in m) between the ship and the berth. Berthing speeds varied widely and depended strongly on who handled the ship. (Abstract only; the paper is in Japanese.) — *ishihata-1988*
- **In SHIPSHAPE:** The guideline on the quay distances is the lower of that rule and this simulator's own approach-speed limit for her displacement. It is never set below a floor she can hold.

### `pod-stop-turn-round` · Crash stop: turn the pods round · procedure · draft

Applies to: pod (becancour, lady, spirit, paspaley-pearl) · proof `pod-stop-turn-round` · needs 4 kn

- **Brief:** Stop a twin-pod ship by turning both pods round through 180° and giving full rpm.
  1. Note your heading and check the water ahead. Model tests of a twin-pod ship needed {pub.swing180} to {pub.reverse} ship lengths. (check `ack`)
  2. Swing both pods round together: set the dial to astern (180°). (check `pods-ordered-round`)
  3. Ease the rpm while they swing across the flow: blade loads are worst about 60 to 70° to it. (check `rpm-eased`)
  4. With the pods round, bring the rpm back up to take the way off. (check `rpm-up-round`)
  5. Watch your heading and trim the pods to keep her straight until she stops. (check `stopped`)
  6. Stopped: rpm to zero and the pods back ahead. (check `pods-idle`)
- **Real world:**
  - `measured` Turning the pods around is more effective than reversing the propellers on a twin-pod ship, but not for single-pod ships. Blade loading is the drawback, worst with a pod about 60 to 70° from the ship's velocity, and reducing the thrust while the pods turn may diminish it. In the model test of this method the rpm was reduced while the pods turned and returned afterwards: {pub.swing180} L from about 12 kn. — *nowicki-2014*
  - `published` In a crash stop it is better to rotate the handle 180° and give the maximum rpm than to order directly astern, where the maximum is lower. — *striga-impa*
  - `measured` A manual stop wanders: small asymmetries in pod angle or timing give a large deviation from a straight track. — *nowicki-2014*
- **In SHIPSHAPE:** In this model the 180° turn is the shortest of the stops that use the pods' power, and the pods take {slew180} s to swing round.

### `pod-stop-reverse` · Crash stop: reverse the propellers · procedure · draft

Applies to: pod (becancour, lady, spirit, paspaley-pearl) · proof `pod-stop-reverse` · needs 4 kn

- **Brief:** Stop by reversing both propellers once the rpm is below {rev} %: above it a reverse order is ignored.
  1. Note your heading and check the water ahead. Model tests of a twin-pod ship needed {pub.swing180} to {pub.reverse} ship lengths. (check `ack`)
  2. Bring both rpm down below {rev} %: the controller ignores a reverse order above it. (check `rpm-below-limit`)
  3. Then order full astern, up to {astern} % of the ahead maximum. (check `astern-ordered`)
  4. Watch your heading and trim the pods to keep her straight until she stops. (check `stopped`)
  5. Stopped: rpm to zero. (check `pods-idle`)
- **Real world:**
  - `published` When the pod speed is over 50 rpm (of a 180 rpm maximum), an order in the opposite sense is treated as a mistake and the pod keeps its speed and direction of pull. The handler must bring the rpm under 50 before ordering astern. — *striga-impa*
  - `measured` Reversing the propellers (astern rpm as ahead) took {pub.reverse} L from about 12 kn in the model tests, against {pub.swing180} L for turning the pods round. Reversing the electric drive takes about 60 s. — *nowicki-2014*
- **In SHIPSHAPE:** Ordered at once from speed, an astern order is ignored here and she runs on. Staged as above she stops, in more ship lengths than by the 180° turn.

### `ex-pod-stop` · Crash stop from speed · exercise · draft

spirit in `trials` at 12 kn · measured from the first order until she has stopped, at most 600 s

- **Brief:** Take the way off a Spirit-class ship in open water by any method, and compare it with the model tests.
  - Stop her from speed in open water, by any method.
  - Keep her as straight as you can.
- **Debrief:** reach, time, heading, offtrack
- **Real world:**
  - `measured` Model tests of a twin-pod LNG carrier from about 12 kn gave track reaches of {pub.swing180} to {pub.reverse} L for the powered methods. — *nowicki-2014*

### `ex-pod-alongside` · Alongside at Quai 27 · exercise · draft

spirit in `quai27` · measured from the start until she has landed, at most 1500 s

- **Brief:** Bring a Spirit-class ship alongside the main quay in the wind, and land her gently.
  - Lie her alongside on the berth mark.
  - Keep both ends under the closing-speed guideline.
  - Land gently on the fenders.
- **Debrief:** landing, fender, closing, time
- **Real world:**
  - `measured` From 47 observed VLCC berthings: the approach speed (in cm/s) is conveniently half of the distance (in m) between the ship and the berth. — *ishihata-1988*

## Tugs

### `tug-orders` · Order a tug: place, action, power · draft

Applies to: pod, twostroke, cpp, jet, dp, asd, vsp, rotor

- **Brief:** Give each order as the tug's place, then push or pull, then power: "Tug forward, push, half."
- **Why:** Standard orders name the tug's position first (numbered from forward to aft once there are three or more), then the action and the power.
- **Real world:**
  - `published` Each order is preceded by the tug's position: Tug Forward or Tug Aft for two tugs, numbered from forward to aft for three or more. PUSH and LIFT OFF (pull) act at 90° to the ship's fore-and-aft line unless the pilot asks for another angle. — *flinders-tug-orders*
  - `published` Powers: MINIMUM (5 % or less of the tug's power where possible), QUARTER, HALF, THREE QUARTERS, FULL, and MAXIMUM for emergencies only. STOP, NO WEIGHT and OFF THE HULL are modes that keep the tug in place without changing the ship's movement. — *flinders-tug-orders*
  - `published` In Japan, the USA (Los Angeles and Long Beach) and Sri Lanka tug orders follow one sequence: motion (push or pull), engine power, then direction. They are agreed locally and are not globally standardized; the authors propose standard orders in the IMO Standard Marine Communication Phrases. — *ishikura-2013*
  - `published` Masters and pilots always give standard position, direction and weight orders, with the weight in percentages and the tugs numbered from fore to aft. — *mhpa-towage-2021*
  - `published` The competence standard for ship-assist towage asks masters to use standard protocols or instructions for power and direction, to appreciate the importance of locally agreed terminology, and to identify and establish communications with multiple tugs. — *mgn468-annex2*
- **In SHIPSHAPE:** In the TUGS panel each tug (TUG FWD and TUG AFT) has a slider from full pull through STOP to full push in quarters, the standard powers.

### `tug-delay` · Order early: tugs need time to change position · draft

Applies to: pod, twostroke, cpp, jet, dp, asd, vsp, rotor

- **Brief:** Order a tug before you need it: changing position takes seconds, and longer from push to pull.
- **Why:** The delay grows when the tug changes drastically, when its line is long and when the ship is moving, even slowly.
- **Real world:**
  - `measured` Bridge video and AIS from tugs in Tokyo and Yokohama (2011 to 2012) showed tugs taking 5 to over 10 s on average to change position after an order. The delay was longer for a drastic change (push to pull or the reverse), for a long line, and with the ship moving, even very slowly. The authors advise giving orders in anticipation of it. — *ishikura-2013*
- **In SHIPSHAPE:** Here a tug takes about twenty seconds to build up its pull and over a minute to swap from pushing to pulling: slower than the real ones, so order even earlier.

### `tug-speed` · Tugs work best when she is slow · draft

Applies to: pod, twostroke, cpp, jet, dp, asd, vsp, rotor · tip when `tugs-too-fast` (hold 2 s, cool 60 s, priority 2)

- **Brief:** Slow her before you ask for the tugs: speed through the water decides whether they can work.
- **Why:** Interaction grows with speed, and alongside the tugs are most effective at minimal speed.
- **Real world:**
  - `published` Speed through the water is what counts when a tug makes fast or lets go: 5 to 8 kn is generally accepted for the Svitzer tugs in Milford Haven; a smaller tug's safe speed may be lower, to be agreed by tug master, ship master and pilot. Interaction grows with speed. Tugs made fast alongside are most effective at minimal speed, and in strong tide much of a tug's power goes on holding position. — *mhpa-towage-2021*
  - `published` A ship's rudder efficiency rises roughly with the square of her speed, so her steering falls off quickly as she slows. Depending on the ship, wind and current, assistance may be needed at relatively high speeds, as much as 6 to 8 kn. — *jurgens-voith*
- **In SHIPSHAPE:** In this model a tug's pull falls away as the ship speeds up and is gone above about six knots.

### `tug-coanda` · Short line, little water: the wash cancels it · draft

Applies to: pod, twostroke, cpp, jet, dp, asd, vsp, rotor

- **Brief:** On a short line against a blunt side with little water under her, the tug's own wash can cancel its pull.
- **Why:** The wash has little room to escape under the hull, hits the ship's side and almost cancels the pull. More line gives it room to die away.
- **Real world:**
  - `published` The Coanda effect can occur when a tug pulls at almost right angles to the ship on a very short towline and the ship has limited under-keel clearance. The tug's wash, with restricted water to escape under the hull, hits the ship's blunt side and makes a force that almost cancels the pull. A greater length of towline gives the wash more sea room to dissipate. — *mhpa-towage-2021*
- **In SHIPSHAPE:** This model does not include this effect.

### `tug-escort` · Escort: steer by the hull, not just the thrust · draft

Applies to: asd, vsp, rotor

- **Brief:** Escorting is steering or braking a ship by towline at speed, in indirect mode: your hull makes the force.
- **Why:** Indirect towing uses the hydrodynamic force on the tug's underwater hull, so the pull on the ship is much more than the thrust.
- **Real world:**
  - `published` Escorting is not any tug connected to a moving ship: with no force on the ship and under about 6 kn it is ship-assist. An escort tug gives steering or braking force through a towline at speeds over 6 kn, usually in indirect mode: lift and drag from the hull and skeg make the towline tension while the drives hold position. Rated escort speed is typically 8 or 10 kn. — *ral-escort*
  - `published` An escort tug is described by four things: its rated escort speed, its maximum steering and braking performance (the escort butterfly diagram), its maximum allowable heel angle in indirect escort, and its towing system load rating. — *ral-escort*
  - `published` A model study of an ASD tug in indirect towing (analytical, still to be validated against real hulls) found the effective towing force much higher than the thruster force, the ratio depending on the hull drift angle, the thruster angle and the escort speed. The author offers the charts as rough guidance for tug masters. — *artyszuk-2014*
  - `published` For escort duties the optimum speed for the tug to be effective is 8 to 10 kn. — *mhpa-towage-2021*
- **In SHIPSHAPE:** The escort scenario puts you on a line to a laden VLCC at speed. The console shows the line's steering and braking pull in tonnes, its lead, and your heel.

### `tug-girting` · Girting: release the line · draft

Applies to: asd, vsp, rotor · tip when `girting-risk` (hold 0.5 s, cool 30 s, priority 3)

- **Brief:** A line leading across the tug can pull it over: if you suspect girting, release the towline at once.
- **Why:** Girting happens when the pull comes at a right angle to the tug and overcomes its righting ability.
- **Real world:**
  - `published` Girting happens when a towline comes at a right angle to the tug and the force is strong enough to overcome the tug's righting ability: the tug is pulled through the water by its tow, up to deck-edge immersion, flooding and capsize. Where girting is suspected or about to happen the towline must be released immediately. — *mhpa-towage-2021*
  - `published` Modern tugs have a substantial towline lead at the bow or near the stern to make girting less likely. Older conventional tugs towing from a hook amidships must use a gog together with emergency quick-release equipment. — *mhpa-towage-2021*
  - `published` In the Ijsselstroom accident (2009) a conventional tug towing over its stern without a bridle, and steering by differential engine power, could not control its yaw as the lead tug sped up. It sheered, girted and capsized five minutes after connecting. For a conventional tug, towing over the stern while running astern is inherently unstable, and the tow speed was too high. — *maib-ijsselstroom*
  - `published` Forces in tethered escort work can exceed the tug's stability or towing-equipment limits and cause a sudden capsize or equipment failure. A towline at up to 45° to the ship can put 140 % of the tug's bollard pull on the deck fitting. — *ral-escort*
- **In SHIPSHAPE:** The model heels the tug as the line pulls across it and the heel gauge shows the deck-edge angle. RELEASE lets the line go.

### `tug-asd` · ASD tug: drives aft, towing point forward · draft

Applies to: asd, rotor

- **Brief:** An ASD tug has its azimuth drives aft and its towing point forward, so it works with its bow.
- **Why:** Both drives can work together as one unit of twice the power, which is how the escort study treats them.
- **Real world:**
  - `published` An ASD tug has its directional propulsion aft and its towing point forward. Most are azimuthing (podded or Z-drive) units, mainly two drives mounted symmetrically. A tractor tug, with its drives forward, assists by its stern in much the same way as an ASD tug does through its bow. — *artyszuk-2014*
  - `published` The ship-assist competence standard covers picking up bow to bow with an ASD tug and the dangers of interaction when working close to large ships, especially bow to bow with ASD and azimuth tractor tugs. — *mgn468-annex2*
- **In SHIPSHAPE:** Each drive has a combi-lever: the lever's direction is the direction of thrust and its distance from the centre is the power, with a dead hub in the middle.

### `tug-vsp` · Voith tractor: thrust steered any way · draft

Applies to: vsp

- **Brief:** A Voith tractor steers its thrust any way with its units forward, and works from its stern.
- **Why:** The two Voith Schneider units, the guard plate and the aft fin all give hydrodynamic lift.
- **Real world:**
  - `published` The Voith Schneider propeller can steer its thrust in any direction steplessly. The Voith Water Tractor has a comparatively flat hull, two such units in the bow section under a guard plate, and a stabilising fin aft with the towing gear above it. The units, guard and fin are hydrodynamically active. — *jurgens-voith*
  - `published` It can work in direct and indirect modes and so assist a ship over a wide range of speeds; the fin improves its indirect capability at lower speeds. — *jurgens-voith*
- **In SHIPSHAPE:** The pad sets each unit's direction of thrust and how much of it.

### `tug-assist` · Work two assist tugs · procedure · draft

Applies to: pod, twostroke, cpp, jet, dp, asd, vsp, rotor · proof `tug-assist`

- **Brief:** Slow her first, order each tug by place, action and power, and bring them back to stop before she lands.
  1. Slow her before you call the tugs: they have little grip on a ship that is still making way. (check `slow-for-tugs`)
  2. Order each tug by place, action and power: "Tug forward, push, half". (check `tugs-ordered`)
  3. Watch the FWD and AFT closing speeds on the quay lines and trim the tugs to keep her parallel. (check `ack`)
  4. As she closes the quay, bring the tugs back to STOP: they take time to come off. (check `tugs-stopped`)
- **Real world:**
  - `published` Each order is preceded by the tug's position: Tug Forward or Tug Aft for two tugs, numbered from forward to aft for three or more. PUSH and LIFT OFF (pull) act at 90° to the ship's fore-and-aft line unless the pilot asks for another angle. — *flinders-tug-orders*
  - `published` Tugs made fast alongside are most effective at minimal speed, and in strong tide much of a tug's power goes on holding position. — *mhpa-towage-2021*
- **In SHIPSHAPE:** In the model two tugs on one side push or pull across the beam, keep less of their pull as she speeds up and none above about six knots, and take about twenty seconds to build or shed it. With VECTORS on, the sliders show the orders that would close the gap at the guideline speed.

### `tug-release` · Release the line before she girts · procedure · draft

Applies to: asd, vsp, rotor · proof `tug-release`

- **Brief:** If the line pulls her across and heels her toward the deck edge, release the towline at once.
  1. Watch the heel gauge and the lead of the line: a line pulling across the tug heels it toward the deck edge. (check `ack`)
  2. The heel is building with the line fast and pulling across: this is the girting danger. (check `girting-risk`)
  3. Release the towline now: RELEASE lets the line go. (check `line-released`)
  4. Let her come upright before you take a line again: hold the drives steady until the heel is back down. (check `upright`)
- **Real world:**
  - `published` Girting happens when a towline comes at a right angle to the tug and the force is strong enough to overcome the tug's righting ability: the tug is pulled through the water by its tow, up to deck-edge immersion, flooding and capsize. Where girting is suspected or about to happen the towline must be released immediately. — *mhpa-towage-2021*
- **In SHIPSHAPE:** In the escort scenario a tug left alone is snatched over by the line a few minutes in. Released at the first warning, the heel peaks well under the deck edge and she is upright within half a minute; held, the heel reaches the deck edge.

### `ex-tug-escort` · Escort a laden VLCC · exercise · draft

asd-tug in `escort` · measured from the start for 420 s

- **Brief:** Steer a laden VLCC at speed on your line in indirect mode, and keep your heel under the deck edge.
  - Work out to her quarter and steer her with the line in indirect mode.
  - Keep your heel well under the deck edge.
  - When her rudder jams, stop her swing.
  - If you are girting or about to, release the line.
- **Debrief:** heel, tension, released, swing
- **Real world:**
  - `published` Where girting is suspected or about to happen the towline must be released immediately. — *mhpa-towage-2021*
  - `published` An escort tug has a maximum allowable heel angle in indirect escort and a towing system load rating that limits the line tension. — *ral-escort*

### `ex-tug-assist` · Alongside with the tugs · exercise · draft

spirit in `quai27` · measured from the start until she has landed, at most 1500 s

- **Brief:** Bring a Spirit-class ship alongside at Quai 27 and work the two tugs: slow her first, then use them.
  - Slow her before you call the tugs.
  - Order each tug by place, action and power.
  - Land gently on the fenders.
- **Debrief:** tugspeed, landing, closing, time
- **Real world:**
  - `published` Speed through the water is what counts when a tug makes fast or lets go: 5 to 8 kn is generally accepted for the Svitzer tugs in Milford Haven; tugs made fast alongside are most effective at minimal speed. — *mhpa-towage-2021*

## Specialised propulsion

### `thruster-speed` · Thrusters fade as she moves · draft

Applies to: pod, twostroke, cpp, jet, dp (becancour, lady, spirit, kcs, ulcv, lng, ropax, cruise-shaft, hsc-cat, psv, ahts, push-convoy, superyacht, paspaley-pearl, cb-baltic, cb-baltic-ballast)

- **Brief:** A bow thruster is for low speed: under way it loses about half its push.
- **Why:** The oncoming flow bends the thruster's jet, which changes the side force and the yawing moment on the hull.
- **Real world:**
  - `measured` Model tests: the effectiveness of a side thruster diminishes with forward speed. Side force fell to about 50 % as speed rose from zero to about 3 or 4 kn, and above that stayed almost constant or improved a little. — *kijima-1975*
  - `measured` The authors name the bending and diffusion of the jet by the oncoming flow as the most important factor, and suggest that a reduced-pressure region between the hull and the jet ceases to exist at about 3 or 4 kn. — *kijima-1975*
- **In SHIPSHAPE:** At {thrKn} kn the model leaves a tunnel thruster {thrLeft} % of its push, and about half at any higher speed. The joystick and DP allocators plan with the same fall-off.

### `thruster-stern` · Stern thrusters fade less than bow thrusters · draft

Applies to: cpp, dp (ropax, cruise-shaft, ahts, superyacht)

- **Brief:** Model tests found a stern thruster loses less under way than a bow thruster, and in shallow water can gain.
- **Why:** Speed affects a stern thruster differently from a bow thruster; the authors explain the shallow-water rise by an analogy with jet-flap wings.
- **Real world:**
  - `measured` Model tests of a twin-screw ocean ferry (bow and stern thrusters) and of a tanker (stern thruster only): ship speed has a large influence on stern-thruster performance, very different from its influence on the bow thruster. — *fujino-1978*
  - `measured` In deep water the forces from the stern thruster do not decrease as much as those from the bow thruster. In shallow water its lateral force increases with ship speed and may amount to several times the force at zero speed. — *fujino-1978*
- **In SHIPSHAPE:** The model gives the stern thruster the same fall-off as the bow thruster, so it does not show this difference.

### `imo-trials` · The IMO limits behind the Sea trials table · draft

Applies to: pod, asd, vsp, rotor, twostroke, cpp, jet, dp

- **Brief:** The Sea trials table grades her against the IMO limits for turning, course changing and stopping.
- **Why:** Turning circle, zig-zag and crash stop each test one thing: how she turns, how she checks a swing, how she answers the helm and how she stops.
- **Real world:**
  - `published` From the IMO standards (MSC.137(76)), as summarised by ABS: tactical diameter under 5 ship lengths and advance under 4.5 in the turning circle; a first overshoot in the 10/10 zig-zag within a limit that depends on length over speed, and under 25° in the 20/20. — *imo-msc137*
  - `published` The same standards: under 2.5 ship lengths travelled before a 10° change of heading, and track reach under 15 ship lengths in a full astern crash stop (20 for large, low-powered vessels). — *imo-msc137*
  - `published` The standards apply to vessels with all types of steering and propulsion devices of 100 m in length and over, and to chemical and gas carriers regardless of length. They do not apply to high-speed craft as defined in the relevant Code. — *imo-msc137*
  - `published` IMO A.601(15) recommends manoeuvring information on board as a pilot card (filled in by the master for the pilot on boarding), a wheelhouse poster (permanently displayed; performance may differ with environment, hull and loading) and a manoeuvring booklet. — *imo-a601*
- **In SHIPSHAPE:** The Sea trials section of the menu runs these tests on the ship in use and marks each against its limit. A ship the standards do not cover is shown the figures for comparison, not graded. The Pilot card · wheelhouse poster section is computed from this model.

### `jet-controls` · Waterjet: nozzle steers, bucket brakes · draft

Applies to: jet

- **Brief:** Steering and ahead-or-astern are separate controls: she can be turned without moving along.
- **Why:** The nozzle turns the jet and the reverse deflector (the bucket) sets ahead, zero or astern; neither changes the engine's direction.
- **Real world:**
  - `published` Waterjet thrust does not depend on boat speed: it is set by the input power and the astern deflector position and is there even at zero speed. So the boat can be turned without moving ahead or astern, and moving the reverse deflector slightly either side of the zero-speed position gives very fine ahead or astern control with full steering. — *hamiltonjet-hj*
  - `published` No change of engine rotation is needed to go astern: from full forward to full reverse thrust the reverse duct only moves from fully up to fully down. Steering and ahead-astern are separate and have independent effects, so they can be combined for complex manoeuvres without complex control inputs. — *hamiltonjet-hj*
- **In SHIPSHAPE:** In the model the bucket goes from ahead through zero thrust to astern, the nozzle turns the jet up to {nozzle}° either way, and the impeller always turns the same way.

### `jet-astern` · Waterjet astern: smooth, but weaker than ahead · draft

Applies to: jet

- **Brief:** The bucket gives a smooth, powerful stop, but astern thrust is only part of ahead thrust.
- **Why:** The reversed flow is vectored away from the intake, so astern thrust holds up at high throttle, though it is less than ahead.
- **Real world:**
  - `published` The split-duct reverse deflector gives astern thrust equivalent to up to 60 % of ahead thrust, maintainable up to high throttle settings; vectoring the astern thrust away from the jet intake avoids recirculation. — *hamiltonjet-hj*
  - `published` The shift from full ahead to full astern is smooth as the deflector is lowered through the jetstream, eliminating the delay or shock loading normally associated with propeller and gearbox drives, and gives a powerful braking function for emergencies. — *hamiltonjet-hj*
- **In SHIPSHAPE:** For the same engine power the model's full-astern bucket gives about six-tenths of the ahead thrust. With the buckets down she stops within a couple of ship lengths; with the buckets up and the engines idling she coasts for minutes.

### `jet-sideways` · Several jets can walk her sideways · draft

Applies to: jet

- **Brief:** With two or more jets, the right mix of nozzle and bucket pushes her sideways without a thruster.
- **Why:** At the zero-speed bucket position the ahead and astern thrusts balance, so thrust vectoring alone can move her sideways.
- **Real world:**
  - `published` Sideways thrust is possible with two or more jets (with split-duct reverse deflectors) without the need for a bow thruster. At the intermediate zero-speed deflector position ahead and astern thrusts are equalised to hold the craft on station, with steering still available for rotational control. — *hamiltonjet-hj*
  - `published` Infinitely variable adjustment either side of the zero-speed position lets the craft be crept ahead or astern, and in multiple-jet installations appropriate thrust vectoring alone can be used to induce true sideways movement. — *hamiltonjet-hj*
- **In SHIPSHAPE:** The fast ferry's joystick works this way: it sets the nozzles and buckets for the sideways force, takes the turning moment out with the bow thruster and by running the port and starboard jets differentially, and scales the demand down when it is beyond the jets.

### `ts-reverse` · Crash astern: wait for the shaft to slow · draft

Applies to: twostroke · tip when `astern-waiting` (hold 3 s, cool 120 s, priority 2)

- **Brief:** A direct-reversing engine can only start astern once the shaft has slowed: order astern early.
- **Why:** Stopping the fuel leaves the propeller turning the engine. Starting air then brakes the shaft and, at zero rpm, the astern start is given.
- **Real world:**
  - `rule` Crash manoeuvring turns the main engine the other way to take the ship's way off. Tell the engine room and change the controls over to the engine room; give astern on the telegraph and have it acknowledged (the starting-air cam comes round astern only after that). — *marinesite-crash*
  - `rule` Once the rpm drops below 40 % of MCR, give brake air in the astern direction, a few times in a short time. When the rpm is zero the fuel cam comes round astern; give the start kick with the fuel lever at minimum. — *marinesite-crash*
  - `rule` Putting the telegraph from full ahead to stop does not stop the engine at once: the load programme brings the rpm down over time. — *marinesite-crash*
  - `published` In a full astern crash stop the track reach (measured along the path) should generally not exceed 15 ship lengths. For low-powered large-displacement vessels this may be modified, but in no case should exceed 20 ship lengths, subject to special consideration and approval. — *imo-msc137*
- **In SHIPSHAPE:** The model cuts the fuel the moment you order stop or astern (no load programme), waits until the shaft is down to {brakeN} % of full rpm, then starts on air; the {camshaft} s camshaft change runs during the wait. The console reads REVERSING, WAITING · SHAFT TOO FAST, STARTING ASTERN.

### `dp-classes` · DP equipment classes 1, 2 and 3 · draft

Applies to: dp

- **Brief:** Class 1 can lose position on one fault; class 2 should not; class 3 also survives fire or flood.
- **Why:** Class 2 has redundancy so no single fault in an active system fails the system; class 3 also withstands fire or flood in any one compartment.
- **Real world:**
  - `rule` The DP equipment classes the classification societies use are based on IMO MSC/Circ.645 (1994). Class 1 has no redundancy: loss of position may occur on a single fault. — *wikipedia-dp*
  - `rule` Class 2 has redundancy so that no single fault in an active system will cause the system to fail: loss of position should not occur from a single fault of an active component such as a generator, thruster or switchboard, but may after failure of a static component such as a cable or pipe. — *wikipedia-dp*
  - `rule` Class 3 also has to withstand fire or flood in any one compartment without the system failing: loss of position should not occur from any single failure, including a completely burnt fire subdivision or flooded watertight compartment. — *wikipedia-dp*
  - `rule` For classes 2 and 3 a consequence analysis should be built into the system to help the operator judge whether enough generators and thrusters are online for the failure of one not to mean a loss of position. If a fault takes away that redundancy and cannot be resolved at once, the operation should be abandoned as quickly as possible. — *wikipedia-dp*
- **In SHIPSHAPE:** The supply vessel and the anchor-handling tug are DP2 ships. The console's consequence line names a unit whose loss the present demand would not survive; its Instructor row trips a unit, blacks out the board or drifts a reference; the capability plot shows what she can hold intact and with the worst failure.

### `ts-crash-astern` · Crash astern: direct-reversing engine · procedure · draft

Applies to: twostroke · proof `ts-crash-astern` · needs 4 kn

- **Brief:** Take the way off by reversing the engine: order astern, wait for the shaft to slow, let it start on air.
  1. Note your heading and check the water ahead: a big ship takes many lengths to stop. (check `ack`)
  2. Order full astern on the telegraph. (check `telegraph-astern`)
  3. Wait: with way on, the engine will not start astern until the shaft has slowed. (check `engine-waiting`)
  4. Watch the engine start on air astern; the START AIR row counts the starts left. (check `astern-started`)
  5. Steer with the rudder while she slows, and watch the heading, until the way is off her. (check `stopped`)
  6. Way off her: telegraph to STOP. (check `pods-idle`)
- **Real world:**
  - `rule` Crash manoeuvring: astern on the telegraph, acknowledged by the engine room; brake air in the astern direction once the rpm is below 40 % of MCR; the start kick at zero rpm. The IMO criterion for the track reach is under 15 ship lengths. — *marinesite-crash, imo-msc137*
- **In SHIPSHAPE:** In the model every direct-reversing ship starts astern once the shaft is down to the same share of full rpm, after a wait that depends on her speed and on how fast the propeller slows, and stops inside the IMO limit.

### `jet-stop` · Stop a waterjet ship with the buckets · procedure · draft

Applies to: jet · proof `jet-stop` · needs 6 kn

- **Brief:** Take the way off with the buckets down and the throttle up, then hold her on the zero-thrust bucket.
  1. Note your heading and check the water ahead. (check `ack`)
  2. Drop the buckets: the engines keep turning the same way, the deflector does the reversing. (check `buckets-down`)
  3. Raise the throttle for astern thrust, which is less than ahead thrust. (check `astern-throttle`)
  4. Use the nozzles to hold her heading while she slows: steering works at every bucket position. (check `ack`)
  5. Wait until she has stopped. (check `stopped`)
  6. Bring the buckets to their zero-thrust position, which holds her on station, and ease the throttle. (check `bucket-zero`)
- **Real world:**
  - `published` Reverse thrust needs no change of engine rotation: the reverse duct moves from fully up to fully down. Astern thrust is up to 60 % of ahead thrust and the smooth shift gives a powerful braking function for emergencies. At the zero-speed position the thrusts balance and the craft holds station; independent steering is available at every position. — *hamiltonjet-hj*
- **In SHIPSHAPE:** In the model the stop is quick and straight: buckets down and throttle up take the way off within a couple of ship lengths, where with the buckets up and the engines idling she would coast on for minutes.

### `ex-ts-crash` · Crash stop the VLCC · exercise · draft

kvlcc2 in `trials` at 14 kn · measured from the first order until she has stopped, at most 1500 s

- **Brief:** Take the way off a laden VLCC from sea speed by reversing the engine, then compare with the IMO limit.
  - Order full astern from sea speed in open water.
  - Watch the engine room messages: it starts astern only once the shaft has slowed.
  - Steer with the rudder while she slows, and watch the heading.
- **Debrief:** reachimo, astern, time, turned
- **Real world:**
  - `published` In a full astern crash stop the track reach (measured along the path) should generally not exceed 15 ship lengths. For low-powered large-displacement vessels this may be modified, but in no case should exceed 20 ship lengths, subject to special consideration and approval. — *imo-msc137*

### `ex-jet-quay` · Fast ferry alongside · exercise · draft

hsc-cat in `hsc` · measured from the start until she has landed, at most 1200 s

- **Brief:** Bring the fast ferry in from sea and berth her on the jets, creeping in on the buckets.
  - Come off the power in time to be inside the harbour speed limit at the breakwater.
  - Berth port side to on the ferry quay with the buckets and nozzles, or the joystick.
  - Land gently on the fenders.
- **Debrief:** landing, fender, closing, time
- **Real world:**
  - `published` Infinitely variable adjustment either side of the zero-speed deflector position lets the craft be crept ahead or astern, and in multiple-jet installations appropriate thrust vectoring alone can be used to induce true sideways movement. — *hamiltonjet-hj*

### `ex-dp-hold` · Hold position on DP through a fault · exercise · draft

psv in `dp` · measured from the start for 600 s

- **Brief:** Hold the supply vessel on her set point while a unit trips and the references drift.
  - Take her in on the joystick, then select auto position off the platform.
  - Watch the consequence line and the capability plot when the first unit trips.
  - Notice when both DGNSS references drift together, and decide which reference to trust.
- **Debrief:** dperr, dputil, dplimit
- **Real world:**
  - `rule` Class 2 has redundancy so that no single fault in an active system will cause the system to fail: loss of position should not occur from a single fault of an active component such as a generator, thruster or switchboard. — *wikipedia-dp*

## Sources cited

- `nowicki-2014` Nowicki, J. (2014), Stopping of Ships Equipped with Azipods, TransNav 8(3), doi:10.12716/1001.08.03.07 <https://www.transnav.eu/files/Stopping_of_Ships_Equipped_with_Azipods,519.pdf>
- `striga-impa` Striga, R., AZIPODS memento for the pilots’ use, IMPA (builders’ data and the experience of Capt. P. Esposito, 2002) <https://www.impahq.org/sites/default/files/2021-04/article1198153097_0.pdf>
- `abb-azipod-co` ABB, Azipod® CO product introduction <https://library.e.abb.com/public/85d7a5e53e6a8e6ec12577e7002d2359/Azipod_CO_Product%20Introduction_rev%20C_LowRes.pdf>
- `ishihata-1988` Ishihata, S. (1988), Actual berthing speed of VLCC and its optimum speed, Institute of Navigation Journal (Japan) 79, p. 177 (abstract read; the paper is in Japanese) <https://trid.trb.org/View/432962>
- `ral-escort` Robert Allan Ltd (2025), Escort Towage <https://ral.ca/wp-content/uploads/2025/06/Escort-Towage.pdf>
- `artyszuk-2014` Artyszuk, J. (2014), Steady-state manoeuvring of a generic ASD tug in escort pull and bow-rope aided push operation, TransNav 8(3), doi:10.12716/1001.08.03.17 <https://www.transnav.eu/files/Steadystate_Manoeuvring_of_a_Generic_ASD_Tug_in_Escort_Pull_and_Bowrope_Aided_Push_Operation,529.pdf>
- `ishikura-2013` Ishikura, A., Sugita, K., Hayashi, Y. and Murai, K. (2013), Proposal for global standard manoeuvring orders for tugboats, TransNav 7(4), doi:10.12716/1001.07.04.05 <https://www.transnav.eu/files/Proposal_for_Global_Standard_Maneuvering_Orders_for_Tugboats,462.pdf>
- `flinders-tug-orders` Flinders Ports Holdings, Tug orders <https://www.flindersportholdings.com.au/wp-content/uploads/2025/09/Tug-Orders.pdf>
- `mhpa-towage-2021` Milford Haven Port Authority (2021), Towage guidelines <https://www.mhpa.co.uk/media/gavmxl2p/towage-guidelines-2021.pdf>
- `maib-ijsselstroom` MAIB, Girting and capsize of tug IJsselstroom in Peterhead Bay, Scotland (accident report) <https://www.gov.uk/maib-reports/girting-and-capsize-of-tug-ijsselstroom-in-peterhead-bay-scotland>
- `mgn468-annex2` MCA, MGN 468 (M) Amendment 1, Voluntary Towage Endorsement Scheme, Annex 2: competence standards for ship-assist towage endorsement <https://gov.uk/government/publications/mgn-468-amendment-1-m-voluntary-towage-endorsement-scheme/annex-2-competence-standards-for-ship-assist-towage-endorsement>
- `jurgens-voith` Jürgens, D. and Palm, M., Voith Water Tractor: improved manoeuvrability and seakeeping behaviour <https://towmasters.wordpress.com/wp-content/uploads/2009/06/voithwatertractor.pdf>
- `hamiltonjet-hj` HamiltonJet (2014), HJ Series waterjets brochure <https://hamiltonjet.com/assets/main/hj-series-brochure-eng-2014.pdf>
- `marinesite-crash` Crash manoeuvring, crash stop of the main engine (marinesite.info) <https://www.marinesite.info/2019/07/crash-manouvering-crash-stop-main-engine.html>
- `kijima-1975` Kijima, K. and Inoue, S. (1975), Influence of forward speed on the manoeuvrability of a ship with a side thruster, West Japan Society of Naval Architects, paper 50 (abstract read) <https://trid.trb.org/View/159173>
- `fujino-1978` Fujino, M., Saruta, T. and Ida, T. (1978), Experimental studies on the effectiveness of the side thruster, Journal of the Kansai Society of Naval Architects 168, p. 35 (abstract read) <https://trid.trb.org/View/85435>
- `wikipedia-dp` Dynamic positioning, Wikipedia: its summary of the IMO MSC/Circ.645 equipment classes (the IMO text itself has not been read) <https://en.wikipedia.org/wiki/Dynamic_positioning>
- `imo-a601` IMO Resolution A.601(15), Provision and display of manoeuvring information on board ships <https://wwwcdn.imo.org/localresources/en/KnowledgeCentre/IndexofIMOResolutions/AssemblyDocuments/A.601(15).pdf>
- `imo-msc137` IMO MSC.137(76), Standards for ship manoeuvrability, as summarised in the ABS Guide for Vessel Maneuverability <https://ww2.eagle.org/content/dam/eagle/rules-and-guides/current/conventional_ocean_service/145_vesselmaneuverability/Vessel_Maneuverability_Guide_e-Feb17.pdf>
