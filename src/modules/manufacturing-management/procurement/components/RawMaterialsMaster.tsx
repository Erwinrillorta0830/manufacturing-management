"use client";

import React from "react";
import RawMaterialsModule from "../raw-materials/RawMaterialsModule";
import { RawMaterial, Supplier, RegisterRawMaterialPayload, PackagingVariant } from "../types";

interface RawMaterialsMasterProps {
    rawMaterials: RawMaterial[];
    suppliers: Supplier[];
    loadingItems: boolean;
    onRegisterRawMaterial: (productDetails: RegisterRawMaterialPayload, supplierIds: number[], packagingVariants?: PackagingVariant[]) => Promise<boolean>;
    onUpdateRawMaterial: (productId: number, productDetails: RegisterRawMaterialPayload, supplierIds: number[], packagingVariants?: PackagingVariant[]) => Promise<boolean>;
}

export default function RawMaterialsMaster(props: RawMaterialsMasterProps) {
    return <RawMaterialsModule {...props} />;
}
