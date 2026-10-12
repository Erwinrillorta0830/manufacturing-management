"use client";

import * as React from "react";
import { ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface BackToTopButtonProps {
    threshold?: number;
    targetRef?: React.RefObject<HTMLElement | null>;
    className?: string;
}

export const BackToTopButton = React.memo(function BackToTopButton({
    threshold = 400,
    targetRef,
    className
}: BackToTopButtonProps) {
    const [visible, setVisible] = React.useState(false);
    const scrollContainerRef = React.useRef<HTMLElement | Window | null>(null);
    const tickingRef = React.useRef(false);
    const buttonRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        const findScrollParent = (node: HTMLElement | null): HTMLElement | Window => {
            if (!node) return window;
            let parent = node.parentElement;
            while (parent) {
                const style = window.getComputedStyle(parent);
                if (style.overflowY === "auto" || style.overflowY === "scroll") {
                    return parent;
                }
                parent = parent.parentElement;
            }
            return window;
        };

        const target = findScrollParent(targetRef?.current || buttonRef.current);
        scrollContainerRef.current = target;

        const updateVisibility = () => {
            const currentScrollY =
                target instanceof Window
                    ? window.scrollY
                    : target.scrollTop;

            setVisible(prev => {
                const shouldBeVisible = currentScrollY > threshold;
                return prev !== shouldBeVisible ? shouldBeVisible : prev;
            });
            tickingRef.current = false;
        };

        const handleScroll = () => {
            if (!tickingRef.current) {
                tickingRef.current = true;
                requestAnimationFrame(updateVisibility);
            }
        };

        target.addEventListener("scroll", handleScroll, { passive: true });
        window.addEventListener("scroll", handleScroll, { passive: true });

        // Initial check
        handleScroll();

        return () => {
            target.removeEventListener("scroll", handleScroll);
            window.removeEventListener("scroll", handleScroll);
        };
    }, [threshold, targetRef]);

    const scrollToTop = React.useCallback(() => {
        const target =
            scrollContainerRef.current && !(scrollContainerRef.current instanceof Window)
                ? (scrollContainerRef.current as HTMLElement)
                : (document.scrollingElement as HTMLElement || document.documentElement);

        const startPosition = Math.max(target.scrollTop || 0, window.scrollY || 0);
        if (startPosition <= 0) return;

        const duration = 450;
        const startTime = performance.now();

        // Cubic ease-out deceleration curve
        const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

        const step = (currentTime: number) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const ease = easeOutCubic(progress);

            const nextPos = Math.round(startPosition * (1 - ease));
            if (target && target.scrollTop !== undefined) {
                target.scrollTop = nextPos;
            }
            window.scrollTo(0, nextPos);

            if (progress < 1) {
                requestAnimationFrame(step);
            }
        };

        requestAnimationFrame(step);
    }, []);

    return (
        <div
            ref={buttonRef}
            className={cn(
                "fixed bottom-6 right-6 z-50 transition-all duration-300 ease-out transform-gpu will-change-transform pointer-events-none",
                visible
                    ? "opacity-100 translate-y-0 scale-100 pointer-events-auto"
                    : "opacity-0 translate-y-4 scale-90",
                className
            )}
        >
            <Button
                type="button"
                size="icon"
                onClick={scrollToTop}
                className="h-11 w-11 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-transform duration-150 border border-primary/20 cursor-pointer"
                title="Back to top"
                aria-label="Back to top"
            >
                <ArrowUp className="h-5 w-5" />
            </Button>
        </div>
    );
});
