/**
 * Migration: Add `is_primary` field schema and backfill Primary Default versions
 *
 * Directus collection: `product_manufacturing_version`
 * Field: `is_primary` (boolean, default false)
 *
 * Steps:
 *   1. Check if `is_primary` field exists in Directus schema; create if missing.
 *   2. Fetch all products and their versions.
 *   3. Ensure exactly 1 active version per product is flagged as `is_primary = true`.
 *
 * Run with:
 *   node src/app/api/manufacturing/finished-goods/migrate-multi-active-versions.js
 */

const DIRECTUS_URL =
    process.env.DIRECTUS_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    "http://vtc:3101";
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN || "test";

const headers = {
    Authorization: `Bearer ${DIRECTUS_STATIC_TOKEN}`,
    "Content-Type": "application/json",
};

async function run() {
    console.log("=== Multi-Active Versions & Primary Default Migration ===\n");
    console.log(`Directus URL: ${DIRECTUS_URL}\n`);

    // 1. Ensure `is_primary` field schema exists on product_manufacturing_version
    console.log("Checking Directus field schema for product_manufacturing_version.is_primary...");
    const fieldRes = await fetch(
        `${DIRECTUS_URL}/fields/product_manufacturing_version/is_primary`,
        { headers }
    );

    if (fieldRes.status === 404) {
        console.log("Creating `is_primary` field in Directus...");
        const createFieldRes = await fetch(
            `${DIRECTUS_URL}/fields/product_manufacturing_version`,
            {
                method: "POST",
                headers,
                body: JSON.stringify({
                    field: "is_primary",
                    type: "boolean",
                    meta: {
                        interface: "boolean",
                        options: {
                            label: "Primary Default Version"
                        },
                        display: "boolean",
                        readonly: false,
                        hidden: false,
                        width: "half"
                    },
                    schema: {
                        default_value: false,
                        is_nullable: true
                    }
                })
            }
        );
        if (createFieldRes.ok) {
            console.log("  ✓ `is_primary` field created successfully.\n");
        } else {
            console.warn(`  ! Failed to create field: ${createFieldRes.status} ${await createFieldRes.text()}\n`);
        }
    } else {
        console.log("  ✓ `is_primary` field already exists in Directus schema.\n");
    }

    // 2. Fetch all products and their versions to ensure 1 primary default per product
    console.log("Fetching versions to backfill primary default status...");
    const versionsRes = await fetch(
        `${DIRECTUS_URL}/items/product_manufacturing_version?limit=-1&fields=version_id,product_id,status,is_primary`,
        { headers }
    );
    if (!versionsRes.ok) {
        throw new Error(`Failed to fetch versions: ${versionsRes.status}`);
    }
    const { data: versions } = await versionsRes.json();
    console.log(`  Found ${versions.length} total version record(s).\n`);

    const byProduct = new Map();
    for (const v of versions) {
        const pId = Number(v.product_id);
        if (!byProduct.has(pId)) byProduct.set(pId, []);
        byProduct.get(pId).push(v);
    }

    let updatedCount = 0;
    for (const [productId, prodVersions] of byProduct.entries()) {
        const hasPrimary = prodVersions.some(v => v.is_primary);
        if (!hasPrimary) {
            const activeVers = prodVersions.filter(v => v.status === "Active");
            const targetPrimary = activeVers[0] || prodVersions[0];
            if (targetPrimary) {
                console.log(`Setting version_id=${targetPrimary.version_id} as primary default for product_id=${productId}`);
                await fetch(`${DIRECTUS_URL}/items/product_manufacturing_version/${targetPrimary.version_id}`, {
                    method: "PATCH",
                    headers,
                    body: JSON.stringify({ is_primary: true })
                });
                updatedCount++;
            }
        }
    }

    console.log(`Backfilled ${updatedCount} product(s) with Primary Default version.\n`);
    console.log("=== Migration complete ===");
}

run().catch(err => {
    console.error("Migration script failed:", err);
});
