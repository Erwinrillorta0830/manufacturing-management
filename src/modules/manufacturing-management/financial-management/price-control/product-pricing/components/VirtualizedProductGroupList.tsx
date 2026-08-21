/* eslint-disable react-hooks/incompatible-library */
"use client";

import * as React from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

import { cn } from "@/lib/utils";

type VirtualizedProductGroupListBaseProps<TRow> = {
    rows: TRow[];
    listKey: string;
    estimateItemSize: (row: TRow, index: number) => number;
    getItemKey?: (row: TRow, index: number) => string;
    loading?: boolean;
    className?: string;
    itemClassName?: string;
};

type VirtualizedProductGroupListListProps<TRow> = VirtualizedProductGroupListBaseProps<TRow> & {
    columnsPerRow?: 1;
    renderItem: (row: TRow, index: number) => React.ReactNode;
    renderRow?: never;
};

type VirtualizedProductGroupListGridProps<TRow> = VirtualizedProductGroupListBaseProps<TRow> & {
    columnsPerRow: number;
    renderRow: (rows: TRow[], startIndex: number) => React.ReactNode;
    renderItem?: never;
};

type VirtualizedProductGroupListProps<TRow> =
    | VirtualizedProductGroupListListProps<TRow>
    | VirtualizedProductGroupListGridProps<TRow>;

function getRowChunk<TRow>(rows: TRow[], rowIndex: number, columnsPerRow: number): TRow[] {
    const start = rowIndex * columnsPerRow;
    return rows.slice(start, start + columnsPerRow);
}

export default function VirtualizedProductGroupList<TRow>(props: VirtualizedProductGroupListProps<TRow>) {
    "use no memo";

    const {
        rows,
        listKey,
        estimateItemSize,
        getItemKey,
        loading = false,
        className,
        itemClassName,
    } = props;

    const columnsPerRow = props.columnsPerRow ?? 1;
    const isGridMode = columnsPerRow > 1;
    const renderRow = "renderRow" in props ? props.renderRow : undefined;
    const renderItem = "renderItem" in props ? props.renderItem : undefined;

    const parentRef = React.useRef<HTMLDivElement>(null);

    const virtualRowCount = React.useMemo(
        () => (rows.length > 0 ? Math.ceil(rows.length / columnsPerRow) : 0),
        [rows.length, columnsPerRow],
    );

    const estimateSize = React.useCallback(
        (index: number) => {
            if (isGridMode) {
                const chunk = getRowChunk(rows, index, columnsPerRow);
                if (chunk.length === 0) return 200;

                const heights = chunk.map((row, chunkIndex) => {
                    const sourceIndex = index * columnsPerRow + chunkIndex;
                    return estimateItemSize(row, sourceIndex);
                });

                return Math.max(...heights, 200);
            }

            const row = rows[index];
            if (row == null) return 200;
            return estimateItemSize(row, index);
        },
        [rows, estimateItemSize, columnsPerRow, isGridMode],
    );

    const virtualizer = useVirtualizer({
        count: virtualRowCount,
        getScrollElement: () => parentRef.current,
        estimateSize,
        overscan: 4,
        getItemKey: (index) => {
            if (isGridMode) {
                const chunk = getRowChunk(rows, index, columnsPerRow);
                return chunk
                    .map((row, chunkIndex) => {
                        const sourceIndex = index * columnsPerRow + chunkIndex;
                        return getItemKey?.(row, sourceIndex) ?? String(sourceIndex);
                    })
                    .join("-");
            }

            const row = rows[index];
            if (row == null) return String(index);
            return getItemKey?.(row, index) ?? String(index);
        },
    });
    const scrollToTopRef = React.useRef(virtualizer.scrollToIndex);
    scrollToTopRef.current = virtualizer.scrollToIndex;

    React.useEffect(() => {
        scrollToTopRef.current(0, { align: "start" });
        parentRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    }, [listKey]);

    return (
        <div
            ref={parentRef}
            className={cn(
                "min-h-[480px] max-h-[calc(100dvh-22rem)] flex-1 overflow-y-auto pt-3",
                loading && rows.length > 0 && "pmx-loading-row",
                className,
            )}
        >
            <div
                className="relative w-full"
                style={{ height: virtualRowCount > 0 ? virtualizer.getTotalSize() : undefined }}
            >
                {virtualizer.getVirtualItems().map((virtualRow) => {
                    const startIndex = virtualRow.index * columnsPerRow;

                    if (isGridMode) {
                        const chunk = getRowChunk(rows, virtualRow.index, columnsPerRow);
                        if (chunk.length === 0 || !renderRow) return null;

                        return (
                            <div
                                key={virtualRow.key}
                                data-index={virtualRow.index}
                                ref={virtualizer.measureElement}
                                className={cn("absolute left-0 top-0 w-full", itemClassName)}
                                style={{ transform: `translateY(${virtualRow.start}px)` }}
                            >
                                {renderRow(chunk, startIndex)}
                            </div>
                        );
                    }

                    const row = rows[virtualRow.index];
                    if (row == null || !renderItem) return null;

                    return (
                        <div
                            key={virtualRow.key}
                            data-index={virtualRow.index}
                            ref={virtualizer.measureElement}
                            className={cn("absolute left-0 top-0 w-full", itemClassName)}
                            style={{ transform: `translateY(${virtualRow.start}px)` }}
                        >
                            {renderItem(row, virtualRow.index)}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
