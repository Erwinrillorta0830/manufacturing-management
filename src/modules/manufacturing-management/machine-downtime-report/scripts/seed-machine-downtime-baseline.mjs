import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../..");
dotenv.config({ path: resolve(repoRoot, ".env.local") });

const directusUrl = (process.env.DIRECTUS_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");
const directusToken = process.env.DIRECTUS_STATIC_TOKEN;
const applyChanges = process.argv.includes("--apply");
const historyCollection = "manufacturing_asset_maintenance_history";

if (!directusUrl || !directusToken) {
    console.error("Set DIRECTUS_URL (or NEXT_PUBLIC_API_BASE_URL) and DIRECTUS_STATIC_TOKEN in .env.local.");
    process.exit(1);
}

async function directusRequest(path, options = {}) {
    const response = await fetch(`${directusUrl}${path}`, {
        ...options,
        headers: {
            Authorization: `Bearer ${directusToken}`,
            Accept: "application/json",
            ...(options.body ? { "Content-Type": "application/json" } : {}),
            ...options.headers
        },
        cache: "no-store"
    });
    const responseText = await response.text();
    let payload = null;
    try {
        payload = responseText ? JSON.parse(responseText) : null;
    } catch {
        payload = null;
    }
    if (!response.ok) {
        throw new Error(`Directus ${options.method || "GET"} ${path} returned ${response.status}: ${responseText}`);
    }
    return payload?.data;
}

function recordId(value) {
    const raw = value && typeof value === "object" ? value.id : value;
    const parsed = Number(raw);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

const assetsQuery = new URLSearchParams({
    fields: "id,asset_type,condition",
    limit: "-1",
    "filter[asset_type][_eq]": "Production",
    "filter[condition][_eq]": "Under Maintenance"
});
const historyQuery = new URLSearchParams({
    fields: "id,asset_id,ended_at,open_asset_key",
    limit: "-1",
    "filter[ended_at][_null]": "true"
});

try {
    const [assets, openEpisodes] = await Promise.all([
        directusRequest(`/items/assets_and_equipment?${assetsQuery}`),
        directusRequest(`/items/${historyCollection}?${historyQuery}`)
    ]);
    if (!Array.isArray(assets) || !Array.isArray(openEpisodes)) {
        throw new Error("Directus returned an unexpected response while loading baseline data.");
    }

    const openAssetIds = new Set();
    for (const episode of openEpisodes) {
        const assetId = recordId(episode.asset_id);
        if (assetId) openAssetIds.add(assetId);
        const keyAssetId = recordId(episode.open_asset_key);
        if (keyAssetId) openAssetIds.add(keyAssetId);
    }

    const candidates = assets
        .map((asset) => ({ id: recordId(asset.id), condition: asset.condition }))
        .filter((asset) => asset.id && asset.condition === "Under Maintenance" && !openAssetIds.has(asset.id));

    console.log(`Directus: ${new URL(directusUrl).host}`);
    console.log(`${applyChanges ? "Seeding" : "Dry run:"} ${candidates.length} baseline episode(s) for Production assets already under maintenance.`);
    if (!applyChanges) {
        for (const asset of candidates) console.log(`Would seed asset #${asset.id}`);
        console.log("Run with --apply to create the records.");
    } else {
        const recordedAt = new Date().toISOString();
        for (const asset of candidates) {
            await directusRequest(`/items/${historyCollection}`, {
                method: "POST",
                body: JSON.stringify({
                    asset_id: asset.id,
                    started_at: null,
                    started_by: null,
                    source_type: "baseline",
                    source_job_order_id: null,
                    source_route_id: null,
                    source_history_id: null,
                    start_reason: "Already Under Maintenance at report rollout; actual start time unknown.",
                    ended_at: null,
                    ended_by: null,
                    restored_condition: null,
                    resolution_notes: null,
                    recorded_at: recordedAt,
                    open_asset_key: String(asset.id)
                })
            });
            console.log(`Seeded baseline episode for asset #${asset.id}`);
        }
        console.log("Baseline seeding complete.");
    }
} catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
}
