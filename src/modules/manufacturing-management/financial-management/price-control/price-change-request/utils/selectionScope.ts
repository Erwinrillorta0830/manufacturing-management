type RowWithRequestId = {
    request_id?: number | string | null;
};

export function visibleRequestIdsOnPage(rows: RowWithRequestId[]): Set<number> {
    const ids = new Set<number>();
    for (const row of rows) {
        const id = Number(row.request_id);
        if (Number.isFinite(id)) {
            ids.add(id);
        }
    }
    return ids;
}

export function countOffPageSelected(selectedIds: number[], visiblePageIds: Set<number>): number {
    return selectedIds.filter((id) => !visiblePageIds.has(id)).length;
}

export function visibleSelectionKeysOnPage<TRow extends RowWithRequestId>(
    rows: TRow[],
    getRowKey: (row: TRow) => string,
): Set<string> {
    const keys = new Set<string>();
    for (const row of rows) {
        keys.add(getRowKey(row));
    }
    return keys;
}

export function countOffPageSelectedKeys(selectedKeys: string[], visiblePageKeys: Set<string>): number {
    return selectedKeys.filter((key) => !visiblePageKeys.has(key)).length;
}
