const settings = {
  header: {
    navigation: "Notebook sections",
    today: "Today",
    agenda: "Agenda",
    timeline: "Timeline",
    insights: "Insights",
    enrichment: "Enrichment",
    training: "Training",
    more: "More",
    currentDog: "Current dog",
    currentDogNamed: "Current dog: {{dogName}}",
    settings: "Settings",
    skipToContent: "Skip to main content",
  },
  page: {
    title: "Settings for {{dogName}}.",
    description:
      "Keep your account preferences and shared household notebook in one place.",
  },
  personal: {
    title: "Your account",
    signedInAs: "Signed in as",
    loading: "Opening your account…",
    unknown: "Current account",
    language: "Language",
    languageHelp: "Choose the language used for your account on every device.",
    english: "English",
    slovak: "Slovenčina",
    saving: "Saving language…",
    saved: "Language saved.",
    error:
      "We couldn't save your language. Your previous language has been restored.",
  },
  install: {
    title: "Install Pawgress",
    description:
      "Open your notebook from the Home Screen or desktop without finding a browser tab first.",
    installed: "Pawgress is already open as an installed app on this device.",
    available: "This browser can install Pawgress now.",
    ios: "In Safari, tap Share, then Add to Home Screen.",
    unavailable:
      "This browser isn't offering app installation right now. You can keep using Pawgress in this tab.",
    action: "Install app",
    installing: "Opening the browser install prompt…",
    accepted: "Finish the installation in your browser.",
    dismissed:
      "Installation was cancelled. Your browser can offer it again later.",
    error: "The install prompt couldn't open. You can keep using this tab.",
    retry: "Try installation again",
  },
  household: {
    title: "The people in {{dogName}}’s notebook.",
    description:
      "Share one live record of meals, walks, training, and the little moments between them.",
  },
  members: {
    title: "Household members",
    loading: "Opening the household list…",
    empty: "No household members are listed yet.",
    fallback: "Household member",
    owner: "Owner",
    member: "Member",
  },
  invite: {
    title: "Invite someone in",
    description:
      "Create a one-time code, then send it to the person joining {{dogName}}’s household.",
    checking: "Checking for an active invite…",
    checkingButton: "Checking invite…",
    activeCode: "Active invite code",
    copy: "Copy code",
    copying: "Copying code…",
    copied: "Invite code copied.",
    copyError: "We couldn't copy the invite code. Try again.",
    warning: "This code will stop working immediately.",
    keep: "Keep code",
    confirm: "Confirm revoke",
    revoke: "Revoke invite code",
    create: "Create invite code",
    creating: "Creating invite…",
    revoking: "Revoking invite…",
    revokeError:
      "We couldn't revoke this invite code. Try again when the connection is steady.",
    limitError: "This notebook already has more than one active invite.",
    createError:
      "We couldn't create an invite code. Try again when the connection is steady.",
  },
  join: {
    title: "Join another dog",
    description:
      "Have a code from another household? Add that dog here, then switch notebooks from the header.",
    form: "Join with an invite code",
    code: "Invite code",
    validation: "Enter the 32-character invite code.",
    accepted: "Invite accepted. Opening the shared notebook…",
    membershipLimit:
      "You already belong to the maximum number of dog notebooks.",
    memberLimit: "That household is full right now.",
    unavailable: "That invite code isn't available. Ask for a fresh code.",
    joining: "Joining notebook…",
    submit: "Join notebook",
  },
} as const;

export default settings;
