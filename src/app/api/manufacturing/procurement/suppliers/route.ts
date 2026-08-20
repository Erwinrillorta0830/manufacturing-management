import { NextResponse } from "next/server";
import { fetchSuppliers, fetchSuppliersPage, createSupplier, SupplierCurrencyValidationError, updateSupplier } from "./suppliers-helper";
import type { SupplierForeignFilter, SupplierStatusFilter } from "./suppliers-helper";
import {
    SupplierCountryValidationError,
    canonicalizeSupplierCountry
} from "@/modules/manufacturing-management/procurement/supplier-country";

export async function GET(request: Request) {
    try {
        const searchParams = new URL(request.url).searchParams;
        const status = searchParams.get("status") || "active";
        if (status !== "active" && status !== "inactive" && status !== "all") {
            return NextResponse.json({ error: "status must be active, inactive, or all" }, { status: 400 });
        }

        const pageParam = searchParams.get("page");
        const pageSizeParam = searchParams.get("pageSize");
        if (pageParam !== null || pageSizeParam !== null) {
            const foreign = searchParams.get("foreign") || "all";
            if (foreign !== "all" && foreign !== "local" && foreign !== "foreign") {
                return NextResponse.json({ error: "foreign must be all, local, or foreign" }, { status: 400 });
            }

            const page = pageParam === null ? 1 : Number(pageParam);
            const pageSize = pageSizeParam === null ? 10 : Number(pageSizeParam);
            if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1) {
                return NextResponse.json({ error: "page and pageSize must be positive integers" }, { status: 400 });
            }

            const result = await fetchSuppliersPage(
                status as SupplierStatusFilter,
                searchParams.get("search") || "",
                foreign as SupplierForeignFilter,
                page,
                pageSize
            );
            return NextResponse.json(result);
        }

        const suppliers = await fetchSuppliers(status as SupplierStatusFilter);
        return NextResponse.json(suppliers);
    } catch (e) {
        console.error("API Error fetching suppliers:", e);
        return NextResponse.json({ error: (e as Error).message || "Failed to fetch suppliers" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        if (!body.supplier_name) {
            return NextResponse.json({ error: "supplier_name is required" }, { status: 400 });
        }
        body.country = canonicalizeSupplierCountry(body.country);
        const supplier = await createSupplier(body);
        return NextResponse.json({ success: true, supplier });
    } catch (e) {
        if (e instanceof SupplierCountryValidationError || e instanceof SupplierCurrencyValidationError) {
            return NextResponse.json({ error: e.message }, { status: 400 });
        }
        console.error("API Error creating supplier:", e);
        return NextResponse.json({ error: (e as Error).message || "Failed to create supplier" }, { status: 500 });
    }
}

export async function PATCH(request: Request) {
    try {
        const body = await request.json();
        const { id, ...data } = body;
        if (!id) {
            return NextResponse.json({ error: "Supplier ID is required" }, { status: 400 });
        }
        if (Object.prototype.hasOwnProperty.call(data, "country")) {
            data.country = canonicalizeSupplierCountry(data.country);
        }
        const supplier = await updateSupplier(id, data);
        return NextResponse.json({ success: true, supplier });
    } catch (e) {
        if (e instanceof SupplierCountryValidationError || e instanceof SupplierCurrencyValidationError) {
            return NextResponse.json({ error: e.message }, { status: 400 });
        }
        console.error("API Error updating supplier:", e);
        return NextResponse.json({ error: (e as Error).message || "Failed to update supplier" }, { status: 500 });
    }
}
