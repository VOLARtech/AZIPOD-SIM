# Training guide: claims register

Generated from `src/guide/content` by `npm run guide:dossier`. Do not edit by hand: `npm test` fails when it is out of date.
The sources are listed in [TRAINING.md](TRAINING.md). Numbers written as `{token}` are filled in from the ship's own particulars or a published figure.

**19 cards · 2 procedures · 4 exercises · 25 draft · 0 reviewed**

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

Nothing shipped yet.

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
