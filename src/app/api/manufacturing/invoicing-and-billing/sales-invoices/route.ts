import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";

interface DirectusInvoiceDetail {
    detail_id?: number;
    invoice_no: number | string;
    product_id: number;
    quantity: number | string;
    unit_price?: number | string;
    gross_amount?: number | string;
    discount_amount?: number | string;
    total_amount?: number | string;
}

interface DirectusReturn {
    return_id: number | string;
    return_number?: string;
    return_date?: string;
    created_at?: string;
    customer_id?: string | number;
    customer_name?: string;
    remarks?: string;
}

interface DirectusReturnDetail {
    return_no: string;
    product_id: number;
    quantity: number | string;
    net_amount?: number | string;
}

interface DirectusProduct {
    product_id: number;
    product_name: string;
    product_code: string;
    description?: string;
    unit_of_measurement?: {
        unit_shortcut?: string;
    };
    unit_of_measurement_count?: number | string;
    product_brand?: {
        brand_name?: string;
    };
    product_category?: {
        category_name?: string;
    };
}

interface SalesInvoiceHeader {
    invoice_id: number | string;
    order_id?: number | string;
    customer_code?: string;
    invoice_no?: string;
    created_date?: string;
    invoice_date?: string;
    dispatch_date?: string;
    due_date?: string;
    total_amount?: string | number;
    gross_amount?: string | number;
    vat_amount?: string | number;
    discount_amount?: string | number;
    net_amount?: string | number;
    transaction_status?: string;
    payment_status?: string;
    remarks?: string;
    salesman_id?: number;
    branch_id?: number;
    payment_terms?: number;
}

interface DirectusSalesman {
    id: number;
    salesman_code?: string;
    salesman_name?: string;
}

interface DirectusCustomer {
    customer_code: string;
    customer_name: string;
    customer_tin?: string;
    brgy?: string;
    city?: string;
    province?: string;
}

interface PaymentHistoryItem {
    amount: number;
    method: string;
    reference: string;
    date: string;
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const invoiceId = searchParams.get("invoiceId") || searchParams.get("id");

        if (invoiceId) {
            const parsedId = Number(invoiceId);
            const isReturn = parsedId >= 1000000;

            let details: DirectusInvoiceDetail[] = [];
            if (isReturn) {
                const returnId = parsedId - 1000000;
                const retRes = await fetch(`${DIRECTUS_URL}/items/sales_return/${returnId}`, { headers, cache: "no-store" });
                if (retRes.ok) {
                    const retData = (await retRes.json()).data || {};
                    const returnNo = retData.return_number;
                    if (returnNo) {
                        const escReturnNo = encodeURIComponent(returnNo);
                        const retDetailsRes = await fetch(`${DIRECTUS_URL}/items/sales_return_details?filter[return_no][_eq]=${escReturnNo}&limit=-1`, { headers, cache: "no-store" });
                        if (retDetailsRes.ok) {
                            const rawReturnDetails = (await retDetailsRes.json()).data || [];
                            details = rawReturnDetails.map((d: DirectusReturnDetail) => ({
                                invoice_no: d.return_no,
                                product_id: d.product_id,
                                quantity: -(Number(d.quantity) || 0),
                                unit_price: 0,
                                gross_amount: -(Number(d.net_amount) || 0),
                                discount_amount: 0,
                                total_amount: -(Number(d.net_amount) || 0),
                            }));
                        }
                    }
                }
            } else {
                const invDetailsRes = await fetch(`${DIRECTUS_URL}/items/sales_invoice_details?filter[invoice_no][_eq]=${invoiceId}&limit=-1`, { headers, cache: "no-store" });
                if (invDetailsRes.ok) {
                    details = (await invDetailsRes.json()).data || [];
                }
            }

            const productIds = Array.from(new Set(details.map(d => Number(d.product_id)).filter(Boolean)));
            let prodMap = new Map<number, DirectusProduct>();
            if (productIds.length > 0) {
                const prodRes = await fetch(`${DIRECTUS_URL}/items/products?filter[product_id][_in]=${productIds.join(",")}&limit=-1&fields=product_id,product_name,product_code,description,unit_of_measurement.unit_shortcut,unit_of_measurement_count,product_brand.brand_name,product_category.category_name`, { headers, cache: "no-store" });
                if (prodRes.ok) {
                    const prodData: DirectusProduct[] = (await prodRes.json()).data || [];
                    prodMap = new Map(prodData.map((p) => [p.product_id, p]));
                }
            }

            const formatProduct = (productId: number) => {
                const matched = prodMap.get(productId);
                return matched ? {
                    product_id: matched.product_id,
                    product_name: matched.product_name,
                    description: matched.description || matched.product_name,
                    product_code: matched.product_code,
                    uom: matched.unit_of_measurement?.unit_shortcut || "PCS",
                    uom_count: matched.unit_of_measurement_count ? Number(matched.unit_of_measurement_count) : 1,
                    brand: matched.product_brand?.brand_name || "N/A",
                    category: matched.product_category?.category_name || "N/A"
                } : {
                    product_id: productId,
                    product_name: `Product #${productId}`,
                    description: `Product #${productId}`,
                    product_code: `CODE-${productId}`,
                    uom: "PCS",
                    uom_count: 1,
                    brand: "N/A",
                    category: "N/A"
                };
            };

            const formattedDetails = details.map(d => ({
                id: d.detail_id || d.product_id,
                invoice_no: d.invoice_no,
                order_id: parsedId,
                product: formatProduct(Number(d.product_id)),
                quantity: Number(d.quantity || 0),
                unit_price: Number(d.unit_price || 0),
                gross_amount: Number(d.gross_amount || 0),
                discount_amount: Number(d.discount_amount || 0),
                net_amount: Number(d.total_amount || 0)
            }));

            return NextResponse.json({ details: formattedDetails });
        }

        const pageParam = searchParams.get("page");
        const limitParam = searchParams.get("limit");
        const page = pageParam ? Math.max(1, parseInt(pageParam, 10)) : 1;
        const limit = limitParam ? parseInt(limitParam, 10) : -1;
        const offset = limit > 0 ? (page - 1) * limit : 0;
        const includeDetails = searchParams.get("includeDetails") === "true";

        // 1. Fetch Invoices with pagination & meta count
        const invoiceQuery = limit > 0
            ? `limit=${limit}&offset=${offset}&meta=*&sort=-invoice_id`
            : `limit=-1&meta=*&sort=-invoice_id`;
        const invoicesRes = await fetch(`${DIRECTUS_URL}/items/sales_invoice?${invoiceQuery}`, { headers, cache: "no-store" });
        if (!invoicesRes.ok) {
            throw new Error(`Failed to fetch sales invoices for FM Report: ${invoicesRes.status}`);
        }
        const invoicesJson = await invoicesRes.json();
        const invoices: SalesInvoiceHeader[] = invoicesJson.data || [];
        console.log("saas", invoices);
        const totalCount = Number(invoicesJson.meta?.filter_count ?? invoicesJson.meta?.total_count ?? invoices.length);
        const totalPages = limit > 0 ? Math.max(1, Math.ceil(totalCount / limit)) : 1;

        // 2. Fetch Salesmen
        let salesmanMap = new Map<number, DirectusSalesman>();
        let salesmanList: { id: number; salesman_code: string; salesman_name: string }[] = [];

        try {
            const smRes = await fetch(`${DIRECTUS_URL}/items/salesman?limit=-1&fields=id,salesman_code,salesman_name`, { headers, cache: "no-store" });
            if (smRes.ok) {
                const smData: DirectusSalesman[] = (await smRes.json()).data || [];
                salesmanMap = new Map(smData.map((sm) => [sm.id, sm]));
                salesmanList = smData.map((sm) => ({
                    id: sm.id,
                    salesman_code: sm.salesman_code || `SM-${sm.id}`,
                    salesman_name: sm.salesman_name || `Salesman #${sm.id}`,
                }));
            }
        } catch (err) {
            console.error("Error fetching salesman mapping:", err);
        }

        // 2b. Fetch Branches & Payment Terms
        let branchMap = new Map<number, { id: number; branch_name: string; branch_code: string }>();
        try {
            const bRes = await fetch(`${DIRECTUS_URL}/items/branches?limit=-1&fields=id,branch_name,branch_code`, { headers, cache: "no-store" });
            if (bRes.ok) {
                const bData = (await bRes.json()).data || [];
                branchMap = new Map(bData.map((b: { id: number; branch_name: string; branch_code: string }) => [Number(b.id), b]));
            }
        } catch (err) {
            console.error("Error fetching branches mapping:", err);
        }

        let ptMap = new Map<number | string, { id: number | string; payment_name: string; payment_days?: number }>();
        try {
            const ptRes = await fetch(`${DIRECTUS_URL}/items/payment_terms?limit=-1&fields=id,payment_name,payment_days`, { headers, cache: "no-store" });
            if (ptRes.ok) {
                const ptData = (await ptRes.json()).data || [];
                ptMap = new Map(ptData.map((pt: { id: number | string; payment_name: string; payment_days?: number }) => [pt.id, pt]));
            }
        } catch (err) {
            console.error("Error fetching payment terms mapping:", err);
        }

        function extractOrderIdAndNo(invObj: Record<string, unknown>): { orderId: number | null; orderNo: string | null } {
            let orderId: number | null = null;
            let orderNo: string | null = null;

            const rawOrder = invObj.order_id ?? invObj.sales_order_id ?? invObj.sales_order;
            if (typeof rawOrder === "object" && rawOrder !== null) {
                const subObj = rawOrder as Record<string, unknown>;
                const idVal = Number(subObj.order_id ?? subObj.id);
                if (Number.isFinite(idVal) && idVal > 0) orderId = idVal;
                if (typeof subObj.order_no === "string" && subObj.order_no.trim()) {
                    orderNo = subObj.order_no.trim();
                }
            } else if (typeof rawOrder === "number") {
                orderId = rawOrder;
            } else if (typeof rawOrder === "string") {
                const trimmed = rawOrder.trim();
                if (/^\d+$/.test(trimmed)) {
                    orderId = Number(trimmed);
                } else if (trimmed) {
                    orderNo = trimmed;
                }
            }

            const explicitNo = invObj.order_no ?? invObj.sales_order_no;
            if (!orderNo && typeof explicitNo === "string" && explicitNo.trim()) {
                orderNo = explicitNo.trim();
            }

            return { orderId, orderNo };
        }

        // 3. Fetch Sales Orders (including branch & payment_terms fallback)
        const numericOrderIds: number[] = [];
        const stringOrderNos: string[] = [];
        for (const inv of invoices as unknown as Record<string, unknown>[]) {
            const { orderId, orderNo } = extractOrderIdAndNo(inv);
            if (orderId) numericOrderIds.push(orderId);
            if (orderNo) stringOrderNos.push(orderNo);
        }
        const uniqueNumericIds = [...new Set(numericOrderIds)];
        const uniqueStringNos = [...new Set(stringOrderNos)];

        const soMap = new Map<string, { order_no: string; branch_id?: number; payment_terms?: number | string; transaction_status?: string }>();

        try {
            const chunkSize = 50;
            const soDataList: Array<{ order_id: number; order_no: string; branch_id?: number; payment_terms?: number | string; order_status?: string; transaction_status?: string }> = [];

            for (let i = 0; i < uniqueNumericIds.length; i += chunkSize) {
                const chunk = uniqueNumericIds.slice(i, i + chunkSize);
                const escChunk = chunk.map(id => encodeURIComponent(String(id))).join(",");
                const soRes = await fetch(`${DIRECTUS_URL}/items/sales_order?filter[order_id][_in]=${escChunk}&limit=-1&fields=order_id,order_no,branch_id,payment_terms,order_status`, { headers, cache: "no-store" });
                if (soRes.ok) {
                    const data = (await soRes.json()).data || [];
                    soDataList.push(...data);
                } else {
                    const errText = await soRes.text();
                    console.error("[Sales Invoices] Directus sales_order fetch failed (numeric IDs):", soRes.status, errText);
                }
            }

            for (let i = 0; i < uniqueStringNos.length; i += chunkSize) {
                const chunk = uniqueStringNos.slice(i, i + chunkSize);
                const escChunk = chunk.map(no => encodeURIComponent(no)).join(",");
                const soRes = await fetch(`${DIRECTUS_URL}/items/sales_order?filter[order_no][_in]=${escChunk}&limit=-1&fields=order_id,order_no,branch_id,payment_terms,order_status`, { headers, cache: "no-store" });
                if (soRes.ok) {
                    const data = (await soRes.json()).data || [];
                    soDataList.push(...data);
                } else {
                    const errText = await soRes.text();
                    console.error("[Sales Invoices] Directus sales_order fetch failed (string orderNos):", soRes.status, errText);
                }
            }

            console.log(`[Sales Invoices] Matched ${soDataList.length} sales orders for ${uniqueNumericIds.length + uniqueStringNos.length} IDs`);

            for (const s of soDataList) {
                const val = {
                    order_no: s.order_no,
                    branch_id: s.branch_id ? Number(s.branch_id) : undefined,
                    payment_terms: s.payment_terms,
                    transaction_status: s.order_status || s.transaction_status,
                };
                if (s.order_id !== undefined && s.order_id !== null) {
                    soMap.set(String(s.order_id), val);
                }
                if (s.order_no) {
                    soMap.set(String(s.order_no), val);
                }
            }
        } catch (err) {
            console.error("Error mapping sales orders for FM report:", err);
        }

        // 4. Fetch Customers
        const customerCodes = [...new Set(invoices.map((inv) => inv.customer_code).filter((c): c is string => !!c))];
        let customerMap = new Map<string, DirectusCustomer>();
        if (customerCodes.length > 0) {
            try {
                const chunkSize = 50;
                const custDataList: DirectusCustomer[] = [];
                for (let i = 0; i < customerCodes.length; i += chunkSize) {
                    const chunk = customerCodes.slice(i, i + chunkSize);
                    const escCodes = chunk.map(c => encodeURIComponent(c)).join(",");
                    const custRes = await fetch(`${DIRECTUS_URL}/items/customer?filter[customer_code][_in]=${escCodes}&limit=-1&fields=customer_code,customer_name,customer_tin,brgy,city,province`, { headers, cache: "no-store" });
                    if (custRes.ok) {
                        const data = (await custRes.json()).data || [];
                        custDataList.push(...data);
                    }
                }
                customerMap = new Map(custDataList.map((c: DirectusCustomer) => [c.customer_code, c]));
            } catch (err) {
                console.error("Error mapping customers for FM report:", err);
            }
        }

        // 5. Details if requested
        const invoiceIds = invoices.map((inv) => Number(inv.invoice_id)).filter(Boolean);
        const invoiceDetails: DirectusInvoiceDetail[] = [];
        if (includeDetails && invoiceIds.length > 0) {
            const chunkSize = 50;
            for (let i = 0; i < invoiceIds.length; i += chunkSize) {
                const chunk = invoiceIds.slice(i, i + chunkSize);
                const invDetailsRes = await fetch(`${DIRECTUS_URL}/items/sales_invoice_details?filter[invoice_no][_in]=${chunk.join(",")}&limit=-1`, { headers, cache: "no-store" });
                if (invDetailsRes.ok) {
                    const json = await invDetailsRes.json();
                    invoiceDetails.push(...(json.data || []));
                }
            }
        }

        // 6. Returns
        const returnQuery = limit > 0
            ? `limit=${limit}&offset=${offset}&sort=-created_at`
            : `limit=-1&sort=-created_at`;
        const returnsRes = await fetch(`${DIRECTUS_URL}/items/sales_return?${returnQuery}`, { headers, cache: "no-store" });
        const returns: DirectusReturn[] = returnsRes.ok ? ((await returnsRes.json()).data || []) : [];

        const returnNumbers = returns.map((ret) => ret.return_number).filter(Boolean);
        const returnDetails: DirectusReturnDetail[] = [];
        if (includeDetails && returnNumbers.length > 0) {
            const chunkSize = 50;
            for (let i = 0; i < returnNumbers.length; i += chunkSize) {
                const chunk = returnNumbers.slice(i, i + chunkSize);
                const escReturnNumbers = chunk.map((no) => encodeURIComponent(no || "")).join(",");
                const retDetailsRes = await fetch(`${DIRECTUS_URL}/items/sales_return_details?filter[return_no][_in]=${escReturnNumbers}&limit=-1`, { headers, cache: "no-store" });
                if (retDetailsRes.ok) {
                    const json = await retDetailsRes.json();
                    returnDetails.push(...(json.data || []));
                }
            }
        }

        // 7. Products
        const allProductIds = new Set<number>();
        if (includeDetails) {
            invoiceDetails.forEach((d) => {
                if (d.product_id) allProductIds.add(Number(d.product_id));
            });
            returnDetails.forEach((d) => {
                if (d.product_id) allProductIds.add(Number(d.product_id));
            });
        }

        const productIdsArray = Array.from(allProductIds);
        let prodMap = new Map<number, DirectusProduct>();
        if (productIdsArray.length > 0) {
            try {
                const prodRes = await fetch(`${DIRECTUS_URL}/items/products?filter[product_id][_in]=${productIdsArray.join(",")}&limit=-1&fields=product_id,product_name,product_code,description,unit_of_measurement.unit_shortcut,unit_of_measurement_count,product_brand.brand_name,product_category.category_name`, { headers, cache: "no-store" });
                if (prodRes.ok) {
                    const prodData: DirectusProduct[] = (await prodRes.json()).data || [];
                    prodMap = new Map(prodData.map((p) => [p.product_id, p]));
                }
            } catch (err) {
                console.error("Error fetching product metadata for FM report:", err);
            }
        }

        const formatProduct = (productId: number) => {
            const matched = prodMap.get(productId);
            return matched ? {
                product_id: matched.product_id,
                product_name: matched.product_name,
                description: matched.description || matched.product_name,
                product_code: matched.product_code,
                uom: matched.unit_of_measurement?.unit_shortcut || "PCS",
                uom_count: matched.unit_of_measurement_count ? Number(matched.unit_of_measurement_count) : 1,
                brand: matched.product_brand?.brand_name || "N/A",
                category: matched.product_category?.category_name || "N/A"
            } : {
                product_id: productId,
                product_name: `Product #${productId}`,
                description: `Product #${productId}`,
                product_code: `CODE-${productId}`,
                uom: "PCS",
                uom_count: 1,
                brand: "N/A",
                category: "N/A"
            };
        };

        // 8. Format FM Report documents
        const dataList: Record<string, unknown>[] = [];
        const detailsMap: Record<number, Record<string, unknown>[]> = {};

        invoices.forEach((inv: SalesInvoiceHeader) => {
            const invId = Number(inv.invoice_id);
            const invObj = inv as unknown as Record<string, unknown>;
            const { orderId: salesOrderId, orderNo: extractedNo } = extractOrderIdAndNo(invObj);

            const soInfo = salesOrderId
                ? soMap.get(String(salesOrderId))
                : (extractedNo ? soMap.get(extractedNo) : undefined);

            const salesOrderNo = extractedNo
                || soInfo?.order_no
                || (salesOrderId ? soMap.get(String(salesOrderId))?.order_no : null)
                || null;

            console.log("SalesORder", salesOrderNo, "salesOrderId:", salesOrderId, "extractedNo:", extractedNo, "soInfo:", soInfo);
            const custCode = inv.customer_code || "GEN";
            const cust = customerMap.get(custCode);
            const custName = cust ? cust.customer_name : `Customer: ${custCode}`;
            const custAddress = cust ? [cust.brgy, cust.city, cust.province].filter(Boolean).join(", ") : "N/A";
            const custTin = cust ? cust.customer_tin : "N/A";

            const smId = inv.salesman_id ? Number(inv.salesman_id) : null;
            const sm = smId ? salesmanMap.get(smId) : null;
            const smName = sm?.salesman_name || (smId ? `Salesman #${smId}` : "Unassigned");
            const smCode = sm?.salesman_code || "N/A";

            // Resolve Branch
            const branchId = inv.branch_id ? Number(inv.branch_id) : (soInfo?.branch_id ?? null);
            const branchObj = branchId ? branchMap.get(branchId) : undefined;
            const branchName = branchObj ? branchObj.branch_name : (branchId ? `Branch #${branchId}` : "N/A");
            const branchCode = branchObj ? branchObj.branch_code : "N/A";

            // Resolve Payment Terms
            const pTerms = inv.payment_terms !== undefined && inv.payment_terms !== null ? inv.payment_terms : (soInfo?.payment_terms ?? null);
            const ptObj = pTerms ? ptMap.get(pTerms) : undefined;
            const paymentTermName = ptObj ? ptObj.payment_name : (pTerms ? `Term: ${pTerms}` : "N/A");

            // Transaction Status
            const transactionStatus = inv.transaction_status || soInfo?.transaction_status || "Prepared";

            let paid = 0;
            let paymentHistory: PaymentHistoryItem[] = [];
            if (inv.payment_status) {
                try {
                    const parsed = JSON.parse(inv.payment_status);
                    if (Array.isArray(parsed)) {
                        paymentHistory = parsed;
                        paid = parsed.reduce((sum: number, p: PaymentHistoryItem) => sum + Number(p.amount || 0), 0);
                    }
                } catch {
                    // Ignore non-JSON legacy values
                }
            }

            const netAmount = Number(inv.net_amount || inv.total_amount || 0);
            const grossAmount = Number(inv.gross_amount || inv.total_amount || 0);
            const vatAmount = Number(inv.vat_amount || 0);
            const discountAmount = Number(inv.discount_amount || 0);

            const displayStatus = (inv.transaction_status === "Cancelled" || transactionStatus === "Cancelled")
                ? "Cancelled"
                : paid >= netAmount && netAmount > 0
                    ? "Paid"
                    : paid > 0 ? "Partially Paid" : "Unpaid";

            dataList.push({
                order_id: invId,
                invoice_id: invId,
                invoice_no: inv.invoice_no || `SI-${invId}`,
                document_no: inv.invoice_no || `SI-${invId}`,
                created_date: inv.created_date,
                date: inv.invoice_date || inv.created_date,
                invoice_date: inv.invoice_date || inv.created_date,
                due_date: inv.due_date,
                document_type: "invoice",
                customer_id: custCode,
                customer_name: custName,
                customer_code: custCode,
                customer_address: custAddress,
                customer_tin: custTin,
                salesman_id: smId,
                salesman_code: smCode,
                salesman_name: smName,
                sales_order_id: salesOrderId,
                sales_order_no: salesOrderNo,
                branch_id: branchId,
                branch_name: branchName,
                branch_code: branchCode,
                payment_terms: pTerms,
                payment_term_name: paymentTermName,
                transaction_status: transactionStatus,
                gross_amount: grossAmount,
                discount_amount: discountAmount,
                vat_amount: vatAmount,
                net_amount: netAmount,
                paid_amount: paid,
                balance: Math.max(0, netAmount - paid),
                status: displayStatus,
                payment_history: paymentHistory,
                remarks: inv.remarks || ""
            });

            if (includeDetails) {
                const matchingDetails = invoiceDetails.filter((d) => Number(d.invoice_no) === invId);
                detailsMap[invId] = matchingDetails.map((d) => ({
                    id: d.detail_id || d.product_id,
                    order_id: invId,
                    product: formatProduct(Number(d.product_id)),
                    quantity: Number(d.quantity || 0),
                    unit_price: Number(d.unit_price || 0),
                    gross_amount: Number(d.gross_amount || 0),
                    discount_amount: Number(d.discount_amount || 0),
                    net_amount: Number(d.total_amount || 0)
                }));
            }
        });

        returns.forEach((ret: DirectusReturn) => {
            const retId = Number(ret.return_id);
            const virtualId = retId + 1000000;
            const matchingDetails = returnDetails.filter((d) => String(d.return_no) === String(ret.return_number));
            const retNetAmount = matchingDetails.reduce((sum, d) => sum + Number(d.net_amount || 0), 0);

            dataList.push({
                order_id: virtualId,
                invoice_id: virtualId,
                invoice_no: ret.return_number || `SR-${retId}`,
                document_no: ret.return_number || `SR-${retId}`,
                created_date: ret.return_date || ret.created_at,
                date: ret.return_date || ret.created_at,
                invoice_date: ret.return_date || ret.created_at,
                due_date: ret.return_date || ret.created_at,
                document_type: "return",
                customer_id: ret.customer_id ? String(ret.customer_id) : "GEN",
                customer_name: ret.customer_name || `Customer #${ret.customer_id || "GEN"}`,
                customer_code: "GEN",
                customer_address: "N/A",
                customer_tin: "N/A",
                salesman_id: null,
                salesman_code: "N/A",
                salesman_name: "Unassigned",
                sales_order_id: null,
                sales_order_no: "N/A",
                branch_id: null,
                branch_name: "N/A",
                branch_code: "N/A",
                payment_terms: null,
                payment_term_name: "N/A",
                transaction_status: "Returned",
                gross_amount: -retNetAmount,
                discount_amount: 0,
                vat_amount: 0,
                net_amount: -retNetAmount,
                paid_amount: -retNetAmount,
                balance: 0,
                status: "Paid",
                payment_history: [],
                remarks: ret.remarks || "Sales Return"
            });

            if (includeDetails) {
                detailsMap[virtualId] = matchingDetails.map((d) => ({
                    id: d.product_id,
                    order_id: virtualId,
                    product: formatProduct(Number(d.product_id)),
                    quantity: -(Number(d.quantity) || 0),
                    unit_price: 0,
                    gross_amount: -(Number(d.net_amount) || 0),
                    discount_amount: 0,
                    net_amount: -(Number(d.net_amount) || 0)
                }));
            }
        });

        return NextResponse.json({
            data: dataList,
            salesmen: salesmanList,
            detailsMap,
            pagination: {
                page,
                limit,
                total: totalCount,
                totalPages
            }
        });
    } catch (e) {
        console.error("API Error in FM Sales Invoice Report GET:", e);
        return NextResponse.json(
            { error: (e as { message?: string }).message || "Failed to load FM sales invoice report data." },
            { status: 500 }
        );
    }
}
