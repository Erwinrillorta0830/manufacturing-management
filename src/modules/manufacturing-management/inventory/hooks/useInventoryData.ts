import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { InventoryData } from "../types/inventory.types";
import { fetchInventoryData } from "../services/inventory.service";

export function useInventoryData() {
    const [data, setData] = useState<InventoryData | null>(null);
    const [loading, setLoading] = useState(true);
    const [flashStates, setFlashStates] = useState<Record<number, "up" | "down">>({});
    const prevStocksRef = useRef<Record<number, number>>({});

    const loadInventoryData = async () => {
        setLoading(true);
        try {
            const inventoryData = await fetchInventoryData();
            setData(inventoryData);
        } catch (e: any) {
            toast.error(e.message || "Failed to load inventory.");
        } finally {
            setLoading(false);
        }
    };

    // WebSocket realtime connection & Polling fallback
    useEffect(() => {
        loadInventoryData();

        let ws: WebSocket | null = null;
        let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
        let isDisposed = false;
        let reconnectAttempts = 0;

        const connectWebSocket = () => {
            if (isDisposed) return;
            if (reconnectAttempts >= 10) {
                console.warn("[Directus Realtime] Maximum reconnect attempts reached (10). Standing by.");
                return;
            }

            try {
                const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_DIRECTUS_URL || "";
                const wsUrl = `${baseUrl.replace(/^http/, "ws")}/websocket`;

                ws = new WebSocket(wsUrl);

                ws.onopen = () => {
                    console.log("[Directus Realtime] Connected to WebSocket");
                    reconnectAttempts = 0;
                    ws?.send(JSON.stringify({
                        type: "auth",
                        access_token: "test"
                    }));
                };

                ws.onmessage = (event) => {
                    try {
                        const msg = JSON.parse(event.data);

                        if (msg.type === "auth" && msg.status === "ok") {
                            console.log("[Directus Realtime] Authenticated successfully");
                            ws?.send(JSON.stringify({
                                type: "subscribe",
                                collection: "inventory_movements",
                                query: { fields: ["*"] }
                            }));
                            ws?.send(JSON.stringify({
                                type: "subscribe",
                                collection: "product_ledger",
                                query: { fields: ["*"] }
                            }));
                        }

                        if (msg.type === "subscription" && (msg.event === "create" || msg.event === "update" || msg.event === "delete")) {
                            console.log(`[Directus Realtime] Event detected (${msg.event} on ${msg.collection}). Refreshing dashboard...`);
                            fetch("/api/manufacturing/inventory")
                                .then(res => res.ok ? res.json() : null)
                                .then(json => {
                                    if (json) setData(json);
                                })
                                .catch(() => { });
                        }
                    } catch (e) {
                        console.error("[Directus Realtime] Error parsing WebSocket message:", e);
                    }
                };

                ws.onclose = () => {
                    ws = null;
                    if (!isDisposed && reconnectAttempts < 10) {
                        reconnectAttempts++;
                        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
                        reconnectTimeout = setTimeout(connectWebSocket, delay);
                    }
                };

                ws.onerror = (errorEvent) => {
                    const errorMessage = errorEvent instanceof Error ? errorEvent.message : "Connection refused or network down";
                    console.warn("[Directus Realtime] WebSocket unavailable:", errorMessage);
                };

            } catch {
                if (!isDisposed && reconnectAttempts < 10) {
                    reconnectAttempts++;
                    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
                    reconnectTimeout = setTimeout(connectWebSocket, delay);
                }
            }
        };

        connectWebSocket();

        const pollInterval = setInterval(() => {
            if (document.visibilityState === "visible") {
                fetch("/api/manufacturing/inventory")
                    .then(res => res.ok ? res.json() : null)
                    .then(json => {
                        if (json) setData(json);
                    })
                    .catch(() => { });
            }
        }, 10000);

        return () => {
            isDisposed = true;
            if (ws) ws.close();
            if (reconnectTimeout) clearTimeout(reconnectTimeout);
            clearInterval(pollInterval);
        };
    }, []);

    // Flash states animation comparison logic
    useEffect(() => {
        if (!data) return;
        const { ledger } = data;

        const newStocks: Record<number, number> = {};
        ledger.forEach((entry: any) => {
            const pId = Number(entry.productId || entry.product_id);
            const qty = Number(entry.quantity) || 0;
            newStocks[pId] = (newStocks[pId] || 0) + qty;
        });

        const newFlashStates: Record<number, "up" | "down"> = {};
        let hasChanges = false;

        Object.entries(newStocks).forEach(([pIdStr, newQty]) => {
            const pId = Number(pIdStr);
            const oldQty = prevStocksRef.current[pId];
            if (oldQty !== undefined && oldQty !== newQty) {
                newFlashStates[pId] = newQty > oldQty ? "up" : "down";
                hasChanges = true;

                const prod = data.products.find((p: any) => Number(p.product_id) === pId);
                const prodName = prod ? prod.product_name : `Product #${pId}`;
                const diff = Math.abs(newQty - oldQty);
                if (newQty > oldQty) {
                    toast.success(`Stock increased for ${prodName} (+${diff.toLocaleString()})`);
                } else {
                    toast.info(`Stock decreased for ${prodName} (-${diff.toLocaleString()})`);
                }
            }
        });

        if (hasChanges) {
            setFlashStates(prev => ({ ...prev, ...newFlashStates }));
            const timer = setTimeout(() => {
                setFlashStates(prev => {
                    const next = { ...prev };
                    Object.keys(newFlashStates).forEach(k => {
                        delete next[Number(k)];
                    });
                    return next;
                });
            }, 2500);

            return () => clearTimeout(timer);
        }

        prevStocksRef.current = newStocks;
    }, [data]);

    return {
        data,
        loading,
        flashStates,
        loadInventoryData
    };
}
