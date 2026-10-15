// DifficultyConfig: every per-difficulty tunable lives here (MDD 5.10).
// Star thresholds are fractions of the chart's maximum possible score, so they work for any song.
// Hard and Expert have a "penalty": misses and wrong taps cost score and health (out of 100); hits heal; 0 health fails the song.
// Everyone who finishes a song earns at least 1 star.

export const DIFFICULTY_ORDER = ["easy", "normal", "hard", "expert"];

export const DifficultyConfig = {
  easy:   { label: "Easy",   scrollSpeed: 0.45, tileScale: 2.0, windowScale: 1.8, bankMultiplier: 1.0, stars: { two: 0.45, three: 0.75 } },
  normal: { label: "Normal", scrollSpeed: 0.55, tileScale: 1.3, windowScale: 1.0,  bankMultiplier: 1.5, stars: { two: 0.55, three: 0.8 } },
  hard:   { label: "Hard",   scrollSpeed: 0.70, tileScale: 1, windowScale: 0.85, bankMultiplier: 2.0, stars: { two: 0.6, three: 0.85 },
          penalty: { miss: 10, wrong: 5, heal: 2, scoreMiss: 50, scoreWrong: 25 } },
  expert: { label: "Expert", scrollSpeed: 0.85, tileScale: 0.9, windowScale: 0.75, bankMultiplier: 3.0, stars: { two: 0.65, three: 0.9 },
          penalty: { miss: 14, wrong: 8, heal: 2, scoreMiss: 75, scoreWrong: 40 } },
};

/** 1 to 3 stars for a finished run. */
export function starsFor(score, maxScore, difficulty) {
  const { two, three } = DifficultyConfig[difficulty].stars;
  const ratio = maxScore > 0 ? score / maxScore : 0;
  return ratio >= three ? 3 : ratio >= two ? 2 : 1;
}

/** Coins this run would earn: (score / 10, rounded down) x multiplier, rounded down. Not added to the Bank yet. */
export function bankReward(score, difficulty) {
  return Math.floor(Math.floor(score / 10) * DifficultyConfig[difficulty].bankMultiplier);
}
