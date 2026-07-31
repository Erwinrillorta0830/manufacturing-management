const DIRECTUS_URL = process.env.DIRECTUS_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "";
const DIRECTUS_STATIC_TOKEN = "test";

const headers = {
    "Authorization": `Bearer ${DIRECTUS_STATIC_TOKEN}`,
    "Content-Type": "application/json"
};

const collectionsSchema = [
    {
        name: "manufacturing_daily_qa_inspections",
        primaryKey: "daily_qa_id",
        fields: [
            { field: "job_order_id", type: "integer", schema: { is_nullable: false } },
            { field: "ledger_id", type: "integer", schema: { is_nullable: false } },
            { field: "inspector_id", type: "integer", schema: { is_nullable: false } },
            { field: "moisture_percentage", type: "float", schema: { is_nullable: true } },
            { field: "acidity_ph", type: "float", schema: { is_nullable: true } },
            { field: "sensory_status", type: "string", schema: { is_nullable: false, default_value: "Passed" } },
            { field: "weight_check_passed", type: "boolean", schema: { is_nullable: false, default_value: true } },
            { field: "lab_status", type: "string", schema: { is_nullable: false, default_value: "Pending" } },
            { field: "action_taken", type: "string", schema: { is_nullable: false, default_value: "Released" } },
            { field: "inspected_at", type: "timestamp", schema: { is_nullable: true } },
            { field: "remarks", type: "text", schema: { is_nullable: true } }
        ]
    },
    {
        name: "manufacturing_final_qa_releases",
        primaryKey: "final_release_id",
        fields: [
            { field: "job_order_id", type: "integer", schema: { is_nullable: false } },
            { field: "lot_id", type: "integer", schema: { is_nullable: false } },
            { field: "inspected_quantity", type: "float", schema: { is_nullable: false, default_value: 0 } },
            { field: "defect_quantity", type: "float", schema: { is_nullable: true, default_value: 0 } },
            { field: "microbiological_status", type: "string", schema: { is_nullable: false, default_value: "Pending" } },
            { field: "packaging_seal_passed", type: "boolean", schema: { is_nullable: false, default_value: true } },
            { field: "label_compliance_passed", type: "boolean", schema: { is_nullable: false, default_value: true } },
            { field: "overall_disposition", type: "string", schema: { is_nullable: false, default_value: "Quarantined" } },
            { field: "coa_reference_no", type: "string", schema: { is_nullable: true, max_length: 50 } },
            { field: "approved_by", type: "integer", schema: { is_nullable: true } },
            { field: "approved_at", type: "timestamp", schema: { is_nullable: true } },
            { field: "remarks", type: "text", schema: { is_nullable: true } }
        ]
    }
];

async function runMigration() {
    console.log("Starting QA schema migration...");

    for (const config of collectionsSchema) {
        try {
            console.log(`\nChecking collection: ${config.name}`);
            const checkRes = await fetch(`${DIRECTUS_URL}/collections/${config.name}`, { headers });
            
            if (!checkRes.ok) {
                console.log(`Collection ${config.name} does not exist. Creating with primary key ${config.primaryKey}...`);
                const createRes = await fetch(`${DIRECTUS_URL}/collections`, {
                    method: "POST",
                    headers,
                    body: JSON.stringify({
                        collection: config.name,
                        schema: {},
                        meta: {},
                        fields: [
                            {
                                field: config.primaryKey,
                                type: "integer",
                                schema: {
                                    is_primary_key: true,
                                    has_auto_increment: true
                                },
                                meta: {
                                    interface: "input",
                                    readonly: true,
                                    hidden: true
                                }
                            }
                        ]
                    })
                });

                if (!createRes.ok) {
                    throw new Error(`Failed to create collection ${config.name}: ${createRes.status} - ${await createRes.text()}`);
                }
                console.log(`Successfully created collection ${config.name}`);
            } else {
                console.log(`Collection ${config.name} already exists.`);
            }

            // Check and create each field
            for (const fieldInfo of config.fields) {
                const fieldCheckRes = await fetch(`${DIRECTUS_URL}/fields/${config.name}/${fieldInfo.field}`, { headers });
                
                if (!fieldCheckRes.ok) {
                    console.log(`Creating field ${fieldInfo.field} (${fieldInfo.type}) on ${config.name}...`);
                    const fieldRes = await fetch(`${DIRECTUS_URL}/fields/${config.name}`, {
                        method: "POST",
                        headers,
                        body: JSON.stringify({
                            field: fieldInfo.field,
                            type: fieldInfo.type,
                            schema: fieldInfo.schema || {},
                            meta: fieldInfo.meta || { interface: "input" }
                        })
                    });

                    if (!fieldRes.ok) {
                        console.error(`Failed to create field ${fieldInfo.field}: ${fieldRes.status} - ${await fieldRes.text()}`);
                    } else {
                        console.log(`Successfully created field ${fieldInfo.field}`);
                    }
                } else {
                    console.log(`Field ${fieldInfo.field} already exists on ${config.name}.`);
                }
            }
        } catch (error) {
            console.error(`Error migrating collection ${config.name}:`, error.message);
        }
    }

    console.log("\nQA schema migration completed!");
}

runMigration();
