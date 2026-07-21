import type { CatalogShape } from "../../catalog";
import type enrichmentEn from "../en/enrichment";

const enrichment = {
  actions: {
    add: "Pridať aktivitu",
    adding: "Pridáva sa…",
    archive: "Archivovať",
    archiving: "Archivuje sa…",
    confirmArchive: "Potvrdiť archiváciu aktivity {{name}}",
    keep: "Ponechať",
    log: "Zaznamenať túto aktivitu",
    logNow: "Zaznamenať teraz",
    logging: "Zaznamenáva sa…",
    restore: "Obnoviť",
    restoring: "Obnovuje sa…",
  },
  archive: {
    confirm: "Archivovať aktivitu {{name}}?",
    help: "V starších záznamoch zostane názov aktivity zachovaný.",
  },
  archivedShelf: "Archivované aktivity ({{count}})",
  archiveAria: "Archivovať aktivitu {{name}}",
  empty: {
    addAction: "Pridať aktivitu",
    addAria: "Prejsť na formulár na pridanie aktivity",
    allArchived: "Všetky aktivity sú archivované.",
    allArchivedHelp:
      "Otvorte archivované aktivity nižšie a obnovte jednu z nich, aby ste mohli zaznamenávať obohatenie.",
    none: "Zatiaľ žiadne aktivity.",
    noneHelp: "Pridajte aktivitu a začnite zaznamenávať obohatenie.",
  },
  errors: {
    activityArchived:
      "Aktivita bola archivovaná na inom zariadení. Zoznam sa aktualizuje.",
    activityLimit:
      "Tento denník už obsahuje 100 aktivít. Použite niektorú z existujúcich.",
    activeRequired: "Vyberte aktívnu aktivitu.",
    addFailed:
      "Aktivitu sa nepodarilo pridať. Rozpracované údaje zostali zachované, skúste to znova.",
    archiveFailed:
      "Aktivitu {{name}} sa nepodarilo archivovať. Skúste to znova.",
    boundary: "Vyberte dátum {{date}} alebo neskorší.",
    createName: "Zadajte názov aktivity.",
    duplicate: "Aktivita s týmto názvom už existuje.",
    emojiLength: "Použite najviac 16 znakov.",
    future: "Vyberte čas, ktorý nie je viac než 5 minút v budúcnosti.",
    invalidName: "Použite názov s 1 až 64 znakmi.",
    invalidTime: "Vyberte platný dátum a čas.",
    logFailed: "Aktivitu obohatenia sa nepodarilo zaznamenať. Skúste to znova.",
    nameLength: "Použite najviac 64 znakov.",
    noteLength: "Použite najviac 500 znakov.",
    outOfRange: "Tento dátum a čas je mimo povoleného rozsahu.",
    restoreFailed: "Aktivitu {{name}} sa nepodarilo obnoviť. Skúste to znova.",
    saveFailed:
      "Aktivitu obohatenia sa nepodarilo uložiť. Poznámka aj čas zostali zachované.",
  },
  fields: {
    activity: "Aktivita",
    activityName: "Názov aktivity",
    chooseActivity: "Vyberte aktivitu",
    emoji: "Emoji (nepovinné)",
    noActive: "Žiadne aktívne aktivity",
    note: "Poznámka k aktivite",
    optional: "(nepovinné)",
    startedAt: "Kedy sa aktivita začala?",
    timezone: "Časové pásmo: {{timezone}}",
  },
  forms: {
    create: "Vytvoriť vlastnú aktivitu",
    createTitle: "Pridať aktivitu",
    log: "Zaznamenať ďalšiu aktivitu",
    logTitle: "Zaznamenať minulú aktivitu",
    noteCount: "{{count}}/500 znakov",
  },
  intro: {
    body: "Podporte zvedavosť psa {{name}} novými miestami, podnetmi a aktivitami. Zaznamenajte ich tu.",
    title: "Obohatenie",
  },
  loading: "Načítavajú sa aktivity…",
  logNowAria: "Zaznamenať aktivitu {{name}} teraz",
  restoreAria: "Obnoviť aktivitu {{name}}",
  shelf: {
    title: "Aktivity",
  },
  status: {
    added: "Aktivita {{name}} bola pridaná.",
    archived: "Aktivita {{name}} bola archivovaná.",
    logged: "{{dog}}: aktivita „{{activity}}“ bola zaznamenaná.",
    restored: "Aktivita {{name}} bola obnovená.",
  },
} as const satisfies CatalogShape<typeof enrichmentEn>;

export default enrichment;
