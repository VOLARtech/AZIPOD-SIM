// Numbers in guide text are {tokens}, so every figure shown is the ship's own particular or a published
// figure and cannot drift from the model. fill() resolves them for one ship.
import { DEG } from '../physics/consts';
import { PUBLISHED } from '../physics/validation';
import type { ShipSpec } from '../physics/ship';

const num = (x: number, d = 0) => String(+x.toFixed(d));

/** Particulars of the ship in use. */
const SPEC: Record<string, (s: ShipSpec) => string> = {
  L: s => num(s.L),
  B: s => num(s.B, 1),
  T: s => num(s.T, 1),
  /** Reverse order is ignored above this share of full rpm [%]. */
  rev: s => num(s.revInterlock * 100),
  /** Astern rpm limit [% of ahead maximum]. */
  astern: s => num(s.asternMax * 100),
  /** Pod slew rate [°/s]. */
  slew: s => num(s.podSlew / DEG, 1),
  /** Seconds from zero to full pod rpm, and from full ahead to full astern. */
  rpmTime: s => num(s.podRpmTime),
  rpmReverse: s => num(2 * s.podRpmTime),
  /** Seconds for a pod to swing half a turn. */
  slew180: s => num(180 / (s.podSlew / DEG)),
  /** Electrical power for pods and thrusters together [MW]. */
  avail: s => num(s.powerAvail / 1e6, 1),
  /** Bollard thrust of the bow thruster and of one pod [t]. */
  btT: s => num(s.bowThruster.Tmax / 9.81e3),
  podT: s => num(s.pods[0].Tb / 9.81e3),
};

/** Published stopping distances for the Azipod model tests, in ship lengths: {pub.swing180}. */
const PUB: Record<string, string> = Object.fromEntries(PUBLISHED.map(p => [`pub.${p.key}`, p.sd.toFixed(1)]));

const TOKEN = /\{([A-Za-z][\w.]*)\}/g;

/** Names of the tokens a text uses. */
export function tokensIn(text: string): string[] {
  return [...text.matchAll(TOKEN)].map(m => m[1]);
}

export const isToken = (name: string) => name in SPEC || name in PUB;

/** The text with its tokens resolved for this ship; unknown tokens are left as written. */
export function fill(text: string, spec: ShipSpec): string {
  return text.replace(TOKEN, (whole, name: string) => (name in PUB ? PUB[name] : name in SPEC ? SPEC[name](spec) : whole));
}

/** The text with its tokens removed, for scanning the words around them. */
export const stripTokens = (text: string) => text.replace(TOKEN, '');
