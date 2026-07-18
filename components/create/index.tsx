// CREATE lane — "list your own résumé as a market".
// Phase C owns identity and mounting; it should only need CreateSheet.

export { CreateSheet, type CreateSheetProps } from './CreateSheet';
export {
  RandomizeButton,
  freshResume,
  type RandomizeButtonProps,
} from './RandomizeButton';
export { RealLarpToggle, type RealLarpToggleProps } from './RealLarpToggle';
export {
  randomResume,
  randomTitle,
  randomBullets,
  randomAskingTc,
  parseAskingTc,
  makeRng,
  BUZZWORDS,
  TITLE_NOUNS,
  TITLE_SUFFIXES,
  SENIORITY_PREFIX,
  SENIORITY_HEAD_OF,
  REAL_BULLETS,
  LARP_BULLETS,
  type Resume,
  type Flavor,
  type Rng,
} from './wordlists';
