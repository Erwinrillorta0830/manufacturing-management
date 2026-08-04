const DIRECTUS_URL = "http://vtc:3101";
const DIRECTUS_TOKEN = "test";

const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${DIRECTUS_TOKEN}`
};

async function getDepartments() {
    console.log("Fetching departments catalog from Directus...");
    try {
        const res = await fetch(`${DIRECTUS_URL}/items/department?limit=-1`, { headers });
        if (res.ok) {
            const data = await res.json();
            console.log("Departments found:", JSON.stringify(data.data, null, 2));
        } else {
            console.error("Failed /items/department:", res.status, await res.text());
        }

        const res2 = await fetch(`${DIRECTUS_URL}/items/departments?limit=-1`, { headers });
        if (res2.ok) {
            const data2 = await res2.json();
            console.log("Departments found (/items/departments):", JSON.stringify(data2.data, null, 2));
        } else {
            console.error("Failed /items/departments:", res2.status, await res2.text());
        }
    } catch (err) {
        console.error("Error fetching departments:", err);
    }
}

getDepartments();
