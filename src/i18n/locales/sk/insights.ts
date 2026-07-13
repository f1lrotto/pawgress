import type { CatalogShape } from "../../catalog";
import type insightsEn from "../en/insights";

const insights = {
  body: {
    actions: {
      add: "Pridať meranie",
      cancel: "Zrušiť",
      confirmDelete: "Potvrdiť odstránenie merania",
      delete: "Odstrániť",
      edit: "Upraviť",
      keep: "Ponechať meranie",
      save: "Uložiť zmeny",
      saving: "Ukladá sa…",
    },
    age: {
      months_one: "{{count}} mesiac",
      months_few: "{{count}} mesiace",
      months_other: "{{count}} mesiacov",
      old: "Vek: {{age}}",
      unavailable: "Vek nie je dostupný",
      years_one: "{{count}} rok",
      years_few: "{{count}} roky",
      years_other: "{{count}} rokov",
    },
    aria: {
      add: "Pridať telesné meranie",
      bodyMeasurements: "Telesné miery",
      delete: "Odstrániť meranie z {{date}}",
      edit: "Upraviť meranie z {{date}}",
      editForm: "Upraviť telesné meranie",
      measurement: "Telesné meranie z {{date}}",
      recent: "Posledné telesné merania",
    },
    create: {
      backdated: "Použiť iný čas",
      help: "Vyplňte iba hodnoty, ktoré ste dnes odmerali.",
      time: "Čas merania",
      title: "Pridať meranie",
    },
    deleteConfirm: "Odstrániť toto telesné meranie?",
    editTitle: "Upraviť meranie",
    empty:
      "Zatiaľ tu nie sú žiadne merania. Pomocou formulára pridajte hmotnosť alebo telesné miery.",
    errors: {
      add: "Telesné meranie sa nepodarilo pridať. Rozpracované údaje zostali zachované.",
      changed:
        "Meranie sa zmenilo na inom zariadení. Telesné miery sa synchronizujú.",
      delete: "Telesné meranie sa nepodarilo odstrániť. Skúste to znova.",
      empty: "Ponechajte aspoň jedno meranie.",
      invalid: "Použite hodnotu väčšiu ako 0 a najviac 500.",
      invalidServer: "Merania musia byť väčšie ako 0 a najviac 500.",
      required: "Zadajte aspoň jedno meranie.",
      time: "Vyberte platný čas merania v deň narodenia alebo neskôr.",
      update:
        "Telesné meranie sa nepodarilo upraviť. Rozpracované údaje zostali zachované.",
    },
    fields: {
      backCm: "Dĺžka chrbta (cm)",
      backCmShort: "Dĺžka chrbta",
      chestCm: "Obvod hrudníka (cm)",
      chestCmShort: "Obvod hrudníka",
      neckCm: "Obvod krku (cm)",
      neckCmShort: "Obvod krku",
      weightKg: "Hmotnosť (kg)",
      weightKgShort: "Hmotnosť",
    },
    header: {
      title: "Telesné miery pre {{name}}",
    },
    list: {
      loading: "Načítavajú sa telesné miery…",
      newest: "Najnovšie ako prvé",
      title: "Posledné záznamy",
    },
    success: {
      added: "Telesné meranie bolo pridané.",
      deleted: "Telesné meranie bolo odstránené.",
      updated: "Telesné meranie bolo upravené.",
    },
  },
  card: {
    loading: "Načítavajú sa údaje grafu…",
    loadingAria: "Načítava sa {{title}}",
  },
  charts: {
    common: {
      hours: "{{value}} h",
      hoursShort: "h",
      rating: "{{value}} z 5",
    },
    potty: {
      caption: "Cikanie a kakanie podľa miestnej hodiny psa",
      description:
        "Miesto cikania a kakanie podľa miestneho času. Malé obrazovky používajú dvojhodinové intervaly.",
      empty:
        "Za posledných 30 dní nebola zaznamenaná žiadna potreba. Zaznamenávajte ju a uvidíte, kedy zvyčajne prichádza.",
      hour: "Hodina",
      inside: "Nehody dnu",
      meta: "Posledných 30 miestnych dní · záznamy",
      outside: "Cikanie vonku",
      poop: "Kakanie",
      successRate: "Úspešnosť vonku",
      title: "Rytmus potreby",
    },
    rating: {
      data: "Údaje hodnotenia dní",
      description:
        "Denné hodnotenie je uložené spolu s rutinami, ktoré ho mohli ovplyvniť.",
      empty:
        "Zatiaľ nie sú žiadne denné hodnotenia. Pridajte ich v Agende a uvidíte ich vývoj v čase.",
      meta: "Posledných 30 miestnych dní · 1–5",
      series: "Hodnotenie dňa",
      title: "Hodnotenia dní",
    },
    sleep: {
      data: "Denné údaje o spánku",
      description:
        "Denné súčty spánku zohľadňujú kratšie aj dlhšie dni pri zmenách času.",
      empty:
        "Zatiaľ nie sú žiadne súčty spánku. Zaznamenávajte zaspatie a zobudenie a uvidíte denný priebeh spánku.",
      meta: "Posledných 30 miestnych dní · hodiny",
      series: "Hodiny spánku",
      title: "Denník spánku",
    },
    outing: {
      data: "Údaje o intervaloch medzi venčeniami",
      description:
        "Čas medzi pobytmi vonku vrátane prechádzok, cikania vonku a kakania.",
      empty:
        "Zaznamenajte aspoň dve prechádzky alebo krátke venčenia, aby sa dal porovnať čas medzi nimi.",
      interval: "{{hours}} do ďalšieho venčenia ({{kinds}}) o {{date}}. ",
      kinds: {
        walk: "prechádzka",
        pee: "cikanie vonku",
        poop: "kakanie",
      },
      meal: "Jedlo: {{dates}}.",
      mealMarker: "Jedlo",
      meta: "Posledných 30 miestnych dní · hodiny",
      noMeal: "Medzi venčeniami nebolo žiadne jedlo.",
      series: "Hodiny medzi venčeniami",
      title: "Rytmus venčenia",
    },
    weight: {
      data: "História hmotnosti",
      description: "Každý bod zodpovedá uloženému telesnému meraniu.",
      empty:
        "Zatiaľ nie sú žiadne údaje o hmotnosti. Pridajte hmotnosť do telesných mier a graf sa začne vytvárať.",
      latest: "Najnovšia hmotnosť: {{weight}} kg, {{date}}.",
      meta: "Posledné merania · kg",
      series: "Hmotnosť",
      title: "Vývoj hmotnosti",
    },
  },
  page: {
    body: "Pozrite si vzorce v hmotnosti, potrebe, venčení, spánku a denných hodnoteniach. Presné hodnoty sú pod každým grafom.",
    errorBody:
      "Tieto prehľady sa nepodarilo načítať. Skontrolujte pripojenie a znova načítajte stránku.",
    errorTitle: "Prehľady nie sú dostupné",
    invalidTimezone:
      "Časové pásmo psa nie je platné, preto sa nedajú vypočítať prehľady miestnych dní.",
    range: "Posledných 30 miestnych dní",
    retry: "Skúsiť znova",
    title: "Prehľady pre {{name}}",
  },
} as const satisfies CatalogShape<typeof insightsEn>;

export default insights;
