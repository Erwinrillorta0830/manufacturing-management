import { formatPhtDateTime } from "@/app/api/manufacturing/directus-api";

export interface PurchaseOrderCreationTimestamps {
    dateEncoded: string;
    date: string;
    time: string;
    datetime: string;
    year: number;
}

/**
 * Builds the denormalized purchase-order creation fields from one instant.
 * The purchase_order columns are persisted as Philippine-time wall-clock values.
 */
export function getPurchaseOrderCreationTimestamps(now = new Date()): PurchaseOrderCreationTimestamps {
    const datetime = formatPhtDateTime(now);
    const [date, time] = datetime.split(" ");

    return {
        dateEncoded: datetime,
        date,
        time,
        datetime,
        year: Number(date.slice(0, 4))
    };
}
