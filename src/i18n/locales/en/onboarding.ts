const onboarding = {
  shell: {
    setup: "Puppy setup",
    progress: "Setup progress",
    completed: "Completed",
    puppy: "Puppy",
    weight: "Weight",
    meals: "Meals",
  },
  puppy: {
    title: "Tell us about your puppy.",
    name: "Puppy name",
    birthday: "Birthday",
    timezone: "Routine times will use {{timezone}}. You can change this later.",
  },
  weight: {
    title: "Add a starting point.",
    description:
      "This becomes the first point in {{dogName}}'s weight history.",
    label: "Current weight",
    unitHint: "Weight is entered in kilograms.",
  },
  meals: {
    title: "When do meals happen?",
    description:
      "Add one to eight usual meal times. You can adjust them later.",
    routine: "Meal routine",
    item: "Meal {{number}}",
    name: "Meal name",
    time: "Time",
    removeAria: "Remove meal {{number}}",
    remove: "Remove meal",
    add: "Add another meal",
    limit: "Eight meal limit reached",
    finish: "Finish setup",
    pending: "Setting up {{dogName}}…",
    defaultLabel: "Breakfast",
  },
  invite: {
    title: "Join their notebook.",
    description:
      "If someone has already started your dog's record, use their invite instead of making a second one.",
  },
  actions: {
    continue: "Continue",
    back: "Back",
  },
  errors: {
    nameRequired: "Enter your puppy's name.",
    maxLength: "Use 64 characters or fewer.",
    birthdayInvalid: "Choose a valid birthday.",
    birthdayFuture: "Birthday can't be in the future.",
    weightPositive: "Enter a weight greater than zero.",
    weightMaximum: "Weight must be 500 kg or less.",
    mealRequired: "Enter a meal name.",
    mealDuplicate: "Meal names must be unique.",
    timeInvalid: "Choose a valid time.",
    save: "We couldn't save {{dogName}}'s setup. Nothing was lost—try again.",
  },
} as const;

export default onboarding;
