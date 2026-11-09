// @requirement none
// The "bubble": the new theme grows as a circle from the switch over the old one.
// It uses the browser's View Transitions API. Without it, or for someone who asked
// for less motion, the theme simply changes at once.

export const BUBBLE_MS = 600;

interface ViewTransitionLike {
    ready: Promise<void>;
}

type TransitionDocument = Document & { startViewTransition?: (update: () => void) => ViewTransitionLike };

const prefersReducedMotion = () =>
    typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function runThemeTransition(update: () => void, origin?: { x: number; y: number }): void {
    const doc = document as TransitionDocument;
    if (typeof doc.startViewTransition !== "function" || prefersReducedMotion()) {
        update();
        return;
    }

    const x = origin?.x ?? window.innerWidth / 2;
    const y = origin?.y ?? window.innerHeight / 2;
    // Far enough to cover the farthest corner of the window.
    const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));

    const transition = doc.startViewTransition(update);
    transition.ready
        .then(() => {
            document.documentElement.animate(
                { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
                { duration: BUBBLE_MS, easing: "ease-in-out", pseudoElement: "::view-transition-new(root)" },
            );
        })
        // A skipped transition still leaves the theme changed: the update already ran.
        .catch(() => undefined);
}
