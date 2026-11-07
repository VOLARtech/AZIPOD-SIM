// Tugs: working with the assist tugs a ship calls (every ship can be given tugs), and handling a tug as
// the own ship (ASD, Voith tractor, rotor tug), with the escort and the girting hazard.
// Statements about the real world are in `real`, each with its sources; `sim` says what this simulator's
// model does. See docs/TRAINING.md.
import type { Card, Content, Exercise, Fam } from '../types';

const OWN: Fam[] = ['asd', 'vsp', 'rotor'];
const ALL: Fam[] = ['pod', 'twostroke', 'cpp', 'jet', 'dp', ...OWN];

const CARDS: Card[] = [
  {
    id: 'tug-orders', track: 'tugs', fam: ALL, review: 'draft',
    title: 'Order a tug: place, action, power',
    brief: 'Give each order as the tug\'s place, then push or pull, then power: "Tug forward, push, half."',
    why: 'Standard orders name the tug\'s position first (numbered from forward to aft once there are three or more), then the action and the power.',
    real: [
      { text: 'Each order is preceded by the tug\'s position: Tug Forward or Tug Aft for two tugs, numbered from forward to aft for three or more. PUSH and LIFT OFF (pull) act at 90° to the ship\'s fore-and-aft line unless the pilot asks for another angle.', src: ['flinders-tug-orders'], conf: 'published' },
      { text: 'Powers: MINIMUM (5 % or less of the tug\'s power where possible), QUARTER, HALF, THREE QUARTERS, FULL, and MAXIMUM for emergencies only. STOP, NO WEIGHT and OFF THE HULL are modes that keep the tug in place without changing the ship\'s movement.', src: ['flinders-tug-orders'], conf: 'published' },
      { text: 'In Japan, the USA (Los Angeles and Long Beach) and Sri Lanka tug orders follow one sequence: motion (push or pull), engine power, then direction. They are agreed locally and are not globally standardized; the authors propose standard orders in the IMO Standard Marine Communication Phrases.', src: ['ishikura-2013'], conf: 'published' },
      { text: 'Masters and pilots always give standard position, direction and weight orders, with the weight in percentages and the tugs numbered from fore to aft.', src: ['mhpa-towage-2021'], conf: 'published' },
      { text: 'The competence standard for ship-assist towage asks masters to use standard protocols or instructions for power and direction, to appreciate the importance of locally agreed terminology, and to identify and establish communications with multiple tugs.', src: ['mgn468-annex2'], conf: 'published' },
    ],
    sim: 'In the TUGS panel each tug (TUG FWD and TUG AFT) has a slider from full pull through STOP to full push in quarters, the standard powers.',
  },
  {
    id: 'tug-delay', track: 'tugs', fam: ALL, review: 'draft',
    title: 'Order early: tugs need time to change position',
    brief: 'Order a tug before you need it: changing position takes seconds, and longer from push to pull.',
    why: 'The delay grows when the tug changes drastically, when its line is long and when the ship is moving, even slowly.',
    real: [
      { text: 'Bridge video and AIS from tugs in Tokyo and Yokohama (2011 to 2012) showed tugs taking 5 to over 10 s on average to change position after an order. The delay was longer for a drastic change (push to pull or the reverse), for a long line, and with the ship moving, even very slowly. The authors advise giving orders in anticipation of it.', src: ['ishikura-2013'], conf: 'measured' },
    ],
    sim: 'Here a tug takes about twenty seconds to build up its pull and over a minute to swap from pushing to pulling: slower than the real ones, so order even earlier.',
  },
  {
    id: 'tug-speed', track: 'tugs', fam: ALL, review: 'draft',
    title: 'Tugs work best when she is slow',
    brief: 'Slow her before you ask for the tugs: speed through the water decides whether they can work.',
    why: 'Interaction grows with speed, and alongside the tugs are most effective at minimal speed.',
    real: [
      { text: 'Speed through the water is what counts when a tug makes fast or lets go: 5 to 8 kn is generally accepted for the Svitzer tugs in Milford Haven; a smaller tug\'s safe speed may be lower, to be agreed by tug master, ship master and pilot. Interaction grows with speed. Tugs made fast alongside are most effective at minimal speed, and in strong tide much of a tug\'s power goes on holding position.', src: ['mhpa-towage-2021'], conf: 'published' },
      { text: 'A ship\'s rudder efficiency rises roughly with the square of her speed, so her steering falls off quickly as she slows. Depending on the ship, wind and current, assistance may be needed at relatively high speeds, as much as 6 to 8 kn.', src: ['jurgens-voith'], conf: 'published' },
    ],
    sim: 'In this model a tug\'s pull falls away as the ship speeds up and is gone above about six knots.',
    tip: { when: 'tugs-too-fast', hold: 2, cool: 60, prio: 2 },
  },
  {
    id: 'tug-coanda', track: 'tugs', fam: ALL, review: 'draft',
    title: 'Short line, little water: the wash cancels it',
    brief: 'On a short line against a blunt side with little water under her, the tug\'s own wash can cancel its pull.',
    why: 'The wash has little room to escape under the hull, hits the ship\'s side and almost cancels the pull. More line gives it room to die away.',
    real: [
      { text: 'The Coanda effect can occur when a tug pulls at almost right angles to the ship on a very short towline and the ship has limited under-keel clearance. The tug\'s wash, with restricted water to escape under the hull, hits the ship\'s blunt side and makes a force that almost cancels the pull. A greater length of towline gives the wash more sea room to dissipate.', src: ['mhpa-towage-2021'], conf: 'published' },
    ],
    sim: 'This model does not include this effect.',
  },
  {
    id: 'tug-escort', track: 'tugs', fam: OWN, review: 'draft',
    title: 'Escort: steer by the hull, not just the thrust',
    brief: 'Escorting is steering or braking a ship by towline at speed, in indirect mode: your hull makes the force.',
    why: 'Indirect towing uses the hydrodynamic force on the tug\'s underwater hull, so the pull on the ship is much more than the thrust.',
    real: [
      { text: 'Escorting is not any tug connected to a moving ship: with no force on the ship and under about 6 kn it is ship-assist. An escort tug gives steering or braking force through a towline at speeds over 6 kn, usually in indirect mode: lift and drag from the hull and skeg make the towline tension while the drives hold position. Rated escort speed is typically 8 or 10 kn.', src: ['ral-escort'], conf: 'published' },
      { text: 'An escort tug is described by four things: its rated escort speed, its maximum steering and braking performance (the escort butterfly diagram), its maximum allowable heel angle in indirect escort, and its towing system load rating.', src: ['ral-escort'], conf: 'published' },
      { text: 'A model study of an ASD tug in indirect towing (analytical, still to be validated against real hulls) found the effective towing force much higher than the thruster force, the ratio depending on the hull drift angle, the thruster angle and the escort speed. The author offers the charts as rough guidance for tug masters.', src: ['artyszuk-2014'], conf: 'published' },
      { text: 'For escort duties the optimum speed for the tug to be effective is 8 to 10 kn.', src: ['mhpa-towage-2021'], conf: 'published' },
    ],
    sim: 'The escort scenario puts you on a line to a laden VLCC at speed. The console shows the line\'s steering and braking pull in tonnes, its lead, and your heel.',
  },
  {
    id: 'tug-girting', track: 'tugs', fam: OWN, review: 'draft',
    title: 'Girting: release the line',
    brief: 'A line leading across the tug can pull it over: if you suspect girting, release the towline at once.',
    why: 'Girting happens when the pull comes at a right angle to the tug and overcomes its righting ability.',
    real: [
      { text: 'Girting happens when a towline comes at a right angle to the tug and the force is strong enough to overcome the tug\'s righting ability: the tug is pulled through the water by its tow, up to deck-edge immersion, flooding and capsize. Where girting is suspected or about to happen the towline must be released immediately.', src: ['mhpa-towage-2021'], conf: 'published' },
      { text: 'Modern tugs have a substantial towline lead at the bow or near the stern to make girting less likely. Older conventional tugs towing from a hook amidships must use a gog together with emergency quick-release equipment.', src: ['mhpa-towage-2021'], conf: 'published' },
      { text: 'In the Ijsselstroom accident (2009) a conventional tug towing over its stern without a bridle, and steering by differential engine power, could not control its yaw as the lead tug sped up. It sheered, girted and capsized five minutes after connecting. For a conventional tug, towing over the stern while running astern is inherently unstable, and the tow speed was too high.', src: ['maib-ijsselstroom'], conf: 'published' },
      { text: 'Forces in tethered escort work can exceed the tug\'s stability or towing-equipment limits and cause a sudden capsize or equipment failure. A towline at up to 45° to the ship can put 140 % of the tug\'s bollard pull on the deck fitting.', src: ['ral-escort'], conf: 'published' },
    ],
    sim: 'The model heels the tug as the line pulls across it and the heel gauge shows the deck-edge angle. RELEASE lets the line go.',
    tip: { when: 'girting-risk', hold: 0.5, cool: 30, prio: 3 },
  },
  {
    id: 'tug-asd', track: 'tugs', fam: ['asd', 'rotor'], review: 'draft',
    title: 'ASD tug: drives aft, towing point forward',
    brief: 'An ASD tug has its azimuth drives aft and its towing point forward, so it works with its bow.',
    why: 'Both drives can work together as one unit of twice the power, which is how the escort study treats them.',
    real: [
      { text: 'An ASD tug has its directional propulsion aft and its towing point forward. Most are azimuthing (podded or Z-drive) units, mainly two drives mounted symmetrically. A tractor tug, with its drives forward, assists by its stern in much the same way as an ASD tug does through its bow.', src: ['artyszuk-2014'], conf: 'published' },
      { text: 'The ship-assist competence standard covers picking up bow to bow with an ASD tug and the dangers of interaction when working close to large ships, especially bow to bow with ASD and azimuth tractor tugs.', src: ['mgn468-annex2'], conf: 'published' },
    ],
    sim: 'Each drive has a combi-lever: the lever\'s direction is the direction of thrust and its distance from the centre is the power, with a dead hub in the middle.',
  },
  {
    id: 'tug-vsp', track: 'tugs', fam: ['vsp'], review: 'draft',
    title: 'Voith tractor: thrust steered any way',
    brief: 'A Voith tractor steers its thrust any way with its units forward, and works from its stern.',
    why: 'The two Voith Schneider units, the guard plate and the aft fin all give hydrodynamic lift.',
    real: [
      { text: 'The Voith Schneider propeller can steer its thrust in any direction steplessly. The Voith Water Tractor has a comparatively flat hull, two such units in the bow section under a guard plate, and a stabilising fin aft with the towing gear above it. The units, guard and fin are hydrodynamically active.', src: ['jurgens-voith'], conf: 'published' },
      { text: 'It can work in direct and indirect modes and so assist a ship over a wide range of speeds; the fin improves its indirect capability at lower speeds.', src: ['jurgens-voith'], conf: 'published' },
    ],
    sim: 'The pad sets each unit\'s direction of thrust and how much of it.',
  },
];

const EXERCISES: Exercise[] = [
  {
    id: 'ex-tug-escort', track: 'tugs', fam: OWN, review: 'draft',
    title: 'Escort a laden VLCC',
    brief: 'Steer a laden VLCC at speed on your line in indirect mode, and keep your heel under the deck edge.',
    scenario: 'escort', ship: 'asd-tug', begin: 'start', end: 'time', limit: 420,
    objectives: ['Work out to her quarter and steer her with the line in indirect mode.', 'Keep your heel well under the deck edge.', 'When her rudder jams, stop her swing.', 'If you are girting or about to, release the line.'],
    metrics: ['heel', 'tension', 'released', 'swing'],
    real: [
      { text: 'Where girting is suspected or about to happen the towline must be released immediately.', src: ['mhpa-towage-2021'], conf: 'published' },
      { text: 'An escort tug has a maximum allowable heel angle in indirect escort and a towing system load rating that limits the line tension.', src: ['ral-escort'], conf: 'published' },
    ],
  },
  {
    id: 'ex-tug-assist', track: 'tugs', fam: ALL, review: 'draft',
    title: 'Alongside with the tugs',
    brief: 'Bring a Spirit-class ship alongside at Quai 27 and work the two tugs: slow her first, then use them.',
    scenario: 'quai27', ship: 'spirit', begin: 'start', end: 'landed', limit: 1500,
    objectives: ['Slow her before you call the tugs.', 'Order each tug by place, action and power.', 'Land gently on the fenders.'],
    metrics: ['tugspeed', 'landing', 'closing', 'time'],
    real: [
      { text: 'Speed through the water is what counts when a tug makes fast or lets go: 5 to 8 kn is generally accepted for the Svitzer tugs in Milford Haven; tugs made fast alongside are most effective at minimal speed.', src: ['mhpa-towage-2021'], conf: 'published' },
    ],
  },
];

export const TUGS: Content = { cards: CARDS, procedures: [], exercises: EXERCISES };
