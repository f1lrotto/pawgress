import agendaEn from "./locales/en/agenda";
import appEn from "./locales/en/app";
import commonEn from "./locales/en/common";
import dashboardEn from "./locales/en/dashboard";
import enrichmentEn from "./locales/en/enrichment";
import insightsEn from "./locales/en/insights";
import onboardingEn from "./locales/en/onboarding";
import settingsEn from "./locales/en/settings";
import timelineEn from "./locales/en/timeline";
import trainingEn from "./locales/en/training";
import agendaSk from "./locales/sk/agenda";
import appSk from "./locales/sk/app";
import commonSk from "./locales/sk/common";
import dashboardSk from "./locales/sk/dashboard";
import enrichmentSk from "./locales/sk/enrichment";
import insightsSk from "./locales/sk/insights";
import onboardingSk from "./locales/sk/onboarding";
import settingsSk from "./locales/sk/settings";
import timelineSk from "./locales/sk/timeline";
import trainingSk from "./locales/sk/training";

export const resources = {
  en: {
    agenda: agendaEn,
    app: appEn,
    common: commonEn,
    dashboard: dashboardEn,
    enrichment: enrichmentEn,
    insights: insightsEn,
    onboarding: onboardingEn,
    settings: settingsEn,
    timeline: timelineEn,
    training: trainingEn,
  },
  sk: {
    agenda: agendaSk,
    app: appSk,
    common: commonSk,
    dashboard: dashboardSk,
    enrichment: enrichmentSk,
    insights: insightsSk,
    onboarding: onboardingSk,
    settings: settingsSk,
    timeline: timelineSk,
    training: trainingSk,
  },
} as const;
