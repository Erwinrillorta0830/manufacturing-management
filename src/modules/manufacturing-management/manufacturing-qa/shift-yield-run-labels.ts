export interface ShiftYieldRunEntry {
    id?: string | number | null;
    ledger_id?: string | number | null;
    job_order_id?: string | number | null;
    job_order_no?: string | null;
    shift_name?: string | null;
    logged_at?: string | null;
}

interface ParsedShiftName {
    productionDay: string;
    shift: string;
    descriptor: string;
}

function parseShiftName(value: string): ParsedShiftName | null {
    const match = value.trim().match(/^Day\s+(\d+)\s*[-•]\s*(Shift\s+\d+)(?:\s*[-•]\s*(.+?))?\s*$/i);
    if (!match) return null;

    const descriptor = (match[3] || "").trim();
    return {
        productionDay: match[1],
        shift: match[2],
        descriptor: descriptor.toLowerCase() === "day" ? "" : descriptor
    };
}

function entryIdentity(entry: ShiftYieldRunEntry, index: number): string {
    const id = entry.ledger_id ?? entry.id;
    return id == null ? `row-${index}` : String(id);
}

function jobOrderIdentity(entry: ShiftYieldRunEntry, index: number): string {
    const jobOrder = entry.job_order_id ?? entry.job_order_no;
    return jobOrder == null || String(jobOrder).trim() === "" ? `row-${index}` : String(jobOrder).toLowerCase();
}

function compareEntries(
    left: { entry: ShiftYieldRunEntry; index: number },
    right: { entry: ShiftYieldRunEntry; index: number }
): number {
    const leftTime = Date.parse(String(left.entry.logged_at || ""));
    const rightTime = Date.parse(String(right.entry.logged_at || ""));

    if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
        return leftTime - rightTime;
    }

    const leftTimestamp = String(left.entry.logged_at || "");
    const rightTimestamp = String(right.entry.logged_at || "");
    const timestampOrder = leftTimestamp.localeCompare(rightTimestamp);
    if (timestampOrder !== 0) return timestampOrder;

    const leftId = left.entry.ledger_id ?? left.entry.id;
    const rightId = right.entry.ledger_id ?? right.entry.id;
    const numericIdOrder = Number(leftId) - Number(rightId);
    if (leftId != null && rightId != null && Number.isFinite(numericIdOrder) && numericIdOrder !== 0) {
        return numericIdOrder;
    }

    return entryIdentity(left.entry, left.index).localeCompare(entryIdentity(right.entry, right.index), undefined, { numeric: true })
        || left.index - right.index;
}

export function buildShiftYieldRunLabels(entries: readonly ShiftYieldRunEntry[]): WeakMap<ShiftYieldRunEntry, string> {
    const labels = new WeakMap<ShiftYieldRunEntry, string>();
    const groups = new Map<string, Array<{ entry: ShiftYieldRunEntry; index: number; parsed: ParsedShiftName }>>();

    entries.forEach((entry, index) => {
        const rawShiftName = String(entry.shift_name || "").trim();
        const parsed = parseShiftName(rawShiftName);
        if (!parsed) {
            labels.set(entry, rawShiftName || "Shift not specified");
            return;
        }

        const groupKey = [
            jobOrderIdentity(entry, index),
            parsed.productionDay.toLowerCase(),
            parsed.shift.toLowerCase(),
            parsed.descriptor.toLowerCase()
        ].join("|");
        const group = groups.get(groupKey) || [];
        group.push({ entry, index, parsed });
        groups.set(groupKey, group);
    });

    groups.forEach((group) => {
        group.sort(compareEntries);
        group.forEach(({ entry, parsed }, index) => {
            const descriptor = parsed.descriptor ? ` - ${parsed.descriptor}` : "";
            labels.set(entry, `Day ${parsed.productionDay} • ${parsed.shift}${descriptor} (Run ${index + 1})`);
        });
    });

    return labels;
}
