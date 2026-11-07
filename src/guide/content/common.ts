// Cards that speak to several kinds of ship: thrusters, and the IMO trial limits behind the Sea trials table.
// Statements about the real world are in `real`, each with its sources; `sim` says what this simulator's
// model does, and the tests in scripts/guide-test.ts check every such note against the model.
import { SHIPS } from '../../physics/ship';
import type { ShipSpec } from '../../physics/ship';
import { familyOf } from '../families';
import { FAMS } from '../types';
import type { Card, Content, Fam } from '../types';

const fams = (ships: ShipSpec[]): Fam[] => [...new Set(ships.map(familyOf))];
const all = Object.values(SHIPS);

/** Ships with a bow thruster, and ships with a stern thruster. */
const BOW = all.filter(s => s.bowThruster.Tmax > 0), STERN = all.filter(s => s.sternThruster);

const CARDS: Card[] = [
  {
    id: 'thruster-speed', track: 'special', fam: fams(BOW), ships: BOW.map(s => s.id), review: 'draft',
    title: 'Thrusters fade as she moves',
    brief: 'A bow thruster is for low speed: under way it loses about half its push.',
    why: 'The oncoming flow bends the thruster\'s jet, which changes the side force and the yawing moment on the hull.',
    real: [
      { text: 'Model tests: the effectiveness of a side thruster diminishes with forward speed. Side force fell to about 50 % as speed rose from zero to about 3 or 4 kn, and above that stayed almost constant or improved a little.', src: ['kijima-1975'], conf: 'measured' },
      { text: 'The authors name the bending and diffusion of the jet by the oncoming flow as the most important factor, and suggest that a reduced-pressure region between the hull and the jet ceases to exist at about 3 or 4 kn.', src: ['kijima-1975'], conf: 'measured' },
    ],
    sim: 'At {thrKn} kn the model leaves a tunnel thruster {thrLeft} % of its push, and about half at any higher speed. The joystick and DP allocators plan with the same fall-off.',
  },
  {
    id: 'thruster-stern', track: 'special', fam: fams(STERN), ships: STERN.map(s => s.id), review: 'draft',
    title: 'Stern thrusters fade less than bow thrusters',
    brief: 'Model tests found a stern thruster loses less under way than a bow thruster, and in shallow water can gain.',
    why: 'Speed affects a stern thruster differently from a bow thruster; the authors explain the shallow-water rise by an analogy with jet-flap wings.',
    real: [
      { text: 'Model tests of a twin-screw ocean ferry (bow and stern thrusters) and of a tanker (stern thruster only): ship speed has a large influence on stern-thruster performance, very different from its influence on the bow thruster.', src: ['fujino-1978'], conf: 'measured' },
      { text: 'In deep water the forces from the stern thruster do not decrease as much as those from the bow thruster. In shallow water its lateral force increases with ship speed and may amount to several times the force at zero speed.', src: ['fujino-1978'], conf: 'measured' },
    ],
    sim: 'The model gives the stern thruster the same fall-off as the bow thruster, so it does not show this difference.',
  },
  {
    id: 'imo-trials', track: 'special', fam: [...FAMS], review: 'draft',
    title: 'The IMO limits behind the Sea trials table',
    brief: 'The Sea trials table grades her against the IMO limits for turning, course changing and stopping.',
    why: 'Turning circle, zig-zag and crash stop each test one thing: how she turns, how she checks a swing, how she answers the helm and how she stops.',
    real: [
      { text: 'From the IMO standards (MSC.137(76)), as summarised by ABS: tactical diameter under 5 ship lengths and advance under 4.5 in the turning circle; a first overshoot in the 10/10 zig-zag within a limit that depends on length over speed, and under 25° in the 20/20.', src: ['imo-msc137'], conf: 'published' },
      { text: 'The same standards: under 2.5 ship lengths travelled before a 10° change of heading, and track reach under 15 ship lengths in a full astern crash stop (20 for large, low-powered vessels).', src: ['imo-msc137'], conf: 'published' },
      { text: 'The standards apply to vessels with all types of steering and propulsion devices of 100 m in length and over, and to chemical and gas carriers regardless of length. They do not apply to high-speed craft as defined in the relevant Code.', src: ['imo-msc137'], conf: 'published' },
      { text: 'IMO A.601(15) recommends manoeuvring information on board as a pilot card (filled in by the master for the pilot on boarding), a wheelhouse poster (permanently displayed; performance may differ with environment, hull and loading) and a manoeuvring booklet.', src: ['imo-a601'], conf: 'published' },
    ],
    sim: 'The Sea trials section of the menu runs these tests on the ship in use and marks each against its limit. A ship the standards do not cover is shown the figures for comparison, not graded. The Pilot card · wheelhouse poster section is computed from this model.',
  },
];

export const COMMON: Content = { cards: CARDS, procedures: [], exercises: [] };
