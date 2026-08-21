"use client";

import * as React from "react";

import { countOffPageSelectedKeys, visibleSelectionKeysOnPage } from "../utils/selectionScope";

type RowWithRequestId = {
    request_id?: number | string | null;
};

type SnapshotWithRequestId = {
    request_id: number;
};

type Options<TRow extends RowWithRequestId, TSnapshot extends SnapshotWithRequestId> = {
    rows: TRow[];
    isSelectable: (row: TRow) => boolean;
    toSnapshot: (row: TRow) => TSnapshot;
    getRowKey?: (row: TRow) => string;
};

function defaultRowKey(row: RowWithRequestId): string {
    return String(Number(row.request_id));
}

export function useRequestBulkSelection<
    TRow extends RowWithRequestId,
    TSnapshot extends SnapshotWithRequestId,
>({ rows, isSelectable, toSnapshot, getRowKey = defaultRowKey }: Options<TRow, TSnapshot>) {
    const [selectionMap, setSelectionMap] = React.useState<Map<string, TSnapshot>>(() => new Map());

    const resolveRowKey = React.useCallback(
        (row: TRow) => getRowKey(row),
        [getRowKey],
    );

    const selectableRowsOnPage = React.useMemo(
        () => rows.filter(isSelectable),
        [rows, isSelectable],
    );

    const visiblePageKeys = React.useMemo(
        () => visibleSelectionKeysOnPage(rows, getRowKey),
        [rows, getRowKey],
    );

    const selectedKeys = React.useMemo(() => Array.from(selectionMap.keys()), [selectionMap]);
    const selectedSnapshots = React.useMemo(() => Array.from(selectionMap.values()), [selectionMap]);
    const selectedIds = React.useMemo(
        () => selectedSnapshots.map((snapshot) => snapshot.request_id),
        [selectedSnapshots],
    );

    const offPageSelectedCount = React.useMemo(
        () => countOffPageSelectedKeys(selectedKeys, visiblePageKeys),
        [selectedKeys, visiblePageKeys],
    );

    const onPageSelectedCount = React.useMemo(
        () => selectedKeys.filter((key) => visiblePageKeys.has(key)).length,
        [selectedKeys, visiblePageKeys],
    );

    const toggleSelect = React.useCallback(
        (key: string, checked: boolean, row?: TRow) => {
            setSelectionMap((prev) => {
                const next = new Map(prev);
                if (checked) {
                    if (row) {
                        next.set(key, toSnapshot(row));
                    }
                } else {
                    next.delete(key);
                }
                return next;
            });
        },
        [toSnapshot],
    );

    const toggleSelectAllPage = React.useCallback(
        (checked: boolean) => {
            setSelectionMap((prev) => {
                const next = new Map(prev);
                if (checked) {
                    for (const row of selectableRowsOnPage) {
                        const key = resolveRowKey(row);
                        next.set(key, toSnapshot(row));
                    }
                } else {
                    for (const row of selectableRowsOnPage) {
                        next.delete(resolveRowKey(row));
                    }
                }
                return next;
            });
        },
        [resolveRowKey, selectableRowsOnPage, toSnapshot],
    );

    const clearSelection = React.useCallback(() => {
        setSelectionMap(new Map());
    }, []);

    const removeSelectionKeys = React.useCallback((keys: string[]) => {
        if (keys.length === 0) return;
        setSelectionMap((prev) => {
            const next = new Map(prev);
            for (const key of keys) {
                next.delete(key);
            }
            return next;
        });
    }, []);

    const removeSelectionIds = React.useCallback((ids: number[]) => {
        if (ids.length === 0) return;
        const idSet = new Set(ids);
        setSelectionMap((prev) => {
            const next = new Map(prev);
            for (const [key, snapshot] of prev) {
                if (idSet.has(snapshot.request_id)) {
                    next.delete(key);
                }
            }
            return next;
        });
    }, []);

    return {
        selectionMap,
        selectedKeys,
        selectedIds,
        selectedSnapshots,
        offPageSelectedCount,
        onPageSelectedCount,
        toggleSelect,
        toggleSelectAllPage,
        clearSelection,
        removeSelectionKeys,
        removeSelectionIds,
        resolveRowKey,
    };
}
