import { ConvexError } from "convex/values";

const maxMeals = 8;
const maxLabelLength = 64;

export const normalizeMeals = (
  meals: Array<{ label: string; timeOfDay: string }>,
) => {
  const normalized = meals
    .map(({ label, timeOfDay }) => ({ label: label.trim(), timeOfDay }))
    .sort((a, b) => a.timeOfDay.localeCompare(b.timeOfDay));
  const labels = normalized.map(({ label }) => label.toLocaleLowerCase());
  const valid =
    normalized.length > 0 &&
    normalized.length <= maxMeals &&
    normalized.every(
      ({ label, timeOfDay }) =>
        label.length > 0 &&
        label.length <= maxLabelLength &&
        /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(timeOfDay),
    ) &&
    new Set(labels).size === labels.length;

  if (!valid) throw new ConvexError("INVALID_MEALS");
  return normalized;
};
