import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const sourceRoot = fileURLToPath(new URL("../../../../../", import.meta.url));
registerHooks({
    resolve(specifier, context, nextResolve) {
        if (specifier === "next/server" || specifier === "next/headers") {
            return nextResolve(`${specifier}.js`, context);
        }
        const isAlias = specifier.startsWith("@/");
        const isExtensionlessRelative = specifier.startsWith(".") && !/\.(?:mjs|cjs|js|tsx?|jsx?)$/.test(specifier);
        if (!isAlias && !isExtensionlessRelative) return nextResolve(specifier, context);

        const basePath = isAlias
            ? path.resolve(sourceRoot, specifier.slice(2))
            : fileURLToPath(new URL(specifier, context.parentURL));
        const target = [basePath, ...[".ts", ".tsx", ".js", ".jsx"].map((extension) => `${basePath}${extension}`)]
            .find((candidate) => existsSync(candidate));
        return nextResolve(pathToFileURL(target || basePath).href, context);
    },
    load(url, context, nextLoad) {
        if (!url.startsWith("file:") || !/\.tsx?$/.test(new URL(url).pathname)) {
            return nextLoad(url, context);
        }
        const source = readFileSync(fileURLToPath(url), "utf8");
        return {
            format: "module",
            shortCircuit: true,
            source: ts.transpileModule(source, {
                compilerOptions: {
                    module: ts.ModuleKind.ESNext,
                    target: ts.ScriptTarget.ES2022,
                    jsx: ts.JsxEmit.ReactJSX
                }
            }).outputText
        };
    }
});

process.env.DIRECTUS_URL = "http://directus.test";
const { GET } = await import("./route.ts");
const originalFetch = globalThis.fetch;

const storageLots = [
    { lot_id: 1, lot_name: "Canonical UOM", branch_id: 20, unit_id: 5, status: "ACTIVE" },
    { lot_id: 2, lot_name: "Legacy UOM", branch_id: { id: 20 }, uom_id: { unit_id: 5 }, status: "EMPTY" },
    { lot_id: 3, lot_name: "Wrong UOM", branch_id: 20, uom_id: 6, status: "ACTIVE" },
    { lot_id: 4, lot_name: "Wrong Branch", branch_id: 21, unit_id: 5, status: "ACTIVE" },
    { lot_id: 5, lot_name: "Inactive", branch_id: 20, unit_id: 5, status: "INACTIVE" }
];

try {
    globalThis.fetch = async (input) => {
        const url = new URL(String(input));
        if (url.pathname === "/items/products/80") {
            return Response.json({ data: { unit_of_measurement: { unit_id: 5 } } });
        }
        if (url.pathname === "/items/branches/10") {
            return Response.json({ data: { id: 10, bad_stock_branch_id: { id: 20 } } });
        }
        if (url.pathname === "/items/branches/20") {
            return Response.json({ data: { id: 20, branch_name: "Bad Stock" } });
        }
        if (url.pathname === "/items/units/5") {
            return Response.json({ data: { unit_id: 5, unit_name: "Pieces", unit_shortcut: "pcs" } });
        }
        if (url.pathname === "/items/mm_lots") {
            assert.equal(url.searchParams.get("filter[branch_id][_eq]"), "20");
            assert.deepEqual(
                url.searchParams.get("filter[status][_in]")?.split(",").sort(),
                ["ACTIVE", "EMPTY", "VACANT"].sort()
            );
            assert.equal(url.searchParams.has("filter[unit_id][_eq]"), false);

            const allowedStatuses = new Set(url.searchParams.get("filter[status][_in]")?.split(","));
            const matchesBranch = (branch) => Number(typeof branch === "object" ? branch?.id : branch) === 20;
            return Response.json({
                data: storageLots.filter((lot) => matchesBranch(lot.branch_id) && allowedStatuses.has(lot.status))
            });
        }
        if (url.pathname === "/items/mm_inventory_lots") {
            return Response.json({ data: [] });
        }
        throw new Error(`Unexpected Directus request: ${url.pathname}`);
    };

    const response = await GET(new Request("http://localhost/api/manufacturing/lots/eligible?branchId=10&productId=80&badStock=1"));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body.data.lots.map((lot) => lot.lotName), ["Canonical UOM", "Legacy UOM"]);
    console.log("Eligible bad-stock lots assertions passed");
} finally {
    globalThis.fetch = originalFetch;
}
