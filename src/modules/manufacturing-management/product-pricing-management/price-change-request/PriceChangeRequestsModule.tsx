"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import PriceChangeRequestsView from "./components/PriceChangeRequestsView";

export default function PriceChangeRequestsModule() {
  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-xl">Price Change Approvals</CardTitle>
      </CardHeader>
      <CardContent>
        <PriceChangeRequestsView />
      </CardContent>
    </Card>
  );
}
