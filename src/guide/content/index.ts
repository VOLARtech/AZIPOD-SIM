// Everything the guide ships, in one place. Content is data: see docs/TRAINING.md for how it is built.
import type { Content } from '../types';
import { AZIPOD } from './azipod';
import { COMMON } from './common';
import { SPECIAL } from './propulsion';
import { TUGS } from './tugs';

const parts: Content[] = [COMMON, AZIPOD, TUGS, SPECIAL];
export const CONTENT: Content = {
  cards: parts.flatMap(p => p.cards),
  procedures: parts.flatMap(p => p.procedures),
  exercises: parts.flatMap(p => p.exercises),
};
