// @requirement none
import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
    <div ref={ref} className={cn("rounded-card border border-border/70 bg-background", className)} {...props} />
));
Card.displayName = "Card";

export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex items-center justify-between gap-3 px-5 pt-5", className)} {...props} />
));
CardHeader.displayName = "CardHeader";

export const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
    ({ className, ...props }, ref) => (
        <h3 ref={ref} className={cn("text-base font-medium leading-tight text-foreground", className)} {...props} />
    ),
);
CardTitle.displayName = "CardTitle";

export const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
    <div ref={ref} className={cn("p-5", className)} {...props} />
));
CardContent.displayName = "CardContent";
