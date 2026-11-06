// The Ports of Los Angeles and Long Beach, from NOAA ENC cells (S-57, public domain) built by
// tools/chart/build_region.py into the area pack (scenes/lalb/): 10 m depths inside the breakwaters, 40 m out
// to the approach buoys, every wharf face fitted out, the crude jetty at Pier T laid out as a dolphin berth.
// Depths are below MLLW; the scenarios run at mid tide (+1.0 m). Simulation only, not for navigation.
import type { TrafficSetup } from '../physics/traffic';

const area = { shoals: [], obstacles: [], fenders: [], bollards: [], landHeight: 3, chart: 'lalb', area: 'lalb', tide: 1.0, needsData: true, depth: 18, tugBP: 80 * 9.81e3 };

export const LB_ULCV = {
  ...area,
  id: 'lb-ulcv', name: 'Los Angeles · 400 m ULCV to Pier 400',
  brief: "Real chart: NOAA ENC. A 400 m, 24 000 TEU container ship (16 m) inbound through Angels Gate to the deepest container terminal in the port, Pier 400. Pick up the approach channel at the Lighted Whistle Buoy 3, keep her slow through the 365 m gap in the San Pedro Breakwater, then turn east into the Pier 400 channel and lie port side to at Berth 404. At mid tide (+1.0 m MLLW) she has about 1.2 m under the keel at the berth. 12 kn westerly, weak ebb. Two 80 t tugs.",
  ship: 'ulcv',
  start: { n: -5200, e: -1600, psi: 340, kn: 6 },
  windKn: 12, windFrom: 270, gusts: true, currentKn: 0.3, currentSet: 200,
  mooringSide: -1 as const, tugSide: 1 as const, zoom: 0.22,
  berthRef: { match: /^Berth 404$/, side: -1 as const },
};
export const LB_VLCC = {
  ...area,
  id: 'lb-vlcc', name: 'Long Beach · laden VLCC to the crude jetty',
  brief: "Real chart: NOAA ENC. A fully laden VLCC (KVLCC2, 20.8 m) through Queen's Gate and up the Long Beach Main Channel, dredged to 76 ft (23 m) for ships like her, to the crude jetty at the tip of Pier T: four breasting dolphins, mooring dolphins set back, quick-release hooks. Take the way off a mile out (she carries it for ever), turn into the basin on the tugs and land flat at a few centimetres a second, port side to. 10 kn south-westerly, weak flood, mid tide. Two 80 t tugs on the starboard side.",
  ship: 'kvlcc2',
  start: { n: -3000, e: 4200, psi: 5, kn: 5 },
  windKn: 10, windFrom: 225, gusts: true, currentKn: 0.3, currentSet: 20,
  mooringSide: -1 as const, tugSide: 1 as const, zoom: 0.2,
  berthRef: { match: /T121/, side: -1 as const },
};
export const LA_CRUISE = {
  ...area,
  id: 'la-cruise', name: 'Los Angeles · World Cruise Center, port side to',
  brief: 'Real chart: NOAA ENC. Bring the 293 m Spirit in through Angels Gate and up the Los Angeles Main Channel past the Vincent Thomas Bridge approaches to the World Cruise Center at San Pedro, and lie port side to along Berths 89–92. The channel is busy and narrow above the outer harbour: keep to the middle and watch the wind set you onto the wharves. 14 kn westerly sea breeze, weak ebb, mid tide. Two 80 t tugs on the starboard side.',
  ship: 'spirit',
  start: { n: -2500, e: -2600, psi: 345, kn: 6 },
  windKn: 14, windFrom: 265, gusts: true, currentKn: 0.3, currentSet: 190,
  mooringSide: -1 as const, tugSide: 1 as const, zoom: 0.3,
  berthRef: { match: /Berths? (92|89)/, side: -1 as const },
};
const gateTraffic: TrafficSetup[] = [
  { ship: 'ulcv', label: 'OUTBOUND ULCV', start: { n: -2200, e: -2700, psi: 162, kn: 9 } },
  { ship: 'ropax', label: 'CATALINA FERRY', start: { n: -7800, e: -3300, psi: 20, kn: 18 } },
];
export const LALB_GATES = {
  ...area,
  id: 'lalb-gates', name: 'Angels Gate · inbound with traffic',
  brief: "Real chart: NOAA ENC. A 3600 TEU container ship (KCS hull) inbound for Angels Gate at 10 kn, with a 400 m container ship coming out through the gate and a fast ferry crossing from Catalina. Agree the passing early, keep to your side of the approach channel and slow down before the gap: the breakwater lights are Fl G 15s to starboard and Fl R 6s to port (IALA B: red right returning). 16 kn westerly. Turn up the Main Channel once inside.",
  ship: 'kcs',
  start: { n: -6200, e: -1100, psi: 340, kn: 10 },
  windKn: 16, windFrom: 275, gusts: true, currentKn: 0.4, currentSet: 150,
  zoom: 0.18, traffic: gateTraffic,
  berthRef: { near: [-600, -3100] as [number, number], side: -1 as const },
  mooringSide: -1 as const,
};
export const LALB_SCENARIOS = [LB_ULCV, LB_VLCC, LA_CRUISE, LALB_GATES];
