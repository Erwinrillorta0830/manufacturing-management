export async function fetchEligibleOrders() {
    const res = await fetch("/api/manufacturing/procurement/shipments");
    if (!res.ok) throw new Error("Failed to fetch purchase orders");
    const data = await res.json();
    return Array.isArray(data) ? data : data?.data || [];
}

export async function fetchPurchaseAmountDetails(poId: number) {
    const res = await fetch(`/api/manufacturing/procurement/amount-posting?poId=${poId}`);
    if (!res.ok) throw new Error("Failed to fetch amount posting details");
    return res.json();
}

export async function postPurchaseAmounts(payload: Record<string, unknown>) {
    const res = await fetch("/api/manufacturing/procurement/amount-posting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to post purchase amounts");
    return data;
}
