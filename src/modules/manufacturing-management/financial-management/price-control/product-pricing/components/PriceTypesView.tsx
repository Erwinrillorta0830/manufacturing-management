"use client";

import * as React from "react";
import { usePriceTypes } from "../hooks/usePriceTypes";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function PriceTypesView() {
    const { loading, priceTypes } = usePriceTypes();

    if (loading) return <Skeleton className="h-40 w-full rounded-2xl" />;

    return (
        <Card className="rounded-2xl p-3 shadow-sm">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Tier</TableHead>
                        <TableHead>Sort</TableHead>
                        <TableHead>ID</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {priceTypes.map((t) => (
                        <TableRow key={t.price_type_id}>
                            <TableCell className="font-medium">{t.price_type_name}</TableCell>
                            <TableCell>{t.sort ?? "—"}</TableCell>
                            <TableCell>{t.price_type_id}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </Card>
    );
}
