import type { CatalogShape } from "../../catalog";
import type timelineEn from "../en/timeline";

const timeline = {
  peePlace: { inside: "Dnu", outside: "Vonku" },
  amount: "Množstvo: {{amount}}",
  boundary: "Dni sa riadia časovým pásmom {{timezone}}.",
  clearFilters: "Zrušiť filtre",
  daySummary: {
    activities_one: "{{formattedCount}} aktivita",
    activities_few: "{{formattedCount}} aktivity",
    activities_other: "{{formattedCount}} aktivít",
    rest: "{{duration}} odpočinku",
    walk: "{{duration}} prechádzky",
  },
  duration: "Trvanie: {{duration}}",
  edit: "Upraviť",
  editAria: "Upraviť {{event}} o {{time}}",
  empty: "Zatiaľ tu nie sú žiadne záznamy.",
  emptyAction: "Zaznamenať aktivitu",
  end: "Dostali ste sa k prvému záznamu.",
  filter: "Filtrovať udalosti",
  filteredEmpty: "Žiadne záznamy nezodpovedajú týmto filtrom.",
  intro:
    "Jedlá, odpočinok, prechádzky, tréningy, hry a poznámky pre {{name}} nájdete v jednej súvislej histórii.",
  invalid:
    "Časovú os sa nepodarilo načítať. Skontrolujte časové pásmo pre {{name}}.",
  kinds: {
    meal: "Jedlo",
    note: "Poznámka",
    pee: "Cikanie",
    play: "Hra",
    poop: "Kakanie",
    sleep: "Zaspatie",
    training: "Tréning",
    treat: "Pamlsok",
    water: "Napitie vody",
    wake: "Prebudenie",
    walk: "Prechádzka",
  },
  linkedWalk: "Prepojená prechádzka {{id}}",
  loadMore: "Načítať staršie záznamy",
  loading: "Otvára sa časová os…",
  loadingMore: "Načítavajú sa staršie záznamy",
  openTrainingOne: "Zobraziť povel",
  openTrainingMany: "Zobraziť tréning",
  trainingRating: {
    negative: "Negatívne",
    neutral: "Neutrálne",
    positive: "Pozitívne",
  },
  duringWalk: "Počas prechádzky",
  title: "Deň za dňom.",
  timeline: "Časová os",
  updated: "{{event}} bolo upravené.",
} as const satisfies CatalogShape<typeof timelineEn>;

export default timeline;
