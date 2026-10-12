import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const sourceRoot = fileURLToPath(new URL("../../../../../../", import.meta.url));
registerHooks({
    resolve(specifier, context, nextResolve) {
        if (specifier === "@/app/api/manufacturing/directus-api") {
            const mockModule = `export const DIRECTUS_URL = process.env.NEXT_PUBLIC_API_BASE_URL || ""; export const headers = {};`;
            return { url: `data:text/javascript,${encodeURIComponent(mockModule)}`, shortCircuit: true };
        }
        if (specifier.endsWith("finished-goods/versions/versions-helper")) {
            const mockModule = `
                export function selectPreferredActiveVersion(versions) {
                    const active = versions.filter((version) => String(version.status || "").toLowerCase() === "active" || version.is_active === true || version.is_active === 1);
                    const pool = active.length ? active : versions;
                    return pool.find((version) => version.is_primary === true || version.is_primary === 1) || pool[0] || null;
                }
                export async function getActiveVersionForProduct() { return { version: null, routes: [] }; }
            `;
            return { url: `data:text/javascript,${encodeURIComponent(mockModule)}`, shortCircuit: true };
        }

        const isAlias = specifier.startsWith("@/");
        const isExtensionlessRelative = specifier.startsWith(".") && !/\.(?:mjs|cjs|js|tsx?|jsx?)$/.test(specifier);
        if (!isAlias && !isExtensionlessRelative) return nextResolve(specifier, context);

        const basePath = isAlias
            ? path.resolve(sourceRoot, "src", specifier.slice(2))
            : fileURLToPath(new URL(specifier, context.parentURL));
        const target = [basePath, ...[".ts", ".tsx", ".js", ".jsx"].map((extension) => `${basePath}${extension}`)]
            .find((candidate) => existsSync(candidate));
        return nextResolve(pathToFileURL(target || basePath).href, context);
    }
});

process.env.NEXT_PUBLIC_API_BASE_URL = "https://directus.test";
const { loadSubassemblyBOMComponents, parseSubassemblyProductIds } = await import("./subassembly-bom-components.ts");

assert.deepEqual(parseSubassemblyProductIds("12, 14,12"), [12, 14]);
assert.deepEqual(parseSubassemblyProductIds(null), []);
assert.equal(parseSubassemblyProductIds("12,abc"), null);
assert.equal(parseSubassemblyProductIds("0"), null);

async function runBatch(productIds, deniedVersionReadMode = "none") {
    const calls = [];
    let activeVersionRequests = 0;
    let maxConcurrentVersionRequests = 0;
    globalThis.fetch = async (input) => {
        const url = new URL(String(input));
        const collection = url.pathname.split("/").pop();
        calls.push(collection);

        let data = [];
        if (collection === "product_manufacturing_version") {
            activeVersionRequests += 1;
            maxConcurrentVersionRequests = Math.max(maxConcurrentVersionRequests, activeVersionRequests);
            await new Promise((resolve) => setTimeout(resolve, 2));
            const filter = JSON.parse(url.searchParams.get("filter") || "{}");
            if (deniedVersionReadMode === "all" || (deniedVersionReadMode === "batch" && filter.product_id?._in)) {
                activeVersionRequests -= 1;
                return { ok: false, status: 403, json: async () => ({}) };
            }
            const queriedProductIds = filter.product_id?._eq
                ? [Number(filter.product_id._eq)]
                : productIds;
            data = queriedProductIds.map((productId) => ({
                product_id: productId,
                version_id: productId + 10000,
                version_name: "Standard",
                status: "Active",
                is_active: true,
                is_primary: true
            }));
            activeVersionRequests -= 1;
        } else if (collection === "manufacturing_routes") {
            data = productIds.map((productId) => ({
                route_id: productId + 20000,
                version_id: productId + 10000
            }));
        } else if (collection === "manufacturing_routes_bom") {
            const firstProductId = productIds[0];
            data = [{
                id: 1,
                route_id: firstProductId + 20000,
                product_id: 90001,
                quantity_required: 2,
                wastage_factor_percentage: 0
            }];
        } else if (collection === "products") {
            data = [{
                product_id: 90001,
                product_name: "Sub-assembly",
                product_code: "SUB-1",
                product_type: 388,
                product_category: { category_name: "Finished Goods" },
                unit_of_measurement: { unit_shortcut: "pcs" }
            }];
        }

        return { ok: true, json: async () => ({ data }) };
    };

    const response = await loadSubassemblyBOMComponents(productIds);
    if (deniedVersionReadMode !== "none") {
        assert.equal(calls.filter((collection) => collection === "product_manufacturing_version").length, productIds.length + 1);
        assert.ok(maxConcurrentVersionRequests <= 4);
        assert.ok(maxConcurrentVersionRequests > 1);
    } else {
        assert.deepEqual(calls, [
            "product_manufacturing_version",
            "manufacturing_routes",
            "manufacturing_routes_bom",
            "products"
        ]);
    }
    return response.componentsByProductId;
}

const smallProductIds = [101, 102, 103];
const small = await runBatch(smallProductIds);
assert.equal(Object.keys(small).length, smallProductIds.length);
assert.equal(small["101"][0].bom_id, 10101);
assert.equal(small["101"][0].component_product_id.product_id, 90001);
assert.deepEqual(small["102"], []);

const largeProductIds = Array.from({ length: 100 }, (_, index) => 1000 + index);
const large = await runBatch(largeProductIds);
assert.equal(Object.keys(large).length, largeProductIds.length);
assert.equal(large["1000"][0].bom_id, 11000);
assert.deepEqual(large["1099"], []);

const deniedBatch = await runBatch([201, 202, 203, 204, 205, 206, 207, 208], "batch");
assert.equal(deniedBatch["201"][0].bom_id, 10201);
assert.deepEqual(deniedBatch["208"], []);

const deniedAllVersionReads = await runBatch([301, 302, 303], "all");
assert.deepEqual(deniedAllVersionReads, { "301": [], "302": [], "303": [] });

console.log("Sub-assembly BOM batch and permission-fallback checks passed.");
