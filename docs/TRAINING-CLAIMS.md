# Training guide: claims register

Generated from `src/guide/content` by `npm run guide:dossier`. Do not edit by hand: `npm test` fails when it is out of date.
The sources are listed in [TRAINING.md](TRAINING.md). Numbers written as `{token}` are filled in from the ship's own particulars or a published figure.

**11 cards · 0 procedures · 0 exercises · 11 draft · 0 reviewed**

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

## Tugs

Nothing shipped yet.

## Specialised propulsion

Nothing shipped yet.

## Sources cited

- `nowicki-2014` Nowicki, J. (2014), Stopping of Ships Equipped with Azipods, TransNav 8(3), doi:10.12716/1001.08.03.07 <https://www.transnav.eu/files/Stopping_of_Ships_Equipped_with_Azipods,519.pdf>
- `striga-impa` Striga, R., AZIPODS memento for the pilots’ use, IMPA (builders’ data and the experience of Capt. P. Esposito, 2002) <https://www.impahq.org/sites/default/files/2021-04/article1198153097_0.pdf>
- `abb-azipod-co` ABB, Azipod® CO product introduction <https://library.e.abb.com/public/85d7a5e53e6a8e6ec12577e7002d2359/Azipod_CO_Product%20Introduction_rev%20C_LowRes.pdf>
- `ishihata-1988` Ishihata, S. (1988), Actual berthing speed of VLCC and its optimum speed, Institute of Navigation Journal (Japan) 79, p. 177 (abstract read; the paper is in Japanese) <https://trid.trb.org/View/432962>
