// Specialised propulsion: waterjets, direct-reversing two-stroke engines on a telegraph, and DP.
// (Pitch-lever and twin-screw ships have no cards of their own yet: no source was found for them, see
// docs/TRAINING.md. The thruster and IMO cards in common.ts speak to them.)
// Statements about the real world are in `real`, each with its sources; `sim` says what this simulator's
// model does, and the tests in scripts/guide-test.ts check every such note against the model.
import type { Card, Content, Exercise, Procedure } from '../types';

const CARDS: Card[] = [
  {
    id: 'jet-controls', track: 'special', fam: ['jet'], review: 'draft',
    title: 'Waterjet: nozzle steers, bucket brakes',
    brief: 'Steering and ahead-or-astern are separate controls: she can be turned without moving along.',
    why: 'The nozzle turns the jet and the reverse deflector (the bucket) sets ahead, zero or astern; neither changes the engine\'s direction.',
    real: [
      { text: 'Waterjet thrust does not depend on boat speed: it is set by the input power and the astern deflector position and is there even at zero speed. So the boat can be turned without moving ahead or astern, and moving the reverse deflector slightly either side of the zero-speed position gives very fine ahead or astern control with full steering.', src: ['hamiltonjet-hj'], conf: 'published' },
      { text: 'No change of engine rotation is needed to go astern: from full forward to full reverse thrust the reverse duct only moves from fully up to fully down. Steering and ahead-astern are separate and have independent effects, so they can be combined for complex manoeuvres without complex control inputs.', src: ['hamiltonjet-hj'], conf: 'published' },
    ],
    sim: 'In the model the bucket goes from ahead through zero thrust to astern, the nozzle turns the jet up to {nozzle}° either way, and the impeller always turns the same way.',
  },
  {
    id: 'jet-astern', track: 'special', fam: ['jet'], review: 'draft',
    title: 'Waterjet astern: smooth, but weaker than ahead',
    brief: 'The bucket gives a smooth, powerful stop, but astern thrust is only part of ahead thrust.',
    why: 'The reversed flow is vectored away from the intake, so astern thrust holds up at high throttle, though it is less than ahead.',
    real: [
      { text: 'The split-duct reverse deflector gives astern thrust equivalent to up to 60 % of ahead thrust, maintainable up to high throttle settings; vectoring the astern thrust away from the jet intake avoids recirculation.', src: ['hamiltonjet-hj'], conf: 'published' },
      { text: 'The shift from full ahead to full astern is smooth as the deflector is lowered through the jetstream, eliminating the delay or shock loading normally associated with propeller and gearbox drives, and gives a powerful braking function for emergencies.', src: ['hamiltonjet-hj'], conf: 'published' },
    ],
    sim: 'For the same engine power the model\'s full-astern bucket gives about six-tenths of the ahead thrust. With the buckets down she stops within a couple of ship lengths; with the buckets up and the engines idling she coasts for minutes.',
  },
  {
    id: 'jet-sideways', track: 'special', fam: ['jet'], review: 'draft',
    title: 'Several jets can walk her sideways',
    brief: 'With two or more jets, the right mix of nozzle and bucket pushes her sideways without a thruster.',
    why: 'At the zero-speed bucket position the ahead and astern thrusts balance, so thrust vectoring alone can move her sideways.',
    real: [
      { text: 'Sideways thrust is possible with two or more jets (with split-duct reverse deflectors) without the need for a bow thruster. At the intermediate zero-speed deflector position ahead and astern thrusts are equalised to hold the craft on station, with steering still available for rotational control.', src: ['hamiltonjet-hj'], conf: 'published' },
      { text: 'Infinitely variable adjustment either side of the zero-speed position lets the craft be crept ahead or astern, and in multiple-jet installations appropriate thrust vectoring alone can be used to induce true sideways movement.', src: ['hamiltonjet-hj'], conf: 'published' },
    ],
    sim: 'The fast ferry\'s joystick works this way: it sets the nozzles and buckets for the sideways force, takes the turning moment out with the bow thruster and by running the port and starboard jets differentially, and scales the demand down when it is beyond the jets.',
  },
  {
    id: 'ts-reverse', track: 'special', fam: ['twostroke'], review: 'draft',
    title: 'Crash astern: wait for the shaft to slow',
    brief: 'A direct-reversing engine can only start astern once the shaft has slowed: order astern early.',
    why: 'Stopping the fuel leaves the propeller turning the engine. Starting air then brakes the shaft and, at zero rpm, the astern start is given.',
    real: [
      { text: 'Crash manoeuvring turns the main engine the other way to take the ship\'s way off. Tell the engine room and change the controls over to the engine room; give astern on the telegraph and have it acknowledged (the starting-air cam comes round astern only after that).', src: ['marinesite-crash'], conf: 'rule' },
      { text: 'Once the rpm drops below 40 % of MCR, give brake air in the astern direction, a few times in a short time. When the rpm is zero the fuel cam comes round astern; give the start kick with the fuel lever at minimum.', src: ['marinesite-crash'], conf: 'rule' },
      { text: 'Putting the telegraph from full ahead to stop does not stop the engine at once: the load programme brings the rpm down over time.', src: ['marinesite-crash'], conf: 'rule' },
      { text: 'In a full astern crash stop the track reach (measured along the path) should generally not exceed 15 ship lengths. For low-powered large-displacement vessels this may be modified, but in no case should exceed 20 ship lengths, subject to special consideration and approval.', src: ['imo-msc137'], conf: 'published' },
    ],
    sim: 'The model cuts the fuel the moment you order stop or astern (no load programme), waits until the shaft is down to {brakeN} % of full rpm, then starts on air; the {camshaft} s camshaft change runs during the wait. The console reads REVERSING, WAITING · SHAFT TOO FAST, STARTING ASTERN.',
    tip: { when: 'astern-waiting', hold: 3, cool: 120, prio: 2 },
  },
  {
    id: 'dp-classes', track: 'special', fam: ['dp'], review: 'draft',
    title: 'DP equipment classes 1, 2 and 3',
    brief: 'Class 1 can lose position on one fault; class 2 should not; class 3 also survives fire or flood.',
    why: 'Class 2 has redundancy so no single fault in an active system fails the system; class 3 also withstands fire or flood in any one compartment.',
    real: [
      { text: 'The DP equipment classes the classification societies use are based on IMO MSC/Circ.645 (1994). Class 1 has no redundancy: loss of position may occur on a single fault.', src: ['wikipedia-dp'], conf: 'rule' },
      { text: 'Class 2 has redundancy so that no single fault in an active system will cause the system to fail: loss of position should not occur from a single fault of an active component such as a generator, thruster or switchboard, but may after failure of a static component such as a cable or pipe.', src: ['wikipedia-dp'], conf: 'rule' },
      { text: 'Class 3 also has to withstand fire or flood in any one compartment without the system failing: loss of position should not occur from any single failure, including a completely burnt fire subdivision or flooded watertight compartment.', src: ['wikipedia-dp'], conf: 'rule' },
      { text: 'For classes 2 and 3 a consequence analysis should be built into the system to help the operator judge whether enough generators and thrusters are online for the failure of one not to mean a loss of position. If a fault takes away that redundancy and cannot be resolved at once, the operation should be abandoned as quickly as possible.', src: ['wikipedia-dp'], conf: 'rule' },
    ],
    sim: 'The supply vessel and the anchor-handling tug are DP2 ships. The console\'s consequence line names a unit whose loss the present demand would not survive; its Instructor row trips a unit, blacks out the board or drifts a reference; the capability plot shows what she can hold intact and with the worst failure.',
  },
];

const PROCEDURES: Procedure[] = [
  {
    id: 'ts-crash-astern', track: 'special', fam: ['twostroke'], review: 'draft', minKn: 4,
    title: 'Crash astern: direct-reversing engine',
    brief: 'Take the way off by reversing the engine: order astern, wait for the shaft to slow, let it start on air.',
    steps: [
      { id: 'note', text: 'Note your heading and check the water ahead: a big ship takes many lengths to stop.', check: 'ack' },
      { id: 'order', text: 'Order full astern on the telegraph.', check: 'telegraph-astern' },
      { id: 'wait', text: 'Wait: with way on, the engine will not start astern until the shaft has slowed.', check: 'engine-waiting' },
      { id: 'start', text: 'Watch the engine start on air astern; the START AIR row counts the starts left.', check: 'astern-started' },
      { id: 'straight', text: 'Steer with the rudder while she slows, and watch the heading, until the way is off her.', check: 'stopped' },
      { id: 'clear', text: 'Way off her: telegraph to STOP.', check: 'pods-idle' },
    ],
    real: [
      { text: 'Crash manoeuvring: astern on the telegraph, acknowledged by the engine room; brake air in the astern direction once the rpm is below 40 % of MCR; the start kick at zero rpm. The IMO criterion for the track reach is under 15 ship lengths.', src: ['marinesite-crash', 'imo-msc137'], conf: 'rule' },
    ],
    sim: 'In the model every direct-reversing ship starts astern once the shaft is down to the same share of full rpm, after a wait that depends on her speed and on how fast the propeller slows, and stops inside the IMO limit.',
    proof: 'ts-crash-astern',
  },
  {
    id: 'jet-stop', track: 'special', fam: ['jet'], review: 'draft', minKn: 6,
    title: 'Stop a waterjet ship with the buckets',
    brief: 'Take the way off with the buckets down and the throttle up, then hold her on the zero-thrust bucket.',
    steps: [
      { id: 'note', text: 'Note your heading and check the water ahead.', check: 'ack' },
      { id: 'down', text: 'Drop the buckets: the engines keep turning the same way, the deflector does the reversing.', check: 'buckets-down' },
      { id: 'throttle', text: 'Raise the throttle for astern thrust, which is less than ahead thrust.', check: 'astern-throttle' },
      { id: 'steer', text: 'Use the nozzles to hold her heading while she slows: steering works at every bucket position.', check: 'ack' },
      { id: 'stopped', text: 'Wait until she has stopped.', check: 'stopped' },
      { id: 'hold', text: 'Bring the buckets to their zero-thrust position, which holds her on station, and ease the throttle.', check: 'bucket-zero' },
    ],
    real: [
      { text: 'Reverse thrust needs no change of engine rotation: the reverse duct moves from fully up to fully down. Astern thrust is up to 60 % of ahead thrust and the smooth shift gives a powerful braking function for emergencies. At the zero-speed position the thrusts balance and the craft holds station; independent steering is available at every position.', src: ['hamiltonjet-hj'], conf: 'published' },
    ],
    sim: 'In the model the stop is quick and straight: buckets down and throttle up take the way off within a couple of ship lengths, where with the buckets up and the engines idling she would coast on for minutes.',
    proof: 'jet-stop',
  },
];

const EXERCISES: Exercise[] = [
  {
    id: 'ex-ts-crash', track: 'special', fam: ['twostroke'], review: 'draft',
    title: 'Crash stop the VLCC',
    brief: 'Take the way off a laden VLCC from sea speed by reversing the engine, then compare with the IMO limit.',
    scenario: 'trials', ship: 'kvlcc2', kn: 14, begin: 'order', end: 'stopped', limit: 1500,
    objectives: ['Order full astern from sea speed in open water.', 'Watch the engine room messages: it starts astern only once the shaft has slowed.', 'Steer with the rudder while she slows, and watch the heading.'],
    metrics: ['reachimo', 'astern', 'time', 'turned'],
    real: [{ text: 'In a full astern crash stop the track reach (measured along the path) should generally not exceed 15 ship lengths. For low-powered large-displacement vessels this may be modified, but in no case should exceed 20 ship lengths, subject to special consideration and approval.', src: ['imo-msc137'], conf: 'published' }],
  },
  {
    id: 'ex-jet-quay', track: 'special', fam: ['jet'], review: 'draft',
    title: 'Fast ferry alongside',
    brief: 'Bring the fast ferry in from sea and berth her on the jets, creeping in on the buckets.',
    scenario: 'hsc', ship: 'hsc-cat', begin: 'start', end: 'landed', limit: 1200,
    objectives: ['Come off the power in time to be inside the harbour speed limit at the breakwater.', 'Berth port side to on the ferry quay with the buckets and nozzles, or the joystick.', 'Land gently on the fenders.'],
    metrics: ['landing', 'fender', 'closing', 'time'],
    real: [{ text: 'Infinitely variable adjustment either side of the zero-speed deflector position lets the craft be crept ahead or astern, and in multiple-jet installations appropriate thrust vectoring alone can be used to induce true sideways movement.', src: ['hamiltonjet-hj'], conf: 'published' }],
  },
  {
    id: 'ex-dp-hold', track: 'special', fam: ['dp'], review: 'draft',
    title: 'Hold position on DP through a fault',
    brief: 'Hold the supply vessel on her set point while a unit trips and the references drift.',
    scenario: 'dp', ship: 'psv', begin: 'start', end: 'time', limit: 600,
    objectives: ['Take her in on the joystick, then select auto position off the platform.', 'Watch the consequence line and the capability plot when the first unit trips.', 'Notice when both DGNSS references drift together, and decide which reference to trust.'],
    metrics: ['dperr', 'dpshown', 'dputil', 'dplimit'],
    real: [{ text: 'Class 2 has redundancy so that no single fault in an active system will cause the system to fail: loss of position should not occur from a single fault of an active component such as a generator, thruster or switchboard.', src: ['wikipedia-dp'], conf: 'rule' }],
  },
];

export const SPECIAL: Content = { cards: CARDS, procedures: PROCEDURES, exercises: EXERCISES };
