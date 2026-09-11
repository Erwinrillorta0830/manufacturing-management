import { NextResponse } from "next/server";

const DIRECTUS_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN || "";

const headers: Record<string, string> = {
    "Content-Type": "application/json"
};
if (DIRECTUS_STATIC_TOKEN) {
    headers["Authorization"] = `Bearer ${DIRECTUS_STATIC_TOKEN}`;
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const startDate = searchParams.get("startDate");
        const endDate = searchParams.get("endDate");
        
        let query = "?limit=-1";
        if (startDate && endDate) {
            query += `&filter[_and][0][collection_date][_gte]=${startDate}&filter[_and][1][collection_date][_lte]=${endDate}`;
        }
        
        // 1. Fetch Collections
        const url = `${DIRECTUS_URL}/items/collection${query}`;
        const res = await fetch(url, { headers, cache: "no-store" });
        if (!res.ok) throw new Error(`Directus returned status ${res.status}`);
        
        const data = await res.json();
        const collections = data.data || [];

        if (collections.length === 0) {
            return NextResponse.json({
                startDate: startDate || "", endDate: endDate || "", generatedBy: "System",
                globalCash: 0, globalChecks: 0, globalShortages: 0, globalOverages: 0, globalNetInvoice: 0,
                pouches: []
            });
        }

        const collectionIds = collections.map((c: Record<string, unknown>) => c.id);
        const idsQuery = collectionIds.join(",");

        // 2. Fetch Details & Invoices in parallel
        const [detailsRes, invoicesRes] = await Promise.all([
            fetch(`${DIRECTUS_URL}/items/collection_details?filter[collection_id][_in]=${idsQuery}&limit=-1`, { headers, cache: "no-store" }),
            fetch(`${DIRECTUS_URL}/items/collection_invoices?filter[collection_id][_in]=${idsQuery}&limit=-1`, { headers, cache: "no-store" })
        ]);

        const details = detailsRes.ok ? (await detailsRes.json()).data || [] : [];
        const collInvoices = invoicesRes.ok ? (await invoicesRes.json()).data || [] : [];

        // Extract relational IDs
        const detailInvoiceIds = details.map((d: Record<string, unknown>) => d.invoice_id).filter(Boolean);
        const salesInvoiceIds = [...new Set([
            ...collInvoices.map((ci: Record<string, unknown>) => ci.invoice_id),
            ...detailInvoiceIds
        ].filter(Boolean))];
        const bankIds = [...new Set(details.map((d: Record<string, unknown>) => d.bank).filter(Boolean))];
        const coaIds = [...new Set(details.map((d: Record<string, unknown>) => d.type).filter(Boolean))];
        const findingIds = [...new Set(details.map((d: Record<string, unknown>) => d.finding).filter(Boolean))];

        // Also check if any details remarks contain invoice numbers (e.g. Variance for INV-DIR-000126)
        const remarkInvoiceNos: string[] = [];
        details.forEach((d: Record<string, unknown>) => {
            if (typeof d.remarks === "string") {
                const matches = d.remarks.match(/INV-[A-Za-z0-9-]+/gi);
                if (matches) remarkInvoiceNos.push(...matches);
            }
        });

        // 3. Fetch relational lookups in parallel
        const siQueryParts: string[] = [];
        if (salesInvoiceIds.length > 0) siQueryParts.push(`filter[_or][0][invoice_id][_in]=${salesInvoiceIds.join(",")}`);
        if (remarkInvoiceNos.length > 0) siQueryParts.push(`filter[_or][1][invoice_no][_in]=${[...new Set(remarkInvoiceNos)].map((x: string) => encodeURIComponent(x)).join(",")}`);
        
        const siUrl = siQueryParts.length > 0
            ? `${DIRECTUS_URL}/items/sales_invoice?${siQueryParts.join("&")}&limit=-1`
            : `${DIRECTUS_URL}/items/sales_invoice?filter[invoice_id][_in]=${salesInvoiceIds.join(",")}&limit=-1`;

        const [siRes, banksRes, coaRes, findRes] = await Promise.all([
            salesInvoiceIds.length > 0 || remarkInvoiceNos.length > 0 ? fetch(siUrl, { headers, cache: "no-store" }) : Promise.resolve(null),
            bankIds.length > 0 ? fetch(`${DIRECTUS_URL}/items/bank_names?filter[id][_in]=${bankIds.join(",")}&limit=-1`, { headers, cache: "no-store" }) : Promise.resolve(null),
            coaIds.length > 0 ? fetch(`${DIRECTUS_URL}/items/chart_of_accounts?filter[coa_id][_in]=${coaIds.join(",")}&limit=-1`, { headers, cache: "no-store" }) : Promise.resolve(null),
            findingIds.length > 0 ? fetch(`${DIRECTUS_URL}/items/general_findings?filter[id][_in]=${findingIds.join(",")}&limit=-1`, { headers, cache: "no-store" }) : Promise.resolve(null)
        ]);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const salesInvoices: any[] = siRes?.ok ? (await siRes.json()).data || [] : [];
        const banks = banksRes?.ok ? (await banksRes.json()).data || [] : [];
        const coas = coaRes?.ok ? (await coaRes.json()).data || [] : [];
        const findings = findRes?.ok ? (await findRes.json()).data || [] : [];

        // 3b. Fetch Customers by customer_code to map customer names
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const customerCodesFromSI = salesInvoices.map((si: any) => si.customer_code).filter((c: unknown): c is string => typeof c === "string" && c.trim().length > 0);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const customerCodesFromCD = details.map((d: any) => d.customer_code).filter((c: unknown): c is string => typeof c === "string" && c.trim().length > 0);
        const allCustomerCodes = [...new Set([...customerCodesFromSI, ...customerCodesFromCD])];

        const customerMap = new Map<string, string>();
        if (allCustomerCodes.length > 0) {
            try {
                const escCodes = allCustomerCodes.map((c: string) => encodeURIComponent(c)).join(",");
                const custRes = await fetch(`${DIRECTUS_URL}/items/customer?filter[customer_code][_in]=${escCodes}&fields=customer_code,customer_name&limit=-1`, { headers, cache: "no-store" });
                if (custRes.ok) {
                    const custData = (await custRes.json()).data || [];
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    custData.forEach((c: any) => {
                        if (c.customer_code && c.customer_name) {
                            customerMap.set(c.customer_code, c.customer_name);
                        }
                    });
                }
            } catch (err) {
                console.error("Failed to fetch customer names for collection report:", err);
            }
        }

        const resolveCustomerName = (code?: string | null): string => {
            if (!code || !code.trim()) return "Deleted Customer";
            const name = customerMap.get(code.trim());
            return name && name.trim() ? name : "Deleted Customer";
        };

        let globalCash = 0;
        let globalChecks = 0;
        let globalShortages = 0;
        let globalOverages = 0;
        let globalNetInvoice = 0;

        // 4. Map into Pouches
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pouches = collections.map((pouch: any) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const pouchDetails = details.filter((d: any) => d.collection_id === pouch.id);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const pouchInvoices = collInvoices.filter((ci: any) => ci.collection_id === pouch.id);

            let totalCash = 0;
            let totalCheck = 0;
            let shortage = 0;
            let overage = 0;
            let invoiceNetTotal = 0;
            let totalInvoices = 0;
            let totalMemos = 0;
            let totalReturns = 0;

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const checks: any[] = [];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const variances: any[] = [];

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const ewtDetailsMap: Record<number, { amount: number; ref?: string }> = {};

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            pouchDetails.forEach((d: any) => {
                const amount = Math.abs(d.amount || 0);
                
                const hasDenomination = typeof d.check_no === 'string' && d.check_no.includes(" x ");
                const isEwt = Number(d.type) === 438 || (typeof d.remarks === "string" && d.remarks.toLowerCase().includes("2307")) || (typeof d.check_no === "string" && d.check_no.toLowerCase().includes("2307"));

                let isCheck = false;
                let isFindingOrAdjustment = false;

                if (isEwt) {
                    if (d.invoice_id) {
                        const invId = Number(d.invoice_id);
                        if (!ewtDetailsMap[invId]) {
                            ewtDetailsMap[invId] = { amount: 0, ref: d.check_no || d.remarks };
                        }
                        ewtDetailsMap[invId].amount += amount;
                    }
                } else if (hasDenomination || Number(d.type) === 1 || Number(d.payment_method) === 1) {
                    // It's cash, handled below
                } else if (d.finding != null) {
                    isFindingOrAdjustment = true;
                } else if (d.bank != null || Number(d.type) === 2 || Number(d.payment_method) === 2 || d.check_no) {
                    isCheck = true;
                } else if (d.type != null && d.payment_method == null) {
                    isFindingOrAdjustment = true;
                }
                
                if (isFindingOrAdjustment && !isEwt) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const findingObj = findings.find((f: any) => f.id === d.finding);
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const coaObj = coas.find((c: any) => c.coa_id === d.type);
                    
                    let typeName = "Adjustment";
                    if (findingObj?.name) typeName = findingObj.name;
                    else if (d.remarks?.toLowerCase().includes("shortage") || (d.amount || 0) < 0) typeName = "Shortage";
                    else if (d.remarks?.toLowerCase().includes("overage") || (d.amount || 0) > 0) typeName = "Overage";

                    if (typeName.toLowerCase().includes("shortage") || (d.amount || 0) < 0) {
                        shortage += amount;
                        globalShortages += amount;
                    } else if (typeName.toLowerCase().includes("overage") || (d.amount || 0) > 0) {
                        overage += amount;
                        globalOverages += amount;
                    }

                    // Resolve linked sales invoice if any
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    let linkedSi = salesInvoices.find((s: any) => s.invoice_id === d.invoice_id || String(s.invoice_id) === String(d.invoice_id));
                    if (!linkedSi && typeof d.remarks === "string") {
                        const match = d.remarks.match(/INV-[A-Za-z0-9-]+/i);
                        if (match) {
                            const invNo = match[0];
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            linkedSi = salesInvoices.find((s: any) => s.invoice_no?.toLowerCase() === invNo.toLowerCase());
                        }
                    }

                    const varianceInvNo = linkedSi?.invoice_no || (typeof d.remarks === "string" ? d.remarks.match(/INV-[A-Za-z0-9-]+/i)?.[0] : null) || (d.invoice_id ? String(d.invoice_id) : null);
                    const varianceCustCode = d.customer_code || linkedSi?.customer_code || null;

                    let varianceCustName: string | null = null;
                    if (varianceCustCode || linkedSi) {
                        varianceCustName = resolveCustomerName(varianceCustCode);
                    } else if (varianceInvNo) {
                        varianceCustName = "Deleted Customer";
                    }

                    variances.push({
                        docNo: d.check_no || d.remarks,
                        type: typeName,
                        customerName: varianceCustName,
                        invoiceNo: varianceInvNo,
                        accountTitle: coaObj?.account_title || "Unknown Account",
                        remarks: d.remarks || "",
                        amount: amount
                    });
                } else if (isCheck && !isEwt) {
                    totalCheck += amount;
                    globalChecks += amount;
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const bankObj = banks.find((b: any) => b.id === d.bank);
                    checks.push({
                        date: pouch.collection_date,
                        chequeDate: d.chequeDate,
                        docNo: d.check_no || "N/A",
                        bankName: bankObj?.bank_name || "Unknown Bank",
                        checkNo: d.check_no || "N/A",
                        customerName: resolveCustomerName(d.customer_code),
                        amount: amount
                    });
                } else if (!isEwt) {
                    totalCash += amount;
                    globalCash += amount;
                }
            });

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const invoiceMap: Record<number, any> = {};
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            pouchInvoices.forEach((ci: any) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const si = salesInvoices.find((s: any) => s.invoice_id === ci.invoice_id) || {};
                const invId = ci.invoice_id;
                const amount = Math.abs(ci.amount || 0);
                
                if (!invoiceMap[invId]) {
                    const custCode = si.customer_code || ci.customer_code;
                    invoiceMap[invId] = {
                        invoiceNo: si.invoice_no || String(ci.invoice_id),
                        customerName: resolveCustomerName(custCode),
                        invoiceTotal: si.net_amount || 0,
                        actualInvoiceTotal: si.gross_amount || si.net_amount || 0,
                        remainingBalance: si.remaining_balance || 0,
                        grossAmount: 0,
                        memoAmount: 0,
                        returnAmount: 0,
                        ewtAmount: ewtDetailsMap[invId]?.amount || 0,
                        ewtRef: ewtDetailsMap[invId]?.ref || undefined,
                        netAmount: 0
                    };
                    totalInvoices++;
                }

                if (ci.type === "MEMO") {
                    invoiceMap[invId].memoAmount += amount;
                    totalMemos++;
                } else if (ci.type === "RETURN") {
                    invoiceMap[invId].returnAmount += amount;
                    totalReturns++;
                } else if (ci.type === "EWT") {
                    if (!invoiceMap[invId].ewtAmount) {
                        invoiceMap[invId].ewtAmount = amount;
                    }
                } else {
                    invoiceMap[invId].grossAmount += amount;
                    invoiceMap[invId].netAmount += amount;
                    invoiceNetTotal += amount;
                    globalNetInvoice += amount;
                }
            });
            const mappedInvoices = Object.values(invoiceMap);

            return {
                id: pouch.id,
                docNo: pouch.docNo,
                date: pouch.collection_date,
                isPosted: pouch.isPosted === true || pouch.isPosted === 1 || (Buffer.isBuffer(pouch.isPosted) && pouch.isPosted[0] === 1),
                totalCash,
                totalCheck,
                shortage,
                overage,
                totalInvoices,
                totalMemos,
                totalReturns,
                invoiceNetTotal,
                checks,
                variances,
                invoices: mappedInvoices
            };
        });

        return NextResponse.json({
            startDate: startDate || "",
            endDate: endDate || "",
            generatedBy: "System",
            globalCash,
            globalChecks,
            globalShortages,
            globalOverages,
            globalNetInvoice,
            pouches
        });
    } catch (e) {
        console.error("API Error generating collection report:", e);
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
