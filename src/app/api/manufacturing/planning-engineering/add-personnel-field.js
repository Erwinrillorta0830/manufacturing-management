const DIRECTUS_URL = process.env.DIRECTUS_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "";
const DIRECTUS_STATIC_TOKEN = "test";

async function addPersonnelField() {
    const headers = {
        "Authorization": `Bearer ${DIRECTUS_STATIC_TOKEN}`,
        "Content-Type": "application/json"
    };

    const fieldConfig = {
        field: "assigned_personnel",
        type: "json",
        schema: {
            is_nullable: true
        },
        meta: {
            interface: "json",
            width: "full"
        }
    };

    try {
        console.log("Checking if assigned_personnel exists on job_order...");
        const checkRes = await fetch(`${DIRECTUS_URL}/fields/job_order/assigned_personnel`, { headers });
        if (checkRes.ok) {
            console.log("Field assigned_personnel already exists.");
            return;
        }

        console.log("Creating field assigned_personnel on job_order...");
        const res = await fetch(`${DIRECTUS_URL}/fields/job_order`, {
            method: "POST",
            headers,
            body: JSON.stringify(fieldConfig)
        });

        if (res.ok) {
            console.log("Successfully created assigned_personnel field on job_order!");
        } else {
            console.log(`Failed to create field: ${res.status} - ${await res.text()}`);
        }
    } catch (e) {
        console.error("Error:", e.message);
    }
}

addPersonnelField();
