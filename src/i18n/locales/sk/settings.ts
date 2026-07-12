import type { CatalogShape } from "../../catalog";
import type settingsEn from "../en/settings";

const settings = {
  header: {
    navigation: "Časti zápisníka",
    today: "Dnes",
    agenda: "Denný plán",
    timeline: "Časová os",
    insights: "Prehľady",
    enrichment: "Obohatenie",
    training: "Tréning",
    more: "Viac",
    currentDog: "Aktuálny pes",
    currentDogNamed: "Aktuálny pes: {{dogName}}",
    settings: "Nastavenia",
    skipToContent: "Preskočiť na hlavný obsah",
  },
  page: {
    title: "Nastavenia pre {{dogName}}.",
    description:
      "Spravujte nastavenia svojho účtu aj spoločný zápisník domácnosti na jednom mieste.",
  },
  personal: {
    title: "Váš účet",
    signedInAs: "Prihlásený účet",
    loading: "Otvárame váš účet…",
    unknown: "Aktuálny účet",
    language: "Jazyk",
    languageHelp: "Vyberte jazyk svojho účtu pre všetky zariadenia.",
    english: "English",
    slovak: "Slovenčina",
    saving: "Ukladanie jazyka…",
    saved: "Jazyk bol uložený.",
    error: "Jazyk sa nepodarilo uložiť. Obnovili sme predchádzajúci jazyk.",
  },
  install: {
    title: "Nainštalovať Pawgress",
    description:
      "Otvárajte zápisník z plochy alebo domovskej obrazovky bez hľadania karty prehliadača.",
    installed:
      "Pawgress je v tomto zariadení už otvorený ako nainštalovaná aplikácia.",
    available: "Tento prehliadač môže teraz nainštalovať Pawgress.",
    ios: "V Safari ťuknite na Zdieľať a potom na Pridať na plochu.",
    unavailable:
      "Tento prehliadač teraz neponúka inštaláciu aplikácie. Pawgress môžete ďalej používať na tejto karte.",
    action: "Nainštalovať aplikáciu",
    installing: "Otvárame ponuku inštalácie prehliadača…",
    accepted: "Dokončite inštaláciu v prehliadači.",
    dismissed:
      "Inštalácia bola zrušená. Prehliadač ju môže neskôr ponúknuť znova.",
    error:
      "Ponuku inštalácie sa nepodarilo otvoriť. Túto kartu môžete naďalej používať.",
    retry: "Skúsiť inštaláciu znova",
  },
  household: {
    title: "Ľudia v zápisníku pre {{dogName}}.",
    description:
      "Zdieľajte jeden živý záznam jedla, prechádzok, tréningu a malých chvíľ medzi nimi.",
  },
  members: {
    title: "Členovia domácnosti",
    loading: "Otvárame zoznam domácnosti…",
    empty: "Zatiaľ nie sú uvedení žiadni členovia domácnosti.",
    fallback: "Člen domácnosti",
    owner: "Vlastník",
    member: "Člen",
  },
  invite: {
    title: "Pozvite niekoho",
    description:
      "Vytvorte jednorazový kód a pošlite ho osobe, ktorá sa pripája k domácnosti pre {{dogName}}.",
    checking: "Kontrolujeme aktívnu pozvánku…",
    checkingButton: "Kontrola pozvánky…",
    activeCode: "Aktívny kód pozvánky",
    copy: "Kopírovať kód",
    copying: "Kopírovanie kódu…",
    copied: "Kód pozvánky bol skopírovaný.",
    copyError: "Kód pozvánky sa nepodarilo skopírovať. Skúste to znova.",
    warning: "Tento kód prestane okamžite fungovať.",
    keep: "Ponechať kód",
    confirm: "Potvrdiť zrušenie",
    revoke: "Zrušiť kód pozvánky",
    create: "Vytvoriť kód pozvánky",
    creating: "Vytváranie pozvánky…",
    revoking: "Rušenie pozvánky…",
    revokeError:
      "Kód pozvánky sa nepodarilo zrušiť. Skúste to znova pri stabilnom pripojení.",
    limitError: "Tento zápisník už má viac než jednu aktívnu pozvánku.",
    createError:
      "Kód pozvánky sa nepodarilo vytvoriť. Skúste to znova pri stabilnom pripojení.",
  },
  join: {
    title: "Pridať ďalšieho psa",
    description:
      "Máte kód z inej domácnosti? Pridajte psa tu a potom prepínajte zápisníky v hlavičke.",
    form: "Pripojenie pomocou kódu pozvánky",
    code: "Kód pozvánky",
    validation: "Zadajte 32-znakový kód pozvánky.",
    accepted: "Pozvánka bola prijatá. Otvárame spoločný zápisník…",
    membershipLimit: "Už patríte do maximálneho počtu zápisníkov psov.",
    memberLimit: "Táto domácnosť je momentálne plná.",
    unavailable: "Tento kód pozvánky nie je dostupný. Požiadajte o nový kód.",
    joining: "Pripájanie k zápisníku…",
    submit: "Pripojiť sa k zápisníku",
  },
} as const satisfies CatalogShape<typeof settingsEn>;

export default settings;
