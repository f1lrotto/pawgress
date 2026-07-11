import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const primary =
  "bg-primary text-primary-foreground hover:bg-[var(--action-hover)] active:bg-[var(--action-active)]";
const secondary =
  "border border-input bg-card text-foreground hover:bg-accent active:bg-secondary";
const quiet =
  "bg-transparent text-foreground hover:bg-accent active:bg-secondary";

const buttonVariants = cva(
  "inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-md text-base font-semibold transition-[background-color,border-color,color] duration-150 ease-[var(--ease-out)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary,
        default: primary,
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-[var(--destructive-hover)] active:bg-[var(--destructive-active)]",
        secondary,
        outline: secondary,
        quiet,
        ghost: quiet,
        link: quiet,
      },
      size: {
        default: "px-4 py-2",
        sm: "px-4 py-2",
        lg: "min-h-12 px-5 py-3",
        icon: "size-11 p-0",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button };
