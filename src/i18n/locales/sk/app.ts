import type { CatalogShape } from "../../catalog";
import type appEn from "../en/app";

const app = {
  connectivity: {
    offline:
      "Ste offline. Živé aktualizácie zápisníka vyžadujú pripojenie. Obnovujeme spojenie…",
  },
  errorBoundary: {
    title: "Nepodarilo sa otvoriť váš zápisník",
    description:
      "Pawgress nečakane prerušil svoju činnosť. Vaše uložené údaje sú v bezpečí. Skúste zápisník otvoriť znova.",
    retry: "Skúsiť znova",
  },
  loading: {
    auth: "Otvárame váš zápisník…",
    insights: "Otvárame prehľady…",
    section: "Otvárame túto časť zápisníka…",
    localeError:
      "Nepodarilo sa uložiť jazyk. Skontrolujte pripojenie a skúste to znova.",
    retry: "Skúsiť znova",
  },
  login: {
    title: "Majte ich deň",
    titleAccent: "vždy poruke.",
    description:
      "Prihláste sa a zdieľajte režim, prechádzky a malé víťazstvá, vďaka ktorým sa šteniatko cíti doma.",
    signInTitle: "Vitajte späť.",
    signUpTitle: "Založte zápisník.",
    accountAccess: "Prístup k účtu",
    signIn: "Prihlásiť sa",
    signUp: "Vytvoriť účet",
    signInForm: "Prihlásenie",
    signUpForm: "Vytvorenie účtu",
    email: "E-mailová adresa",
    password: "Heslo",
    confirmation: "Potvrdenie hesla",
    passwordHelp: "Použite aspoň 8 znakov.",
    showPassword: "Zobraziť heslo",
    showPasswords: "Zobraziť heslá",
    signingIn: "Prihlasovanie…",
    creatingAccount: "Vytváranie účtu…",
    errors: {
      email: "Zadajte platnú e-mailovú adresu.",
      password: "Zadajte svoje heslo.",
      passwordLength: "Použite aspoň 8 znakov.",
      confirmation: "Heslá sa musia zhodovať.",
      signIn: "Nepodarilo sa prihlásiť. Skontrolujte údaje a skúste to znova.",
      signUp:
        "Nepodarilo sa vytvoriť účet. Skontrolujte údaje a skúste to znova.",
    },
  },
} as const satisfies CatalogShape<typeof appEn>;

export default app;
