/**
 * Migration: Enforce UNIQUE constraint on product_manufacturing_version.version_name
 *
 * Steps:
 *   1. Fetch all versions and find duplicate version_name values
 *   2. Rename duplicates by appending a numeric suffix (e.g. "V1 #2", "V1 #3")
 *   3. Patch the Directus field schema to set is_unique = true
 *
 * Run with:
 *   node src/app/api/manufacturing/finished-goods/migrate-version-name-unique.js
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
    console.log("=== version_name uniqueness migration ===\n");
    console.log(`Directus URL: ${DIRECTUS_URL}\n`);

    // ------------------------------------------------------------------ //
    // 1. Fetch all versions
    // ------------------------------------------------------------------ //
    console.log("Fetching all product_manufacturing_version records...");
    const res = await fetch(
        `${DIRECTUS_URL}/items/product_manufacturing_version?limit=-1&fields=version_id,version_name`,
        { headers }
    );
    if (!res.ok) {
        throw new Error(`Failed to fetch versions: ${res.status} ${await res.text()}`);
    }
    const { data: versions } = await res.json();
    console.log(`  Found ${versions.length} version(s).\n`);

    // ------------------------------------------------------------------ //
    // 2. Group by version_name and find duplicates
    // ------------------------------------------------------------------ //
    /** @type {Map<string, {version_id: number, version_name: string}[]>} */
    const grouped = new Map();
    for (const v of versions) {
        const key = (v.version_name || "").trim();
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(v);
    }

    let duplicateGroupCount = 0;
    let renamedCount = 0;

    for (const [name, group] of grouped.entries()) {
        if (group.length <= 1) continue; // no duplicate — skip

        duplicateGroupCount++;
        console.log(`Duplicate name "${name}" found on ${group.length} versions: [${group.map(v => v.version_id).join(", ")}]`);

        // Keep the first one as-is; rename the rest sequentially
        for (let i = 1; i < group.length; i++) {
            const v = group[i];
            let newName = `${name} #${i + 1}`;

            // Ensure the generated name is itself not already taken
            // (edge case: someone already has "V1 #2" etc.)
            let attempt = i + 1;
            while (grouped.has(newName) && grouped.get(newName).some(x => x.version_id !== v.version_id)) {
                attempt++;
                newName = `${name} #${attempt}`;
            }

            console.log(`  Renaming version_id=${v.version_id}: "${name}" -> "${newName}"`);

            const patchRes = await fetch(
                `${DIRECTUS_URL}/items/product_manufacturing_version/${v.version_id}`,
                {
                    method: "PATCH",
                    headers,
                    body: JSON.stringify({ version_name: newName }),
                }
            );

            if (patchRes.ok) {
                console.log(`    ✓ Renamed successfully.`);
                renamedCount++;
                // Update the grouped map so subsequent iterations see the new name
                grouped.set(newName, [{ version_id: v.version_id, version_name: newName }]);
            } else {
                const errText = await patchRes.text();
                console.error(`    ✗ Failed to rename version_id=${v.version_id}: ${patchRes.status} ${errText}`);
            }
        }
    }

    if (duplicateGroupCount === 0) {
        console.log("No duplicate version names found — all names are already unique.\n");
    } else {
        console.log(`\nRenamed ${renamedCount} version(s) across ${duplicateGroupCount} duplicate group(s).\n`);
    }

    // ------------------------------------------------------------------ //
    // 3. Apply UNIQUE constraint via Directus field schema PATCH
    // ------------------------------------------------------------------ //
    console.log("Applying UNIQUE constraint to version_name field via Directus schema API...");

    const fieldPatchRes = await fetch(
        `${DIRECTUS_URL}/fields/product_manufacturing_version/version_name`,
        {
            method: "PATCH",
            headers,
            body: JSON.stringify({
                schema: {
                    is_unique: true,
                },
            }),
        }
    );

    if (fieldPatchRes.ok) {
        console.log("✓ UNIQUE constraint applied successfully on version_name.\n");
    } else {
        const errText = await fieldPatchRes.text();
        console.error(`✗ Failed to apply UNIQUE constraint: ${fieldPatchRes.status} ${errText}\n`);
        process.exit(1);
    }

    console.log("=== Migration complete ===");
}

run().catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
});
