// @requirement none
import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "../../lib/cn";
import { Label } from "./Label";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
    label?: ReactNode;
    labelIcon?: ReactNode;
    suffix?: ReactNode;
    trailing?: ReactNode;
    hint?: ReactNode;
    error?: string | null;
    wrapperClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
    ({ className, wrapperClassName, label, labelIcon, suffix, trailing, hint, error, id, ...props }, ref) => {
        const generated = useId();
        const inputId = id ?? generated;
        const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;
        return (
            <div className={cn("flex flex-col gap-2", wrapperClassName)}>
                {label ? (
                    <Label htmlFor={inputId}>
                        {labelIcon}
                        {label}
                    </Label>
                ) : null}
                <div className="relative">
                    <input
                        ref={ref}
                        id={inputId}
                        aria-invalid={error ? true : undefined}
                        aria-describedby={describedBy}
                        className={cn(
                            "h-12 w-full rounded-field border bg-background px-4 text-base text-foreground placeholder:text-subtle/60",
                            error ? "border-critical" : "border-border",
                            suffix ? "pr-16" : null,
                            trailing ? "pr-12" : null,
                            className,
                        )}
                        {...props}
                    />
                    {suffix ? (
                        <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm text-subtle">
                            {suffix}
                        </span>
                    ) : null}
                    {trailing ? <div className="absolute inset-y-0 right-2 flex items-center">{trailing}</div> : null}
                </div>
                {error ? (
                    <p id={`${inputId}-error`} role="alert" className="text-sm text-critical">
                        {error}
                    </p>
                ) : hint ? (
                    <p id={`${inputId}-hint`} className="text-sm text-subtle">
                        {hint}
                    </p>
                ) : null}
            </div>
        );
    },
);
Input.displayName = "Input";
