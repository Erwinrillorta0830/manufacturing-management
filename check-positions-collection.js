const DIRECTUS_URL = "http://vtc:3101";

async function checkCollection() {
    console.log("Checking Directus collections & positions permissions...");

    try {
        const resCol = await fetch(`${DIRECTUS_URL}/collections/positions`);
        console.log("Get collection /collections/positions status:", resCol.status);
        if (resCol.ok) {
            console.log("Collection details:", await resCol.json());
        } else {
            console.log("Collection error:", await resCol.text());
        }

        const resItems = await fetch(`${DIRECTUS_URL}/items/positions`);
        console.log("Get items /items/positions status:", resItems.status);
        if (resItems.ok) {
            console.log("Items count:", (await resItems.json()).data?.length);
        } else {
            console.log("Items error:", await resItems.text());
        }
    } catch (e) {
        console.error("Diagnostic error:", e);
    }
}

checkCollection();
