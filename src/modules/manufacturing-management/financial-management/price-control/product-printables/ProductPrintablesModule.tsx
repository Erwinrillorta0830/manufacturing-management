// src/modules/financial-management/printables-management/product-printables/ProductPrintablesModule.tsx
"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ProductPrintablesView from "./components/ProductPrintablesView";

export default function ProductPrintablesModule({ userName }: { userName?: string }) {
    return <ProductPrintablesView userName={userName} />;
}
