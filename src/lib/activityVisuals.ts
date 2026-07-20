export const activityKinds = [
  "pee",
  "poop",
  "meal",
  "water",
  "treat",
  "wake",
  "sleep",
  "walk",
  "play",
  "training",
  "note",
] as const;

export type ActivityVisualKind = (typeof activityKinds)[number];

export const activityVisuals = {
  pee: { symbol: "●", durationCapable: false },
  poop: { symbol: "◆", durationCapable: false },
  meal: { symbol: "◒", durationCapable: false },
  water: { symbol: "◉", durationCapable: false },
  treat: { symbol: "◈", durationCapable: false },
  wake: { symbol: "☀", durationCapable: false },
  sleep: { symbol: "☾", durationCapable: true },
  walk: { symbol: "↗", durationCapable: true },
  play: { symbol: "✦", durationCapable: true },
  training: { symbol: "◎", durationCapable: false },
  note: { symbol: "—", durationCapable: false },
} as const satisfies Record<
  ActivityVisualKind,
  { symbol: string; durationCapable: boolean }
>;
