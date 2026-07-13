export const trainingRatings = [
  { icon: "👎", value: "negative" },
  { icon: "😐", value: "neutral" },
  { icon: "👍", value: "positive" },
] as const;

export type TrainingRating = (typeof trainingRatings)[number]["value"];

const canonicalTrainingRatings = { negative: 1, neutral: 3, positive: 5 };

export const toCanonicalTrainingRating = (rating: TrainingRating) =>
  canonicalTrainingRatings[rating];

export const toTrainingRating = (rating: number): TrainingRating =>
  rating <= 2 ? "negative" : rating >= 4 ? "positive" : "neutral";
