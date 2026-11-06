// PortMiami and its approaches, from NOAA ENC cells (S-57, public domain) built by tools/chart/build_region.py
// into the area pack (scenes/miami/): depths at 10 m in the harbour and 40 m out to the sea buoy, quays,
// every berth face fitted out, the chart with its buoys and lights. Simulation only, not for navigation.

export const MIAMI = {
  id: 'miami-terminal-v', name: 'PortMiami · Terminal V, starboard side to',
  brief: 'Real chart: NOAA ENC harbour cells. Come up the Main Channel past Berths 1–9 at 5 kn, swing in the turning basin at the west end and back her down onto Terminal V, starboard side to, bow to the basin. The dredged berth carries 10.0 m (MLLW), tide +0.3 m; the water shoals fast south of the berth and outside the channel. 15 kn easterly trade wind on the quarter, weak flood. Two 70 t tugs on the port side.',
  ship: 'spirit',
  start: { n: 17, e: 300, psi: 295, kn: 5 },
  windKn: 15, windFrom: 95, gusts: true, currentKn: 0.3, currentSet: 290, depth: 12,
  shoals: [], obstacles: [], fenders: [], bollards: [],
  mooringSide: 1 as const, tugSide: -1 as const, tugBP: 686e3,
  landHeight: 2.5, zoom: 0.45,
  chart: 'miami', area: 'miami', tide: 0.3,
  // Terminal V (Virgin Voyages): Berth H(V), starboard side to, bow to the turning basin
  berthRef: { match: /H\(V\)/, side: 1 as const, along: 146 },     // stern just inside the dredged pocket, bow over the basin
  needsData: true,
};

const area = { shoals: [], obstacles: [], fenders: [], bollards: [], landHeight: 2.5, chart: 'miami', area: 'miami', tide: 0.3, needsData: true, depth: 12 };

/** From the sea buoy in through Government Cut to the cruise berths on the Main Channel. */
export const MIAMI_APPROACH = {
  ...area,
  id: 'miami-approach', name: 'PortMiami · from the sea buoy to Berth 4',
  brief: 'Real chart: NOAA ENC. Pick up the Government Cut range a mile outside the jetties at 8 kn and bring the 293 m Spirit in along it: the channel narrows between the jetties, the trade wind sets you north across it and the flood runs in with you. Inside, ease down past Fisher Island and the turning basin and lie starboard side to at Berth 4 on the north side of Dodge Island. 18 kn easterly, flood 0.8 kn, tide +0.3 m. Two 70 t tugs on the port side once inside.',
  ship: 'spirit',
  start: { n: -1950, e: 8100, psi: 268, kn: 8 },
  windKn: 18, windFrom: 90, gusts: true, currentKn: 0.8, currentSet: 275,
  mooringSide: 1 as const, tugSide: -1 as const, tugBP: 686e3, zoom: 0.25,
  berthRef: { match: /^Port of Miami · Berth 4\b/, side: 1 as const },
};
/** A container ship to the cargo terminal on Fisherman's Channel, south of Dodge Island. */
export const MIAMI_CARGO = {
  ...area,
  id: 'miami-cargo', name: "PortMiami · container ship to Fisherman's Channel",
  brief: "Real chart: NOAA ENC. A 3600 TEU container ship (KCS hull, 10.8 m) bound for the container terminal on the south side of Dodge Island. Come in by Government Cut, turn south of Fisher Island into Fisherman's Channel and lie port side to at the first container berth that takes her. The channel is narrow and the flats outside it dry: hold the middle. 15 kn easterly, flood 0.5 kn, tide +0.3 m. Two 70 t tugs.",
  ship: 'kcs',
  start: { n: -2000, e: 4750, psi: 292, kn: 6 },
  windKn: 15, windFrom: 100, gusts: true, currentKn: 0.5, currentSet: 275,
  mooringSide: -1 as const, tugSide: 1 as const, tugBP: 686e3, zoom: 0.35,
  berthRef: { near: [-560, -300] as [number, number], side: -1 as const },
};
