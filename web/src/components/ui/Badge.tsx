// @requirement none
import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "../../lib/cn";
import { CATEGORY_LABEL, type ReadingCategory } from "../../lib/clinical";

const badgeVariants = cva("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", {
    variants: {
        tone: {
            neutral: "bg-muted text-foreground",
            normal: "bg-normal-soft text-normal",
            elevated: "bg-elevated-soft text-elevated",
            warning: "bg-warning-soft text-warning",
            critical: "bg-critical-soft text-critical",
        },
    },
    defaultVariants: { tone: "neutral" },
});

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
    return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

const CATEGORY_TONE: Record<ReadingCategory, NonNullable<BadgeProps["tone"]>> = {
    normal: "normal",
    elevated: "elevated",
    high: "warning",
    crisis: "critical",
};

// Badge for the descriptive category of a reading (not a diagnosis).
export function CategoryBadge({ category }: { category: ReadingCategory }) {
    return (
        <Badge tone={CATEGORY_TONE[category]} data-testid="category-badge">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
            {CATEGORY_LABEL[category]}
        </Badge>
    );
}
