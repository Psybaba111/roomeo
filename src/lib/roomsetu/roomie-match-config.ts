/**
 * Compatibility ("Vibe match") weights and rules. Tune here, not in the scoring code.
 * Bump `version` whenever a number changes so logged signals can be compared like-for-like.
 */
export type RoomieMatchConfig = {
  version: number;
  /** Per question id. 0 = ignored. Questions missing here count as 0. */
  weights: Record<string, number>;
  /**
   * Hard rule-outs: [question id, option a, option b]. If the two people picked a and b (either way round)
   * the pair is flagged and its score is capped at pairHardClashCap.
   */
  hardClashes: Array<[string, string, string]>;
  /** A flagged pair scores at most this (0–100). */
  pairHardClashCap: number;
  /** Room score is never more than this many points above the worst pair (the "worst-pair cap"). */
  worstPairMargin: number;
  /** "category" questions: similarity when the answers differ. */
  categoryMiss: number;
  /** A pair needs both people to have answered at least this share of the total non-zero weight, else no score. */
  minCoverage: number;
  /** A question gives a "why you'll click" line when the average similarity across occupants is at least this (0–1)... */
  clickAt: number;
  /** ...and as a "heads-up" line when any occupant is at most this similar. */
  headsUpAt: number;
};

export const HEAVY = 5;
export const MEDIUM = 3;
export const LOW = 1;

export const DEFAULT_MATCH_CONFIG: RoomieMatchConfig = {
  version: 1,
  weights: {
    // Must match
    sleep: HEAVY,
    clean: HEAVY,
    smoke: HEAVY,
    food: HEAVY,
    guests: HEAVY,
    // Should be close
    noise: MEDIUM,
    ac: MEDIUM,
    social: MEDIUM,
    hours: MEDIUM,
    // Can differ (optional question)
    vibe: LOW,
  },
  hardClashes: [
    // Someone who smokes vs someone who needs a smoke-free room.
    ["smoke", "smokes", "strict"],
    // Strict veg (veg-only kitchen) vs non-veg.
    ["food", "vegStrict", "nonveg"],
    ["food", "vegStrict", "nonvegCook"],
  ],
  pairHardClashCap: 15,
  worstPairMargin: 25,
  categoryMiss: 0.5,
  minCoverage: 0.6,
  clickAt: 0.84,
  headsUpAt: 0.34,
};
