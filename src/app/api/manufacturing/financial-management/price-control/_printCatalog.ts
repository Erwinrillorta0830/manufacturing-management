import type { ProductCatalogFilters } from "./_productGroups";

export type PrintCatalogQuery = ProductCatalogFilters & {
    supplierScope: "ALL" | "LINKED_ONLY";
    supplierIdsRaw: string[];
};

function norm(v: string | null) {
    const s = (v ?? "").trim();
    if (!s || s === "undefined" || s === "null") return "";
    return s;
}

function splitCsv(v: string): string[] {
    return v
        .split(",")
        .map((x) => x.trim())
        .filter((x) => !!x && x !== "undefined" && x !== "null");
}

export function parsePrintCatalogQuery(searchParams: URLSearchParams): PrintCatalogQuery {
    const q = norm(searchParams.get("q"));

    const categoryIds = (() => {
        const multi = norm(searchParams.get("category_ids"));
        if (multi) return splitCsv(multi);
        const single = norm(searchParams.get("category_id"));
        return single ? [single] : [];
    })();

    const brandIds = (() => {
        const multi = norm(searchParams.get("brand_ids"));
        if (multi) return splitCsv(multi);
        const single = norm(searchParams.get("brand_id"));
        return single ? [single] : [];
    })();

    const unitIds = (() => {
        const multi = norm(searchParams.get("unit_ids"));
        if (multi) return splitCsv(multi);
        const single = norm(searchParams.get("unit_id"));
        return single ? [single] : [];
    })();

    const supplierScope = (norm(searchParams.get("supplier_scope")) || "ALL") as "ALL" | "LINKED_ONLY";

    const supplierIdsRaw = (() => {
        const multi = norm(searchParams.get("supplier_ids"));
        if (multi) return splitCsv(multi);
        const single = norm(searchParams.get("supplier_id"));
        return single ? [single] : [];
    })();

    const activeOnly = norm(searchParams.get("active_only") || "1") === "1";
    const missingTier = norm(searchParams.get("missing_tier") || "0") === "1";

    return {
        q,
        categoryIds,
        brandIds,
        unitIds,
        activeOnly,
        missingTier,
        supplierScope,
        supplierIdsRaw,
    };
}

export function parseGroupIdsParam(raw: string | null): number[] {
    if (!raw) return [];

    return Array.from(
        new Set(
            raw
                .split(",")
                .map((s) => Number(s.trim()))
                .filter((n) => Number.isFinite(n) && n > 0),
        ),
    );
}
