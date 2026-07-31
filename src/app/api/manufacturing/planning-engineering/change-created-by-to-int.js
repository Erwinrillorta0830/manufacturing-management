const DIRECTUS_URL = process.env.DIRECTUS_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "";
const DIRECTUS_STATIC_TOKEN = "test";

async function changeCreatedByToInt() {
    const headers = {
        "Authorization": `Bearer ${DIRECTUS_STATIC_TOKEN}`,
        "Content-Type": "application/json"
    };

    try {
        console.log("Checking if created_by exists on job_order...");
        const checkRes = await fetch(`${DIRECTUS_URL}/fields/job_order/created_by`, { headers });
        
        if (checkRes.ok) {
            console.log("Deleting string field created_by from job_order...");
            await fetch(`${DIRECTUS_URL}/fields/job_order/created_by`, {
                method: "DELETE",
                headers
            });
            console.log("Deleted old string field.");
        }

        console.log("Creating integer field created_by on job_order...");
        const fieldConfig = {
            field: "created_by",
            type: "integer",
            schema: {
                is_nullable: true
            },
            meta: {
                interface: "input",
                width: "half"
            }
        };

        const res = await fetch(`${DIRECTUS_URL}/fields/job_order`, {
            method: "POST",
            headers,
            body: JSON.stringify(fieldConfig)
        });

        if (res.ok) {
            console.log("Successfully created integer created_by field on job_order!");
        } else {
            console.log(`Failed to create field: ${res.status} - ${await res.text()}`);
        }
    } catch (e) {
        console.error("Error migrating created_by field:", e.message);
    }
}

changeCreatedByToInt();
