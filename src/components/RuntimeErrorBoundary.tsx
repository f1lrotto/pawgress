import { Component, createRef, Fragment, type ReactNode } from "react";

import i18n from "@/i18n";
import { Button } from "@/components/ui/button";

type Props = { children: ReactNode };
type State = { failed: boolean; resetKey: number };

class RuntimeErrorBoundary extends Component<Props, State> {
  state = { failed: false, resetKey: 0 };
  fallbackRef = createRef<HTMLElement>();

  static getDerivedStateFromError() {
    return { failed: true };
  }

  retry = () =>
    this.setState(({ resetKey }) => ({
      failed: false,
      resetKey: resetKey + 1,
    }));

  focusFallback = () => this.fallbackRef.current?.focus();

  componentDidMount() {
    if (this.state.failed) this.focusFallback();
  }

  componentDidUpdate(_: Props, previousState: State) {
    if (
      this.state.failed &&
      (!previousState.failed || previousState.resetKey !== this.state.resetKey)
    )
      this.focusFallback();
  }

  render() {
    if (this.state.failed)
      return (
        <main className="flex min-h-dvh items-center bg-background px-4 py-16 text-foreground sm:px-6">
          <section
            ref={this.fallbackRef}
            role="alert"
            tabIndex={-1}
            className="mx-auto w-full max-w-lg border-y border-border py-8"
          >
            <h1 className="text-balance text-2xl font-bold">
              {i18n.t("errorBoundary.title", { ns: "app" })}
            </h1>
            <p className="mt-3 max-w-[65ch] text-pretty text-muted-foreground">
              {i18n.t("errorBoundary.description", { ns: "app" })}
            </p>
            <Button className="mt-6" onClick={this.retry}>
              {i18n.t("errorBoundary.retry", { ns: "app" })}
            </Button>
          </section>
        </main>
      );

    return <Fragment key={this.state.resetKey}>{this.props.children}</Fragment>;
  }
}

export default RuntimeErrorBoundary;
