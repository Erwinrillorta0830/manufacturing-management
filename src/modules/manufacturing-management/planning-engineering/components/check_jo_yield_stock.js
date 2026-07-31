const DIRECTUS_URL = process.env.DIRECTUS_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "";
const token = "test";

async function main() {
    const headers = {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
    };

    const productId = 25563;
    console.log(`Checking product ID: ${productId}`);

    console.log("\nChecking inventory_lots for product...");
    const lotRes = await fetch(`${DIRECTUS_URL}/items/inventory_lots?filter[product_id][_eq]=${productId}`, { headers });
    if (lotRes.ok) {
        const data = await lotRes.json();
        console.log(`Found ${data.data.length} lots:`);
        data.data.forEach(l => {
            console.log(`  Lot ID: ${l.id || l.lot_id}, Lot Num: ${l.lot_number || l.batch_no}, Qty: ${l.quantity}, QA Status: ${l.qa_status}, Branch ID: ${l.branch_id}, Created On: ${l.created_on}`);
        });
    }

    console.log("\nChecking inventory_movements for product...");
    const movRes = await fetch(`${DIRECTUS_URL}/items/inventory_movements?filter[product_id][_eq]=${productId}`, { headers });
    if (movRes.ok) {
        const data = await movRes.json();
        console.log(`Found ${data.data.length} movements:`);
        data.data.forEach(m => {
            console.log(`  Mov ID: ${m.movement_id}, Lot ID: ${m.lot_id}, Batch No: ${m.batch_no}, Qty: ${m.quantity}, Branch ID: ${m.branch_id}, Doc No: ${m.source_document_no}`);
        });
    }
}

main().catch(console.error);
