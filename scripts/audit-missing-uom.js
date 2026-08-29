/* eslint-disable @typescript-eslint/no-require-imports */
const { createDirectus, staticToken, rest, readItems } = require('@directus/sdk');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const DIRECTUS_URL = process.env.NEXT_PUBLIC_DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_STATIC_TOKEN || process.env.DIRECTUS_API_TOKEN;

if (!DIRECTUS_TOKEN) {
    console.error('Error: Directus API token not found in .env.local');
    process.exit(1);
}

const client = createDirectus(DIRECTUS_URL)
    .with(staticToken(DIRECTUS_TOKEN))
    .with(rest());

async function auditMissingUOM() {
    console.log(`Starting UOM audit on products... (Directus: ${DIRECTUS_URL})`);
    
    try {
        // Fetch products where uom_id is null or empty
        const products = await client.request(readItems('products', {
            filter: {
                _or: [
                    { uom_id: { _null: true } },
                    { uom_id: { _empty: true } }
                ]
            },
            fields: ['id', 'product_code', 'product_name', 'category', 'status'],
            limit: -1
        }));

        if (!products || products.length === 0) {
            console.log('✅ All products have a valid uom_id. No missing data found.');
            return;
        }

        console.log(`⚠️ Found ${products.length} products missing a UOM.`);

        // Generate CSV
        const csvHeaders = 'ID,Product Code,Product Name,Category,Status\n';
        const csvRows = products.map(p => 
            `"${p.id}","${p.product_code || ''}","${(p.product_name || '').replace(/"/g, '""')}","${p.category || ''}","${p.status || ''}"`
        ).join('\n');
        
        const csvContent = csvHeaders + csvRows;
        
        const reportPath = path.join(process.cwd(), 'missing_uom_report.csv');
        fs.writeFileSync(reportPath, csvContent);
        
        console.log(`📝 Generated report: ${reportPath}`);
        console.log('Please provide this report to the Master Data Team for manual correction before enforcing the schema constraint.');
        
    } catch (error) {
        console.error('❌ Error fetching products from Directus:', error.message);
        if (error.errors) {
            console.error(JSON.stringify(error.errors, null, 2));
        }
    }
}

auditMissingUOM();
