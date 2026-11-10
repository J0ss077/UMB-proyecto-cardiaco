// @requirement none
import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "../../lib/cn";
import { CATEGORY_LABEL, GUIDELINE_NOTE, type ReadingCategory } from "../../lib/clinical";

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

// Badge for the descriptive category of a reading (not a diagnosis). The visible
// "guía" marks the published reference lines, so the label is not read as the
// alert_config thresholds an administrator can edit.
export function CategoryBadge({ category }: { category: ReadingCategory }) {
    return (
        <Badge tone={CATEGORY_TONE[category]} data-testid="category-badge" title={GUIDELINE_NOTE}>
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
            <span>{CATEGORY_LABEL[category]}</span>
            <span className="font-normal opacity-75">(guía)</span>
        </Badge>
    );
}
