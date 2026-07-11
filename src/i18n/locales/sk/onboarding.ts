import type { CatalogShape } from "../../catalog";
import type onboardingEn from "../en/onboarding";

const onboarding = {
  shell: {
    setup: "Nastavenie šteniatka",
    progress: "Priebeh nastavenia",
    completed: "Dokončené",
    puppy: "Šteniatko",
    weight: "Hmotnosť",
    meals: "Jedlá",
  },
  puppy: {
    title: "Povedzte nám o svojom šteniatku.",
    name: "Meno šteniatka",
    birthday: "Dátum narodenia",
    timezone:
      "Časy režimu budú používať pásmo {{timezone}}. Neskôr ho môžete zmeniť.",
  },
  weight: {
    title: "Pridajte východiskový bod.",
    description: "Toto bude prvý bod v histórii hmotnosti pre {{dogName}}.",
    label: "Aktuálna hmotnosť",
    unitHint: "Hmotnosť zadávajte v kilogramoch.",
  },
  meals: {
    title: "Kedy sú zvyčajne jedlá?",
    description:
      "Pridajte jeden až osem obvyklých časov jedla. Neskôr ich môžete upraviť.",
    routine: "Režim jedál",
    item: "Jedlo {{number}}",
    name: "Názov jedla",
    time: "Čas",
    removeAria: "Odstrániť jedlo {{number}}",
    remove: "Odstrániť jedlo",
    add: "Pridať ďalšie jedlo",
    limit: "Dosiahli ste limit ôsmich jedál",
    finish: "Dokončiť nastavenie",
    pending: "Nastavujeme profil pre {{dogName}}…",
    defaultLabel: "Raňajky",
  },
  invite: {
    title: "Pripojte sa k zápisníku.",
    description:
      "Ak už niekto začal viesť záznam vášho psa, použite jeho pozvánku namiesto vytvorenia druhého záznamu.",
  },
  actions: {
    continue: "Pokračovať",
    back: "Späť",
  },
  errors: {
    nameRequired: "Zadajte meno svojho šteniatka.",
    maxLength: "Použite najviac 64 znakov.",
    birthdayInvalid: "Vyberte platný dátum narodenia.",
    birthdayFuture: "Dátum narodenia nemôže byť v budúcnosti.",
    weightPositive: "Zadajte hmotnosť väčšiu ako nula.",
    weightMaximum: "Hmotnosť musí byť najviac 500 kg.",
    mealRequired: "Zadajte názov jedla.",
    mealDuplicate: "Názvy jedál musia byť jedinečné.",
    timeInvalid: "Vyberte platný čas.",
    save: "Nastavenie pre {{dogName}} sa nepodarilo uložiť. O nič ste neprišli — skúste to znova.",
  },
} as const satisfies CatalogShape<typeof onboardingEn>;

export default onboarding;
