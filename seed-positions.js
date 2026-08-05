const DIRECTUS_URL = "http://vtc:3101";
const DIRECTUS_TOKEN = "test";

const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${DIRECTUS_TOKEN}`
};

const PRODUCTION_DEPARTMENT_ID = 4; // Production Department ID is 4

const positionsToSeed = [
    { position_name: "SUPERVISOR", department: PRODUCTION_DEPARTMENT_ID, daily_rate: 539.29 },
    { position_name: "TEAM LEADERS", department: PRODUCTION_DEPARTMENT_ID, daily_rate: 518.85 },
    { position_name: "BAKER", department: PRODUCTION_DEPARTMENT_ID, daily_rate: 505.00 },
    { position_name: "BLANCHER", department: PRODUCTION_DEPARTMENT_ID, daily_rate: 505.00 },
    { position_name: "FIXER", department: PRODUCTION_DEPARTMENT_ID, daily_rate: 505.00 },
    { position_name: "WEIGHER", department: PRODUCTION_DEPARTMENT_ID, daily_rate: 505.00 },
    { position_name: "FRYER", department: PRODUCTION_DEPARTMENT_ID, daily_rate: 505.00 },
    { position_name: "PACKAGER", department: PRODUCTION_DEPARTMENT_ID, daily_rate: 505.00 },
    { position_name: "ENGINEERING", department: PRODUCTION_DEPARTMENT_ID, daily_rate: 505.00 }
];

async function seedPositions() {
    console.log("Seeding Production positions (department = 4) into Directus...");
    const now = new Date().toISOString();

    for (const pos of positionsToSeed) {
        try {
            // Check if already exists
            const filter = encodeURIComponent(JSON.stringify({ position_name: { _eq: pos.position_name } }));
            const checkRes = await fetch(`${DIRECTUS_URL}/items/positions?filter=${filter}`, { headers });
            const checkData = checkRes.ok ? await checkRes.json() : { data: [] };

            if (checkData.data && checkData.data.length > 0) {
                console.log(`Position "${pos.position_name}" already exists (ID: ${checkData.data[0].id}). Patching daily_rate...`);
                await fetch(`${DIRECTUS_URL}/items/positions/${checkData.data[0].id}`, {
                    method: "PATCH",
                    headers,
                    body: JSON.stringify({ daily_rate: pos.daily_rate, department: pos.department, is_active: true })
                });
            } else {
                console.log(`Creating position "${pos.position_name}" (Daily Rate: ₱${pos.daily_rate})...`);
                const createRes = await fetch(`${DIRECTUS_URL}/items/positions`, {
                    method: "POST",
                    headers,
                    body: JSON.stringify({
                        department: pos.department,
                        position_name: pos.position_name,
                        daily_rate: pos.daily_rate,
                        is_active: true,
                        created_at: now,
                        activated_at: now
                    })
                });
                if (createRes.ok) {
                    const createdData = await createRes.json();
                    console.log(`Successfully created "${pos.position_name}" with ID ${createdData.data.id}`);
                } else {
                    console.error(`Failed to create "${pos.position_name}":`, createRes.status, await createRes.text());
                }
            }
        } catch (err) {
            console.error(`Error processing position "${pos.position_name}":`, err);
        }
    }
    console.log("Position seeding completed!");
}

seedPositions();
