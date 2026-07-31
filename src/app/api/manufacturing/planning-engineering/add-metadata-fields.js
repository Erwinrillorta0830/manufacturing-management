const DIRECTUS_URL = process.env.DIRECTUS_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "";
const DIRECTUS_STATIC_TOKEN = "test";

async function addMetadataFields() {
    const headers = {
        "Authorization": `Bearer ${DIRECTUS_STATIC_TOKEN}`,
        "Content-Type": "application/json"
    };

    const fields = [
        {
            field: "created_by",
            type: "string",
            schema: {
                is_nullable: true,
                max_length: 255
            },
            meta: {
                interface: "input",
                width: "half"
            }
        },
        {
            field: "created_at",
            type: "timestamp",
            schema: {
                is_nullable: true
            },
            meta: {
                interface: "datetime",
                width: "half"
            }
        }
    ];

    for (const fieldConfig of fields) {
        try {
            console.log(`Checking if ${fieldConfig.field} exists on job_order...`);
            const checkRes = await fetch(`${DIRECTUS_URL}/fields/job_order/${fieldConfig.field}`, { headers });
            if (checkRes.ok) {
                console.log(`Field ${fieldConfig.field} already exists.`);
                continue;
            }

            console.log(`Creating field ${fieldConfig.field} on job_order...`);
            const res = await fetch(`${DIRECTUS_URL}/fields/job_order`, {
                method: "POST",
                headers,
                body: JSON.stringify(fieldConfig)
            });

            if (res.ok) {
                console.log(`Successfully created ${fieldConfig.field} field on job_order!`);
            } else {
                console.log(`Failed to create field ${fieldConfig.field}: ${res.status} - ${await res.text()}`);
            }
        } catch (e) {
            console.error(`Error for ${fieldConfig.field}:`, e.message);
        }
    }
}

addMetadataFields();
