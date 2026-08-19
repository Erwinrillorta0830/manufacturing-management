"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import PriceChangeRequestsView from "../price-change-request/components/PriceChangeRequestsView";

export function PriceChangeMonitoringModule() {
    return (
        <Card className="rounded-2xl shadow-sm">
            <CardHeader className="pb-3">
                <CardTitle className="text-xl">Price Change Monitoring</CardTitle>
            </CardHeader>
            <CardContent>
                <PriceChangeRequestsView
                    mode="monitoring"
                    returnPath="/fm/price-control/price-change-monitoring"
                />
            </CardContent>
        </Card>
    );
}
