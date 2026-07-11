const enrichment = {
  actions: {
    add: "Add activity",
    adding: "Adding…",
    archive: "Archive",
    archiving: "Archiving…",
    confirmArchive: "Confirm archive {{name}}",
    keep: "Keep",
    log: "Log this play",
    logNow: "Log now",
    logging: "Logging…",
    restore: "Restore",
    restoring: "Restoring…",
  },
  archive: {
    confirm: "Archive {{name}}?",
    help: "Old logs will keep their activity name.",
  },
  archivedShelf: "Archived activities ({{count}})",
  archiveAria: "Archive {{name}}",
  empty: {
    addAction: "Add an activity",
    addAria: "Go to Add activity form",
    allArchived: "Every activity is archived.",
    allArchivedHelp:
      "Open the archived activities below and restore one to log play.",
    none: "No activities yet.",
    noneHelp: "Add an activity to start logging play.",
  },
  errors: {
    activityArchived:
      "This activity was archived on another device. The list is updating.",
    activityLimit:
      "This notebook already has 100 activities. Reuse an existing one.",
    activeRequired: "Choose an active activity.",
    addFailed:
      "We couldn't add that activity. Your draft is still here—try again.",
    archiveFailed: "We couldn't archive {{name}}. Try again.",
    boundary: "Choose a date on or after {{date}}.",
    createName: "Give the activity a name.",
    duplicate: "An activity with this name already exists.",
    emojiLength: "Use 16 characters or fewer.",
    future: "Choose a time no more than 5 minutes in the future.",
    invalidName: "Use a name between 1 and 64 characters.",
    invalidTime: "Choose a valid date and time.",
    logFailed: "We couldn't log that play. Try again.",
    nameLength: "Use 64 characters or fewer.",
    noteLength: "Use 500 characters or fewer.",
    outOfRange: "That date and time is outside the allowed range.",
    restoreFailed: "We couldn't restore {{name}}. Try again.",
    saveFailed:
      "We couldn't save this play. Your note and time are still here.",
  },
  fields: {
    activity: "Activity",
    activityName: "Activity name",
    chooseActivity: "Choose an activity",
    emoji: "Emoji (optional)",
    noActive: "No active activities",
    note: "Play note",
    optional: "(optional)",
    startedAt: "When did play start?",
    timezone: "Timezone: {{timezone}}",
  },
  forms: {
    create: "Create custom activity",
    createTitle: "Add an activity",
    log: "Log another play time",
    logTitle: "Log a past activity",
    noteCount: "{{count}}/500 characters",
  },
  intro: {
    body: "Keep {{name}} curious with games, places, and new activities. Log them here.",
    title: "Enrichment",
  },
  loading: "Loading activities…",
  logNowAria: "Log {{name}} now",
  restoreAria: "Restore {{name}}",
  shelf: {
    title: "Activities",
  },
  status: {
    added: "{{name}} added.",
    archived: "{{name}} archived.",
    logged: "{{activity}} logged for {{dog}}.",
    restored: "{{name}} restored.",
  },
} as const;

export default enrichment;
