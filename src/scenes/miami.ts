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
