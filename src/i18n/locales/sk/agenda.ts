import type { CatalogShape } from "../../catalog";
import type agendaEn from "../en/agenda";

const agenda = {
  page: {
    title: "Dnešný plán",
    description:
      "Naplánujte a zaznamenajte obohatenie, tréning a záver dňa pre psa {{dogName}}.",
    timezoneError:
      "Nepodarilo sa načítať časové pásmo pre {{dogName}}. Pred úpravou denného plánu skontrolujte profil psa.",
  },
  common: {
    saving: "Ukladanie…",
    characters_one: "{{formattedCount}}/{{formattedMax}} znak",
    characters_few: "{{formattedCount}}/{{formattedMax}} znaky",
    characters_other: "{{formattedCount}}/{{formattedMax}} znakov",
    maxCharacters: "Použite najviac {{formattedMax}} znakov.",
  },
  categories: {
    enrichment: "Obohatenie",
    training: "Tréning",
  },
  goals: {
    enrichmentTitle: "Ciele obohatenia",
    trainingTitle: "Tréningové ciele",
    empty:
      "Zatiaľ tu nie sú žiadne ciele. Nižšie pridajte aktivitu, ktorej sa chcete dnes venovať.",
    descriptionRequired: "Stručne opíšte tento cieľ.",
    removeAria: "Odstrániť cieľ {{goal}}",
    removing: "Odstraňovanie…",
    remove: "Odstrániť",
    addEnrichmentAria: "Pridať cieľ obohatenia",
    addTrainingAria: "Pridať tréningový cieľ",
    newEnrichment: "Nový cieľ obohatenia",
    newTraining: "Nový tréningový cieľ",
    limit: "Denný limit bol dosiahnutý · {{formattedCount}}/{{formattedMax}}",
    count_one: "{{formattedCount}}/{{formattedMax}} cieľ",
    count_few: "{{formattedCount}}/{{formattedMax}} ciele",
    count_other: "{{formattedCount}}/{{formattedMax}} cieľov",
    adding: "Pridávanie…",
    addEnrichment: "Pridať cieľ obohatenia",
    addTraining: "Pridať tréningový cieľ",
    limitErrorEnrichment: "Tento deň už má 20 cieľov obohatenia.",
    limitErrorTraining: "Tento deň už má 20 tréningových cieľov.",
    addErrorEnrichment:
      "Cieľ obohatenia sa nepodarilo pridať. Váš návrh zostal zachovaný.",
    addErrorTraining:
      "Tréningový cieľ sa nepodarilo pridať. Váš návrh zostal zachovaný.",
    addedEnrichment: "Cieľ obohatenia bol pridaný.",
    addedTraining: "Tréningový cieľ bol pridaný.",
    updated: "Cieľ v kategórii {{category}} bol aktualizovaný.",
    removed: "Cieľ v kategórii {{category}} bol odstránený.",
    updateError: "Cieľ sa nepodarilo aktualizovať. Skúste to znova.",
    removeError: "Cieľ sa nepodarilo odstrániť. Skúste to znova.",
    changedElsewhere:
      "Tento cieľ sa zmenil na inom zariadení. Denný plán sa práve synchronizuje.",
    readOnly:
      "Tento denný plán už možno iba čítať. Váš návrh zostal zachovaný.",
  },
  today: {
    aria: "Denný plán na dnes",
    loading: "Otvárame denný plán na dnes…",
    title: "Denný plán na dnes",
    reflectionTitle: "Reflexia",
  },
  reflection: {
    win: "Dnešný úspech",
    diary: "Denník denného plánu",
    diaryTitle: "Poznámka do denníka",
    rating: "Hodnotenie dňa",
    saveWinAria: "Uložiť dnešný úspech",
    saveDiaryAria: "Uložiť denník",
    saveWin: "Uložiť úspech",
    saveDiary: "Uložiť denník",
    saveRating: "Uložiť hodnotenie",
    ratingError: "Vyberte celé číslo od 1 do 5.",
    ratingHelp:
      "Ak chcete hodnotenie vymazať, nechajte pole prázdne · 1 pokojný deň, 5 výnimočný deň",
    winSaveError:
      "Dnešný úspech sa nepodarilo uložiť. Váš návrh zostal zachovaný.",
    ratingSaveError:
      "Hodnotenie dňa sa nepodarilo uložiť. Vaša voľba zostala zachovaná.",
    diarySaveError:
      "Denník denného plánu sa nepodarilo uložiť. Váš návrh zostal zachovaný.",
    winSaved: "Dnešný úspech bol uložený.",
    ratingSaved: "Hodnotenie dňa bolo uložené.",
    diarySaved: "Denník denného plánu bol uložený.",
  },
  yesterday: {
    aria: "Včerajší denný plán",
    title: "Včera",
    loading: "Otvárame včerajšie poznámky…",
    empty: "Včera nebolo nič zaznamenané.",
    enrichmentHistory: "História obohatenia",
    trainingHistory: "História tréningu",
    noGoals: "Neboli zaznamenané žiadne ciele.",
    completeStatus: "Splnené",
    openStatus: "Nesplnené",
    win: "Úspech",
    rating: "Hodnotenie",
    diary: "Denník",
    notRecorded: "Nezaznamenané",
    notRated: "Nehodnotené",
    noDiary: "Bez poznámky v denníku",
  },
} as const satisfies CatalogShape<typeof agendaEn>;

export default agenda;
