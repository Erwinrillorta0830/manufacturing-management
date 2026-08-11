"use client";

import * as React from "react";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { PRICE_MAX_DECIMAL_PLACES, parseDecimalInput } from "../../shared/pricePrecision";

type PriceTypeRow = { price_type_id: number; price_type_name: string };

function money(v: unknown): string {
    const n = Number(v);
    if (!Number.isFinite(n)) return "—";
    return n.toLocaleString("en-PH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: PRICE_MAX_DECIMAL_PLACES,
    });
}

async function createPCR(payload: {
    product_id: number;
    price_type_id: number;
    proposed_price: number;
}) {
    const res = await fetch("/api/scm/product-pricing/price-change-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        cache: "no-store",
    });

    const text = await res.text().catch(() => "");
    if (!res.ok) {
        try {
            const parsed: unknown = JSON.parse(text);
            const message =
                typeof parsed === "object" && parsed !== null
                    ? "error" in parsed && typeof parsed.error === "string"
                        ? parsed.error
                        : "details" in parsed && typeof parsed.details === "string"
                            ? parsed.details
                            : "Failed to create request"
                    : "Failed to create request";

            throw new Error(message);
        } catch {
            throw new Error(text || "Failed to create request");
        }
    }

    return text ? (JSON.parse(text) as unknown) : {};
}

export default function RequestPriceChangeDialog(props: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    product: { product_id: number; product_code?: string; product_name?: string };
    priceType: PriceTypeRow;
    currentPrice: number | null;
    onCreated?: () => void;
}) {
    const [proposed, setProposed] = React.useState<string>("");
    const [saving, setSaving] = React.useState(false);

    React.useEffect(() => {
        if (props.open) {
            setProposed(props.currentPrice == null ? "" : String(props.currentPrice));
        } else {
            setProposed("");
            setSaving(false);
        }
    }, [props.open, props.currentPrice]);

    const parsedProposed = parseDecimalInput(proposed, PRICE_MAX_DECIMAL_PLACES);
    const proposedNum = parsedProposed.value;
    const canSave =
        props.product.product_id > 0 &&
        props.priceType.price_type_id > 0 &&
        proposed.trim() !== "" &&
        proposedNum !== null &&
        !parsedProposed.error;

    const submit = async () => {
        const price = parsedProposed.value;
        if (!canSave || price === null) {
            toast.error("Please enter a valid proposed price.");
            return;
        }

        setSaving(true);
        try {
            await createPCR({
                product_id: props.product.product_id,
                price_type_id: props.priceType.price_type_id,
                proposed_price: price,
            });

            toast.success("Price change request created.");
            props.onOpenChange(false);
            props.onCreated?.();
        } catch (error: unknown) {
            toast.error(error instanceof Error ? error.message : "Failed to create request");
        } finally {
            setSaving(false);
        }
    };

    const code = (props.product.product_code ?? "").toString();
    const name = (props.product.product_name ?? "").toString();
    const productLabel = [code, name].filter(Boolean).join(" - ");

    return (
        <Dialog open={props.open} onOpenChange={props.onOpenChange}>
            <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>Request Price Change</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="space-y-1">
                        <Label>Product</Label>
                        <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                            {productLabel || `#${props.product.product_id}`}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <div className="space-y-1">
                            <Label>Price Type</Label>
                            <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                                {props.priceType.price_type_name}
                            </div>
                        </div>

                        <div className="space-y-1">
                            <Label>Current (PHP)</Label>
                            <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                                {money(props.currentPrice)}
                            </div>
                        </div>

                        <div className="space-y-1">
                            <Label>Proposed (PHP)</Label>
                            <Input
                                value={proposed}
                                onChange={(e) => setProposed(e.target.value)}
                                inputMode="decimal"
                                placeholder="0.00"
                            />
                        </div>
                    </div>

                    <Separator />

                    <div className="flex justify-end gap-2">
                        <Button
                            variant="outline"
                            onClick={() => props.onOpenChange(false)}
                            disabled={saving}
                        >
                            Cancel
                        </Button>
                        <Button onClick={submit} disabled={!canSave || saving}>
                            {saving ? "Creating..." : "Create Request"}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
