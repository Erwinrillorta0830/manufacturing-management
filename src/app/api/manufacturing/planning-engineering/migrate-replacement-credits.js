const DIRECTUS_URL = process.env.DIRECTUS_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "";
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN || "";
const COLLECTION = "manufacturing_job_order_replacement_credits";
const PRIMARY_KEY = "replacement_credit_id";

if (!DIRECTUS_URL || !DIRECTUS_STATIC_TOKEN) {
    throw new Error("Set DIRECTUS_URL (or NEXT_PUBLIC_API_BASE_URL) and an administrator DIRECTUS_STATIC_TOKEN before running this migration.");
}

const headers = {
    Authorization: `Bearer ${DIRECTUS_STATIC_TOKEN}`,
    "Content-Type": "application/json"
};

async function request(path, init = {}) {
    const response = await fetch(`${DIRECTUS_URL}${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });
    const body = await response.text();
    let payload = null;
    try {
        payload = body ? JSON.parse(body) : null;
    } catch {
        payload = null;
    }
    return { response, payload };
}

async function ensureCollection() {
    const existing = await request(`/collections/${COLLECTION}`);
    if (existing.response.ok) return;
    if (existing.response.status !== 404) {
        throw new Error(`Could not inspect Directus collection ${COLLECTION} (HTTP ${existing.response.status}).`);
    }

    const created = await request("/collections", {
        method: "POST",
        body: JSON.stringify({
            collection: COLLECTION,
            schema: {},
            meta: { icon: "link", note: "Auditable accepted-output credits from terminated predecessor Job Orders." },
            fields: [{
                field: PRIMARY_KEY,
                type: "integer",
                schema: { is_primary_key: true, has_auto_increment: true },
                meta: { interface: "input", readonly: true, hidden: true }
            }]
        })
    });
    if (!created.response.ok) {
        throw new Error(`Could not create Directus collection ${COLLECTION} (HTTP ${created.response.status}).`);
    }
}

const fields = [
    { field: "replacement_job_order_id", type: "integer", schema: { is_nullable: false }, meta: { interface: "input", special: ["m2o"] } },
    { field: "predecessor_job_order_id", type: "integer", schema: { is_nullable: false }, meta: { interface: "input", special: ["m2o"] } },
    { field: "sales_order_detail_id", type: "integer", schema: { is_nullable: false }, meta: { interface: "input", special: ["m2o"] } },
    { field: "credited_quantity", type: "float", schema: { is_nullable: false, default_value: 0 }, meta: { interface: "input" } },
    { field: "credit_key", type: "string", schema: { is_nullable: false, is_unique: true, max_length: 100 }, meta: { interface: "input", hidden: true } },
    { field: "created_at", type: "timestamp", schema: { is_nullable: true }, meta: { interface: "datetime" } }
];

async function ensureFields() {
    for (const field of fields) {
        const existing = await request(`/fields/${COLLECTION}/${field.field}`);
        if (existing.response.ok) continue;
        if (existing.response.status !== 404) {
            throw new Error(`Could not inspect Directus field ${COLLECTION}.${field.field} (HTTP ${existing.response.status}).`);
        }
        const created = await request(`/fields/${COLLECTION}`, {
            method: "POST",
            body: JSON.stringify(field)
        });
        if (!created.response.ok) {
            throw new Error(`Could not create Directus field ${COLLECTION}.${field.field} (HTTP ${created.response.status}).`);
        }
    }
}

async function ensureRelation(field, relatedCollection) {
    const existing = await request(`/relations/${COLLECTION}/${field}`);
    if (existing.response.ok) return;
    if (existing.response.status !== 404) {
        throw new Error(`Could not inspect Directus relation ${COLLECTION}.${field} (HTTP ${existing.response.status}).`);
    }
    const created = await request("/relations", {
        method: "POST",
        body: JSON.stringify({
            collection: COLLECTION,
            field,
            related_collection: relatedCollection,
            schema: { on_delete: "CASCADE" },
            meta: {
                many_collection: COLLECTION,
                many_field: null,
                one_collection: relatedCollection,
                one_field: null,
                junction_field: null
            }
        })
    });
    if (!created.response.ok) {
        throw new Error(`Could not create Directus relation ${COLLECTION}.${field} (HTTP ${created.response.status}).`);
    }
}

async function run() {
    await ensureCollection();
    await ensureFields();
    await ensureRelation("replacement_job_order_id", "manufacturing_job_orders");
    await ensureRelation("predecessor_job_order_id", "manufacturing_job_orders");
    await ensureRelation("sales_order_detail_id", "sales_order_details");
    console.log(`Directus schema ready: ${COLLECTION}`);
}

run().catch((error) => {
    console.error("Replacement-credit Directus migration failed:", error instanceof Error ? error.message : "Unknown error");
    process.exitCode = 1;
});
