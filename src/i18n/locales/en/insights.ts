const insights = {
  body: {
    actions: {
      add: "Add measurement",
      cancel: "Cancel",
      confirmDelete: "Confirm delete measurement",
      delete: "Delete",
      edit: "Edit",
      keep: "Keep measurement",
      save: "Save changes",
      saving: "Saving…",
    },
    age: {
      months_one: "{{count}} month",
      months_few: "{{count}} months",
      months_other: "{{count}} months",
      old: "{{age}} old",
      unavailable: "Age unavailable",
      years_one: "{{count}} year",
      years_few: "{{count}} years",
      years_other: "{{count}} years",
    },
    aria: {
      add: "Add body measurement",
      bodyMeasurements: "Body measurements",
      delete: "Delete measurement from {{date}}",
      edit: "Edit measurement from {{date}}",
      editForm: "Edit body measurement",
      measurement: "Body measurement from {{date}}",
      recent: "Recent body measurements",
    },
    create: {
      backdated: "Use a different time",
      help: "Fill only what you measured today.",
      time: "Measurement time",
      title: "Add a measurement",
    },
    deleteConfirm: "Delete this body measurement?",
    editTitle: "Edit measurement",
    empty:
      "No measurements yet. Use the form to add weight or body measurements.",
    errors: {
      add: "We couldn't add that body measurement. Your draft is still here.",
      changed:
        "That measurement changed on another device. Your measurements are syncing.",
      delete: "We couldn't delete that body measurement. Try again.",
      empty: "Keep at least one measurement.",
      invalid: "Use a value above 0 and at most 500.",
      invalidServer: "Measurements must be above 0 and at most 500.",
      required: "Enter at least one measurement.",
      time: "Choose a valid time on or after the birthday.",
      update:
        "We couldn't update that body measurement. Your draft is still here.",
    },
    fields: {
      backCm: "Back length (cm)",
      backCmShort: "Back length",
      chestCm: "Chest (cm)",
      chestCmShort: "Chest",
      neckCm: "Neck (cm)",
      neckCmShort: "Neck",
      weightKg: "Weight (kg)",
      weightKgShort: "Weight",
    },
    header: {
      title: "{{name}}’s body measurements",
    },
    list: {
      loading: "Loading body measurements…",
      newest: "Newest first",
      title: "Recent entries",
    },
    success: {
      added: "Body measurement added.",
      deleted: "Body measurement deleted.",
      updated: "Body measurement updated.",
    },
  },
  card: {
    loading: "Loading chart data…",
    loadingAria: "Loading {{title}}",
  },
  charts: {
    common: {
      hours: "{{value}} hours",
      hoursShort: "h",
      rating: "{{value}} out of 5",
    },
    potty: {
      caption: "Potty events by dog-local hour",
      description:
        "Pee location and poop events by local time. Small screens use two-hour windows.",
      empty:
        "No potty breaks were logged in the last 30 days. Log them to see when they usually happen.",
      hour: "Hour",
      inside: "Inside accidents",
      meta: "Last 30 local days · events",
      outside: "Outside pee",
      poop: "Poop",
      successRate: "Outside success",
      title: "Potty clock",
    },
    rating: {
      data: "Day rating data",
      description:
        "Your daily score, kept alongside the routines that may have shaped it.",
      empty:
        "No daily ratings yet. Add ratings in Agenda to see how they change over time.",
      meta: "Last 30 local days · 1–5",
      series: "Day rating",
      title: "Day ratings",
    },
    sleep: {
      data: "Daily sleep data",
      description:
        "Daily sleep totals respect short and long local days across timezone changes.",
      empty:
        "No sleep totals yet. Log sleep and wake times to see daily sleep patterns.",
      meta: "Last 30 local days · hours",
      series: "Sleep hours",
      title: "Sleep ledger",
    },
    walk: {
      data: "Walk interval data",
      description:
        "Time from one finished walk to the next start, with meals marked along the way.",
      empty:
        "Log at least two completed walks to compare the time between them.",
      interval: "{{hours}} until the walk at {{date}}. ",
      meal: "Meal marker: {{dates}}.",
      mealMarker: "Meal marker",
      meta: "Last 30 local days · hours",
      noMeal: "No meal between walks.",
      series: "Hours between walks",
      title: "Walk rhythm",
    },
    weight: {
      data: "Weight history data",
      description: "Each point comes from a saved body measurement.",
      empty:
        "No weights yet. Add a weight in body measurements to start this chart.",
      latest: "Latest weight: {{weight}} kg on {{date}}.",
      meta: "Recent measurements · kg",
      series: "Weight",
      title: "Weight trail",
    },
  },
  page: {
    body: "See patterns in weight, potty breaks, walks, sleep, and daily ratings. Exact values appear below each chart.",
    errorBody:
      "We couldn't load these insights. Check your connection, then reload the page.",
    errorTitle: "Insights are unavailable",
    invalidTimezone:
      "This dog’s timezone is invalid, so we can’t calculate local-day insights.",
    range: "Last 30 local days",
    retry: "Try again",
    title: "Insights for {{name}}",
  },
} as const;

export default insights;
