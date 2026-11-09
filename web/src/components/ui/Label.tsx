// @requirement none
import { forwardRef, type LabelHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export const Label = forwardRef<HTMLLabelElement, LabelHTMLAttributes<HTMLLabelElement>>(
    ({ className, ...props }, ref) => (
        <label ref={ref} className={cn("flex items-center gap-2 text-sm font-medium text-foreground", className)} {...props} />
    ),
);
Label.displayName = "Label";
