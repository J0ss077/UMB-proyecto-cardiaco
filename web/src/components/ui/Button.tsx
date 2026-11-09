// @requirement none
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

const buttonVariants = cva(
    "inline-flex items-center justify-center gap-2 rounded-field text-base font-medium transition-colors disabled:pointer-events-none disabled:opacity-60",
    {
        variants: {
            variant: {
                primary: "bg-primary text-primary-foreground hover:bg-primary/90",
                accent: "bg-accent text-primary-foreground hover:bg-accent/90",
                outline: "border border-border bg-surface text-foreground hover:bg-muted",
                ghost: "text-foreground hover:bg-muted",
                danger: "bg-critical text-primary-foreground hover:bg-critical/90",
            },
            size: {
                md: "h-12 px-4",
                sm: "h-9 px-3 text-sm",
                icon: "h-10 w-10",
            },
        },
        defaultVariants: { variant: "primary", size: "md" },
    },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
    loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant, size, loading = false, disabled, children, type = "button", ...props }, ref) => (
        <button
            ref={ref}
            type={type}
            className={cn(buttonVariants({ variant, size }), className)}
            disabled={disabled || loading}
            aria-busy={loading || undefined}
            {...props}
        >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" data-testid="button-spinner" /> : null}
            {children}
        </button>
    ),
);
Button.displayName = "Button";
