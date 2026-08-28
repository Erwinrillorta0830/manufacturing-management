const DIRECTUS_URL = process.env.DIRECTUS_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "http://vtc:3101";
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN || "test";

const headers = {
    "Authorization": `Bearer ${DIRECTUS_STATIC_TOKEN}`,
    "Content-Type": "application/json"
};

// Define collections, their primary keys, and other fields
const collectionsSchema = [
    {
        name: "manufacturing_job_orders",
        primaryKey: "job_order_id",
        fields: [
            { field: "job_order_no", type: "string", schema: { is_nullable: false, max_length: 100 } },
            { field: "product_id", type: "integer", schema: { is_nullable: false } },
            { field: "version_id", type: "integer", schema: { is_nullable: false } },
            { field: "target_quantity", type: "float", schema: { is_nullable: false } },
            { field: "actual_quantity_produced", type: "float", schema: { is_nullable: true, default_value: 0 } },
            { field: "start_date", type: "date", schema: { is_nullable: true } },
            { field: "end_date", type: "date", schema: { is_nullable: true } },
            { field: "status", type: "string", schema: { is_nullable: false, default_value: "Draft" } },
            { field: "created_by", type: "integer", schema: { is_nullable: true } },
            { field: "created_at", type: "timestamp", schema: { is_nullable: true } },
            { field: "modified_by", type: "integer", schema: { is_nullable: true } },
            { field: "modified_at", type: "timestamp", schema: { is_nullable: true } },
            { field: "remarks", type: "text", schema: { is_nullable: true } }
        ]
    },
    {
        name: "manufacturing_job_order_allocations",
        primaryKey: "allocation_id",
        fields: [
            { field: "job_order_id", type: "integer", schema: { is_nullable: false } },
            { field: "sales_order_detail_id", type: "integer", schema: { is_nullable: false } },
            { field: "allocated_quantity", type: "float", schema: { is_nullable: false } },
            { field: "created_at", type: "timestamp", schema: { is_nullable: true } }
        ]
    },
    {
        name: "manufacturing_job_order_routes",
        primaryKey: "jo_route_id",
        fields: [
            { field: "job_order_id", type: "integer", schema: { is_nullable: false } },
            { field: "sequence_order", type: "integer", schema: { is_nullable: false } },
            { field: "routing_id", type: "integer", schema: { is_nullable: true } },
            { field: "work_center_id", type: "integer", schema: { is_nullable: false } },
            { field: "operation_id", type: "integer", schema: { is_nullable: false } },
            { field: "qa_template_id", type: "integer", schema: { is_nullable: true } },
            { field: "requires_qa", type: "boolean", schema: { is_nullable: false, default_value: false } },
            { field: "planned_setup_hours", type: "float", schema: { is_nullable: false } },
            { field: "planned_run_hours", type: "float", schema: { is_nullable: false } },
            { field: "actual_setup_hours", type: "float", schema: { is_nullable: true, default_value: 0 } },
            { field: "actual_run_hours", type: "float", schema: { is_nullable: true, default_value: 0 } },
            { field: "estimated_labor_cost", type: "float", schema: { is_nullable: false } },
            { field: "actual_labor_cost", type: "float", schema: { is_nullable: true, default_value: 0 } },
            { field: "status", type: "string", schema: { is_nullable: false, default_value: "Pending" } },
            { field: "completed_at", type: "timestamp", schema: { is_nullable: true } },
            { field: "step_batch_size", type: "float", schema: { is_nullable: true, default_value: 1 } },
            { field: "run_time_hours_factor", type: "float", schema: { is_nullable: true, default_value: 0 } }
        ]
    },
    {
        name: "manufacturing_job_order_route_operators",
        primaryKey: "jo_route_operator_id",
        fields: [
            { field: "jo_route_id", type: "integer", schema: { is_nullable: false } },
            { field: "operator_id", type: "integer", schema: { is_nullable: false } },
            { field: "logged_hours", type: "float", schema: { is_nullable: false, default_value: 0 } },
            { field: "hourly_rate", type: "float", schema: { is_nullable: true, default_value: 0 } },
            { field: "logged_at", type: "timestamp", schema: { is_nullable: false } },
            { field: "started_at", type: "dateTime", schema: { is_nullable: true } },
            { field: "stopped_at", type: "dateTime", schema: { is_nullable: true } }
        ]
    },
    {
        name: "manufacturing_job_order_materials",
        primaryKey: "jo_material_id",
        fields: [
            { field: "job_order_id", type: "integer", schema: { is_nullable: false } },
            { field: "product_id", type: "integer", schema: { is_nullable: false } },
            { field: "uom_id", type: "integer", schema: { is_nullable: false } },
            { field: "allocated_quantity", type: "float", schema: { is_nullable: false } },
            { field: "actual_consumed_quantity", type: "float", schema: { is_nullable: true, default_value: 0 } },
            { field: "scrap_quantity", type: "float", schema: { is_nullable: true, default_value: 0 } }
        ]
    },
    {
        name: "manufacturing_job_order_qa_records",
        primaryKey: "qa_record_id",
        fields: [
            { field: "job_order_id", type: "integer", schema: { is_nullable: false } },
            { field: "jo_route_id", type: "integer", schema: { is_nullable: false } },
            { field: "parameter_id", type: "integer", schema: { is_nullable: false } },
            { field: "value_text", type: "string", schema: { is_nullable: true, max_length: 255 } },
            { field: "value_numeric", type: "float", schema: { is_nullable: true } },
            { field: "value_boolean", type: "boolean", schema: { is_nullable: true } },
            { field: "is_passed", type: "boolean", schema: { is_nullable: false, default_value: true } },
            { field: "inspected_by", type: "integer", schema: { is_nullable: false } },
            { field: "inspected_at", type: "timestamp", schema: { is_nullable: false } },
            { field: "remarks", type: "text", schema: { is_nullable: true } }
        ]
    },
    {
        name: "manufacturing_routes",
        primaryKey: "route_id",
        fields: [
            { field: "step_batch_size", type: "float", schema: { is_nullable: true, default_value: 1 } },
            { field: "default_manpower", type: "integer", schema: { is_nullable: false, default_value: 1 } },
            { field: "expected_labor_cost", type: "float", schema: { is_nullable: false, default_value: 0 } }
        ]
    },
    {
        name: "positions",
        primaryKey: "id",
        fields: [
            { field: "department", type: "integer", schema: { is_nullable: false, default_value: 4 } },
            { field: "position_name", type: "string", schema: { is_nullable: false, max_length: 255 } },
            { field: "daily_rate", type: "float", schema: { is_nullable: false, default_value: 1200 } },
            { field: "created_by", type: "integer", schema: { is_nullable: true } },
            { field: "created_at", type: "timestamp", schema: { is_nullable: true } },
            { field: "is_active", type: "boolean", schema: { is_nullable: false, default_value: true } },
            { field: "activated_at", type: "timestamp", schema: { is_nullable: true } }
        ]
    },
    {
        name: "user",
        primaryKey: "id",
        fields: [
            { field: "position_id", type: "integer", schema: { is_nullable: true } }
        ]
    },
    {
        name: "manufacturing_route_positions",
        primaryKey: "id",
        fields: [
            { field: "route_id", type: "integer", schema: { is_nullable: false } },
            { field: "position_id", type: "integer", schema: { is_nullable: true } },
            { field: "position_name", type: "string", schema: { is_nullable: false, max_length: 255 } },
            { field: "manpower_count", type: "integer", schema: { is_nullable: false, default_value: 1 } },
            { field: "hourly_rate", type: "float", schema: { is_nullable: false, default_value: 0 } },
            { field: "daily_rate", type: "float", schema: { is_nullable: true, default_value: 0 } },
            { field: "created_at", type: "timestamp", schema: { is_nullable: true } },
            { field: "created_by", type: "integer", schema: { is_nullable: true } },
            { field: "updated_at", type: "timestamp", schema: { is_nullable: true } },
            { field: "updated_by", type: "integer", schema: { is_nullable: true } }
        ]
    },
    {
        name: "product_version_overheads",
        primaryKey: "id",
        fields: [
            { field: "version_id", type: "integer", schema: { is_nullable: false } },
            { field: "overhead_type_id", type: "integer", schema: { is_nullable: false } },
            { field: "cost", type: "float", schema: { is_nullable: false, default_value: 0 } },
            { field: "allocation_basis", type: "string", schema: { is_nullable: false, default_value: "per_unit", max_length: 50 } },
            { field: "is_active", type: "boolean", schema: { is_nullable: false, default_value: true } },
            { field: "remarks", type: "string", schema: { is_nullable: true, max_length: 255 } },
            { field: "created_at", type: "timestamp", schema: { is_nullable: true } },
            { field: "created_by", type: "integer", schema: { is_nullable: true } },
            { field: "updated_at", type: "timestamp", schema: { is_nullable: true } },
            { field: "updated_by", type: "integer", schema: { is_nullable: true } }
        ]
    },
    {
        name: "chart_of_accounts",
        primaryKey: "coa_id",
        fields: [
            { field: "gl_code", type: "string", schema: { is_nullable: true, max_length: 255 } },
            { field: "account_title", type: "string", schema: { is_nullable: true, max_length: 255 } },
            { field: "description", type: "text", schema: { is_nullable: true } },
            { field: "status", type: "string", schema: { is_nullable: false, default_value: "approved" } }
        ]
    },
    {
        name: "overhead_types",
        primaryKey: "id",
        fields: [
            { field: "overhead_name", type: "string", schema: { is_nullable: false, max_length: 255 } },
            { field: "coa_id", type: "integer", schema: { is_nullable: true } },
            { field: "description", type: "string", schema: { is_nullable: true, max_length: 255 } },
            { field: "created_at", type: "timestamp", schema: { is_nullable: true } },
            { field: "created_by", type: "integer", schema: { is_nullable: true } }
        ]
    }
];

async function runMigration() {
    console.log("Starting Directus schema migration...");

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
                }
            }
        } catch (error) {
            console.error(`Error migrating collection ${config.name}:`, error.message);
        }
    }

    // Grant public permissions (role: null) for positions
    const actions = ["read", "create", "update"];
    for (const action of actions) {
        await fetch(`${DIRECTUS_URL}/permissions`, {
            method: "POST",
            headers,
            body: JSON.stringify({
                role: null,
                collection: "positions",
                action,
                fields: ["*"]
            })
        }).catch(() => {});
    }

    console.log("\nDirectus schema migration completed!");
}

runMigration();
