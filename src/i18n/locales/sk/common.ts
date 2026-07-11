import type { CatalogShape } from "../../catalog";
import type commonEn from "../en/common";

const common = {
  brand: {
    name: "Pawgress",
    tagline: "Denný rytmus",
  },
  meta: {
    title: "Pawgress",
    description:
      "Pawgress udržiava denný režim šteniatka prehľadný, pokojný a zdieľaný.",
  },
} as const satisfies CatalogShape<typeof commonEn>;

export default common;
