// Azipod ships: the twin-pod ships and the icebreaker's three pods. Statements about the real world are in
// `real`, each with its sources; `sim` says what this simulator's model does. See docs/TRAINING.md.
import type { Card, Content } from '../types';

/** The twin-pod ships with a bow thruster (the icebreaker has three pods and none). */
const TWIN = ['becancour', 'lady', 'spirit', 'paspaley-pearl'];

const CARDS: Card[] = [
  {
    id: 'pod-pull', track: 'azipod', fam: ['pod'], review: 'draft',
    title: 'Pods pull: dial where you want the pull',
    brief: 'Set each dial where you want the stern pulled, not where you want the ship to go.',
    why: 'The pilots\' memento puts it plainly: the pods are tractors, so the lever points the way the pull is wanted.',
    real: [
      { text: 'The pods are tractors: the bridge levers have to be oriented in the direction where the pulling is required, and not in the direction the ship should go.', src: ['striga-impa'], conf: 'published' },
      { text: 'An Azipod is a podded electric main propulsion and steering device driving a fixed-pitch propeller at variable speed. The Azipod CO is designed for the preferential use of the directly driven pulling propeller when driving ahead, and it azimuths without limit through 360°.', src: ['abb-azipod-co'], conf: 'published' },
    ],
    sim: 'The dial\'s handle is the ordered direction of pull and the coloured needle is the pull she is giving. LINKED sets both pods from one dial.',
  },
  {
    id: 'pod-slew', track: 'azipod', fam: ['pod'], review: 'draft',
    title: 'Pods swing slowly and the plant lags',
    brief: 'A pod swings at {slew}°/s and the plant answers slowly: order early, and don\'t chase with quick orders.',
    why: 'Half a turn takes {slew180} s at her slew rate and full rpm takes {rpmTime} s. Short, fast orders have no chance to be effective.',
    real: [
      { text: 'Pod slew speed generally lies between 5 and 7.5 °/s, so the opposite position is reached after 24 to 36 s. Reversing the propeller takes about 60 s because it is electrically driven, where a classical diesel plant takes from a few to several minutes.', src: ['nowicki-2014'], conf: 'published' },
      { text: 'There is a long delay between the order and the reaction of the electronic and mechanical plant: a succession of short and fast orders will not have any chance to be effective.', src: ['striga-impa'], conf: 'published' },
    ],
    sim: 'Her pods slew at {slew}°/s and take {rpmTime} s to reach full rpm, {rpmReverse} s from full ahead to full astern.',
  },
  {
    id: 'pod-reverse-order', track: 'azipod', fam: ['pod'], review: 'draft',
    title: 'Take the rpm off before you order astern',
    brief: 'A reverse order is ignored above {rev} % rpm. Bring the rpm down first, then order astern.',
    why: 'Above that speed the controller treats an opposite-direction order as a mistake and leaves the pod as it is.',
    real: [
      { text: 'When the pod speed is over 50 rpm (of a 180 rpm maximum), an order in the opposite sense is taken by the computer as a mistake and the unit does not change the pod speed or direction of pull. If the order is not changed within a short, adjustable delay, the rpm is set to zero without any alarm. The handler must bring the rpm under 50 before ordering astern.', src: ['striga-impa'], conf: 'published' },
    ],
    sim: 'Here the pod holds its rpm and the dial reads REV BLOCKED until the rpm is below {rev} %. The model does not go on to set the rpm to zero.',
    tip: { when: 'rev-blocked', hold: 1, cool: 45, prio: 3 },
  },
  {
    id: 'pod-zero-lever', track: 'azipod', fam: ['pod'], review: 'draft',
    title: 'Lever at zero does not slow her',
    brief: 'Under way, zero rpm adds no braking. To slow her, give a small astern order once the rpm is low enough.',
    why: 'With the lever at zero the wake keeps the propeller turning, so there is no resisting torque to slow the ship.',
    real: [
      { text: 'While the ship is proceeding with the lever at zero, the screw is kept rotating by the wake, so the ship is not slowed because there is no resisting torque. To slow down, the handler has to give a small negative rpm order.', src: ['striga-impa'], conf: 'published' },
      { text: 'In the model tests, a stop with the propellers windmilling and the pods turned 90° outward took {pub.inertia} ship lengths from about 12 kn, against {pub.swing180} for the best powered method.', src: ['nowicki-2014'], conf: 'measured' },
    ],
    sim: 'Here too zero rpm barely slows her. A small astern order brakes her much more, but only once the rpm is below {rev} %.',
  },
  {
    id: 'pod-stopping', track: 'azipod', fam: ['pod'], review: 'draft',
    title: 'Stopping from speed: six methods tested',
    brief: 'Turning twin pods through 180° stopped the model in {pub.swing180} L; reversing the propellers took {pub.reverse} L.',
    why: 'Model tests of a twin-pod LNG carrier compared six ways of stopping, from letting the propellers windmill to turning the pods through 180°.',
    real: [
      { text: 'Model of a large LNG carrier (277.5 m, two pulling azipods), deep water, from about 12 kn (65 % of service speed). Track reach in ship lengths with the propeller rpm kept: pods 90° outward {pub.out90}; pods 90° inward {pub.in90}. Inertia stop, propellers windmilling, pods 90° outward: {pub.inertia}.', src: ['nowicki-2014'], conf: 'measured' },
      { text: 'Same model with the rpm changed: pods turned 180° with the rpm eased during the turn {pub.swing180}; propellers reversed to the same astern rpm as ahead {pub.reverse}; pods 30° outward with the propellers reversed {pub.indirect}.', src: ['nowicki-2014'], conf: 'measured' },
      { text: 'The author concludes that the pods give a relatively short stop whatever the method, about 3.5 L on average from 12 kn. The indirect manoeuvre (pods angled outward, propellers reversed) was not the best: its track reach was about 37 % greater than turning the pods around. Turning the pods 90° inward or outward made a small difference (4 L against 3.8 L).', src: ['nowicki-2014'], conf: 'measured' },
      { text: 'A manual stop wanders: small asymmetries in the pod angles or timing give a large deviation from a straight track, so the heading needs constant control.', src: ['nowicki-2014'], conf: 'measured' },
      { text: 'Sea trials of the Azipod cruise ship Elation, reported by Kurimo and cited by Nowicki, gave 2.4 L for the indirect manoeuvre with the pods deflected 35°.', src: ['nowicki-2014'], conf: 'measured' },
      { text: 'Pilot advice: in a crash stop it is better to rotate the handle 180° and give the maximum rpm than to order directly astern, where the maximum is lower (150 rpm against 180).', src: ['striga-impa'], conf: 'published' },
      { text: 'Masters and pilots commonly hold that a pod ship\'s crash stop can be half that of a conventional ship, and that it depends strongly on how it is carried out.', src: ['nowicki-2014'], conf: 'rule' },
    ],
    sim: 'The model matches the inertia, 180° turn, reversal and 30° methods to within a quarter. Its two 90° "rpm kept" stops run far too long, so do not trust its numbers for those two. The Validation section of the menu has the comparison.',
  },
  {
    id: 'pod-turn-round', track: 'azipod', fam: ['pod'], review: 'draft',
    title: 'Ease the rpm while the pods swing round',
    brief: 'Turning the pods round to stop: ease the rpm while they pass 60 to 70° to the flow, then bring it back.',
    why: 'That is where the blade loads are worst, and easing the thrust during the turn reduces them.',
    real: [
      { text: 'Turning the pods around is not for single-pod ships (the heading changes too much). For twin-pod ships it is acceptable and, according to many test results, more effective than reversing the propellers. The drawback is blade loading, worst with a pod about 60 to 70° from the ship\'s velocity; reducing the thrust while the pods turn may reduce it.', src: ['nowicki-2014'], conf: 'published' },
      { text: 'In the model test of this method the rpm was reduced while the pods turned and returned afterwards. It gave the shortest track reach of the six methods, {pub.swing180} L.', src: ['nowicki-2014'], conf: 'measured' },
    ],
    sim: 'The model has no blade-load limit: it shows only how far she goes.',
    tip: { when: 'pods-across-flow', hold: 1.5, cool: 60, prio: 2 },
  },
  {
    id: 'pod-berth-pods', track: 'azipod', fam: ['pod'], ships: TWIN, review: 'draft',
    title: 'Alongside: one pod along, one across',
    brief: 'Near the berth, put the berth-side pod fore-and-aft and the other across the ship, like a stern thruster.',
    why: 'The shipyards advise it. The control system favours the fore-and-aft pod and cuts the power to the other.',
    real: [
      { text: 'The shipyards advise, close to the berth, putting the pod on the berth side in a longitudinal position to move ahead or astern, and the other perpendicular to the berth, acting like a stern thruster. The electronic plant gives preference to the longitudinal pod and automatically reduces the power available to the perpendicular one.', src: ['striga-impa'], conf: 'published' },
    ],
    sim: 'In INDEP mode, with one pod fore-and-aft and the other across, the cross pod is held back and the dial reads SPLIT.',
  },
  {
    id: 'pod-shared-power', track: 'azipod', fam: ['pod'], ships: TWIN, review: 'draft',
    title: 'Pods and thrusters share one switchboard',
    brief: 'Full bow thruster and full pods together exceed the switchboard: expect a power limit on the dials.',
    why: 'The ship\'s electrical power is not enough to run the pods and the bow thrusters all at full power together.',
    real: [
      { text: 'The ship\'s electrical power is not sufficient to supply both the pods and the bow thrusters operating all together at full power, so the handler has to remember that the pods\' whole power is not available while the thrusters run at maximum.', src: ['striga-impa'], conf: 'published' },
    ],
    sim: 'She has {avail} MW on the switchboard for pods and thrusters together. The dials read PWR LIMIT when it runs short.',
    tip: { when: 'power-limited', hold: 3, cool: 90, prio: 2 },
  },
  {
    id: 'pod-bow-first', track: 'azipod', fam: ['pod'], ships: TWIN, review: 'draft',
    title: 'Set the bow first, then the stern',
    brief: 'The pods are far stronger than the bow thruster: adjust the bow\'s position before the stern\'s.',
    why: 'The pilots\' memento asks the handler to keep the difference in power in mind and to position the bow before the stern.',
    real: [
      { text: 'The pods\' efficiency is considerably bigger than the bow thrusters\': the handler has to keep the difference in power in mind to adjust the position of the bow before the position of the stern.', src: ['striga-impa'], conf: 'published' },
    ],
    sim: 'Her bow thruster gives {btT} t of thrust against {podT} t of bollard pull from each pod.',
  },
  {
    id: 'pod-outlines', track: 'azipod', fam: ['pod'], ships: TWIN, review: 'draft',
    title: 'The dashed outlines: what the joystick would do',
    brief: 'With VECTORS on and INDEP selected, dashed outlines show the pod and thruster settings the joystick would use.',
    why: 'They aim to close the quay at the guideline speed and hold her parallel. Neutral is both pods pulling inward against each other.',
    real: [],
    sim: 'This is the joystick allocator\'s answer for a simple docking rule of this model\'s own (both ends of the hull closing at the guideline speed), not a published procedure. Within range of a quay and with a berth chosen, drag each dial, lever and the thruster onto its outline.',
  },
  {
    id: 'pod-closing-speed', track: 'azipod', fam: ['pod'], review: 'draft',
    title: 'Closing speed: half the distance',
    brief: 'Sideways closing speed in cm/s: about half the distance to the berth in metres.',
    why: 'It comes from an analysis of 47 VLCC berthings, whose manoeuvres fell into three types: efficient, prudent and unstable.',
    real: [
      { text: 'From 47 observed VLCC berthings: the approach speed of berthing (in cm/s) is conveniently half of the distance (in m) between the ship and the berth. Berthing speeds varied widely and depended strongly on who handled the ship. (Abstract only; the paper is in Japanese.)', src: ['ishihata-1988'], conf: 'measured' },
    ],
    sim: 'The guideline on the quay distances is the lower of that rule and this simulator\'s own approach-speed limit for her displacement. It is never set below a floor she can hold.',
    tip: { when: 'closing-fast', hold: 2, cool: 60, prio: 2 },
  },
];

export const AZIPOD: Content = { cards: CARDS, procedures: [], exercises: [] };
