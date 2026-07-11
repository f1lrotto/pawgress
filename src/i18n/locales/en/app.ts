const app = {
  connectivity: {
    offline:
      "You're offline. Live notebook updates need a connection. Reconnecting…",
  },
  errorBoundary: {
    title: "We couldn't open your notebook",
    description:
      "Something unexpected interrupted Pawgress. Your saved information is still safe. Try opening the notebook again.",
    retry: "Try again",
  },
  loading: {
    auth: "Opening your notebook…",
    insights: "Opening insights…",
    section: "Opening this notebook section…",
    localeError:
      "We couldn't save your language preference. Check your connection and try again.",
    retry: "Try again",
  },
  login: {
    title: "Keep their day",
    titleAccent: "close at hand.",
    description:
      "Sign in to share the routines, garden trips, and small victories that make a puppy feel at home.",
    signInTitle: "Welcome back.",
    signUpTitle: "Start a notebook.",
    accountAccess: "Account access",
    signIn: "Sign in",
    signUp: "Create account",
    signInForm: "Sign in",
    signUpForm: "Create an account",
    email: "Email address",
    password: "Password",
    confirmation: "Confirm password",
    passwordHelp: "Use at least 8 characters.",
    showPassword: "Show password",
    showPasswords: "Show passwords",
    signingIn: "Signing in…",
    creatingAccount: "Creating account…",
    errors: {
      email: "Enter a valid email address.",
      password: "Enter your password.",
      passwordLength: "Use at least 8 characters.",
      confirmation: "Passwords must match.",
      signIn: "We couldn't sign you in. Check your details and try again.",
      signUp:
        "We couldn't create your account. Check your details and try again.",
    },
  },
} as const;

export default app;
