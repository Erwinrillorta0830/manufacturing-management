const DIRECTUS_URL = process.env.DIRECTUS_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "";
const DIRECTUS_STATIC_TOKEN = "test";

async function removePersonnelField() {
    const headers = {
        "Authorization": `Bearer ${DIRECTUS_STATIC_TOKEN}`,
        "Content-Type": "application/json"
    };

    try {
        console.log("Checking if assigned_personnel exists on job_order...");
        const checkRes = await fetch(`${DIRECTUS_URL}/fields/job_order/assigned_personnel`, { headers });
        
        if (checkRes.status === 404) {
            console.log("Field assigned_personnel does not exist on job_order. Already removed.");
            return;
        }

        console.log("Deleting field assigned_personnel from job_order...");
        const res = await fetch(`${DIRECTUS_URL}/fields/job_order/assigned_personnel`, {
            method: "DELETE",
            headers
        });

        if (res.ok || res.status === 204) {
            console.log("Successfully deleted assigned_personnel field from job_order!");
        } else {
            console.log(`Failed to delete field: ${res.status} - ${await res.text()}`);
        }
    } catch (e) {
        console.error("Error deleting field:", e.message);
    }
}

removePersonnelField();
