"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import PricingMatrixView from "./components/PricingMatrixView";

export default function ProductPricingModule() {
  return (
    <Card className="flex min-h-0 flex-1 flex-col rounded-2xl shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-xl">Product Pricing</CardTitle>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col">
        <PricingMatrixView />
      </CardContent>
    </Card>
  );
}
