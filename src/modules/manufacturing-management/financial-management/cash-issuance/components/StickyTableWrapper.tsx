"use client";

import React, { useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

/**
 * Wraps a shadcn <Table> and neutralizes its inner `overflow-x-auto` wrapper
 * so that `position: sticky` on <TableHeader> actually works.
 *
 * Usage:
 *   <StickyTableWrapper className="overflow-auto max-h-[65vh]">
 *     <Table>
 *       <TableHeader className="sticky top-0 z-10 bg-muted ...">
 *       ...
 *     </Table>
 *   </StickyTableWrapper>
 */
export function StickyTableWrapper({
    children,
    className,
}: {
    children: React.ReactNode;
    className?: string;
}) {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = ref.current?.querySelector<HTMLElement>(
            '[data-slot="table-container"]'
        );
        if (el) {
            el.style.overflow = "visible";
        }
    });

    return (
        <div ref={ref} className={cn(className)}>
            {children}
        </div>
    );
}
