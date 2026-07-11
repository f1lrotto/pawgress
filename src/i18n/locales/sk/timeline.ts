import type { CatalogShape } from "../../catalog";
import type timelineEn from "../en/timeline";

const timeline = {
  peePlace: { inside: "Dnu", outside: "Vonku" },
  amount: "Množstvo: {{amount}}",
  boundary: "Hranica dňa: {{timezone}}",
  clearFilters: "Zrušiť filtre",
  duration: "Trvanie: {{duration}}",
  empty: "V tento deň tu nie sú žiadne záznamy.",
  emptyAction: "Zaznamenať aktivitu",
  end: "Koniec záznamov z tohto dňa.",
  filter: "Filtrovať udalosti",
  filteredEmpty: "Žiadne záznamy nezodpovedajú týmto filtrom.",
  intro:
    "Jedlá, odpočinok, prechádzky, hry a poznámky pre {{name}} nájdete prehľadne na jednej stránke.",
  invalid:
    "Tento deň časovej osi sa nepodarilo načítať. Skontrolujte dátum a časové pásmo pre {{name}}.",
  kinds: {
    meal: "Jedlo",
    note: "Poznámka",
    pee: "Cikanie",
    play: "Hra",
    poop: "Kakanie",
    sleep: "Zaspatie",
    treat: "Pamlsok",
    wake: "Prebudenie",
    walk: "Prechádzka",
  },
  linkedWalk: "Prepojená prechádzka {{id}}",
  loadMore: "Načítať staršie záznamy",
  loading: "Otvárajú sa záznamy z tohto dňa…",
  loadingMore: "Načítavajú sa staršie záznamy",
  duringWalk: "Počas prechádzky",
  title: "Deň za dňom.",
  timeline: "Časová os",
  timelineDate: "Dátum časovej osi",
} as const satisfies CatalogShape<typeof timelineEn>;

export default timeline;
