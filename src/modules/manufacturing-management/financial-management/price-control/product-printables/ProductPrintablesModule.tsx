// src/modules/financial-management/printables-management/product-printables/ProductPrintablesModule.tsx
"use client";

import * as React from "react";
import ProductPrintablesView from "./components/ProductPrintablesView";

export default function ProductPrintablesModule({ userName }: { userName?: string }) {
    return <ProductPrintablesView userName={userName} />;
}
