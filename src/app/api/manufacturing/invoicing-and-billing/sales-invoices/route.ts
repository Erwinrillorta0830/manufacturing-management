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

interface SalesOrderHeader {
    order_id: number;
    order_no: string;
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

        const limit = searchParams.get("limit") || "500";
        const includeDetails = searchParams.get("includeDetails") === "true";

        // 1. Fetch Invoices
        const invoicesRes = await fetch(`${DIRECTUS_URL}/items/sales_invoice?limit=${limit}&sort=-invoice_id`, { headers, cache: "no-store" });
        if (!invoicesRes.ok) {
            throw new Error(`Failed to fetch sales invoices for FM Report: ${invoicesRes.status}`);
        }
        const invoicesJson = await invoicesRes.json();
        const invoices: SalesInvoiceHeader[] = invoicesJson.data || [];

        // 2. Fetch Salesmen
        const salesmanIds = [...new Set(invoices.map((inv) => inv.salesman_id).filter((id): id is number => !!id))];
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

        // 3. Fetch Sales Orders
        const orderIds = [...new Set(invoices.map((inv) => inv.order_id).filter(Boolean))];
        let soMap = new Map<number, string>();
        if (orderIds.length > 0) {
            try {
                const chunkSize = 50;
                const soDataList: SalesOrderHeader[] = [];
                for (let i = 0; i < orderIds.length; i += chunkSize) {
                    const chunk = orderIds.slice(i, i + chunkSize);
                    const escChunk = chunk.map(id => encodeURIComponent(String(id))).join(",");
                    const soRes = await fetch(`${DIRECTUS_URL}/items/sales_order?filter[order_id][_in]=${escChunk}&limit=-1&fields=order_id,order_no`, { headers, cache: "no-store" });
                    if (soRes.ok) {
                        const data = (await soRes.json()).data || [];
                        soDataList.push(...data);
                    }
                }
                soMap = new Map(soDataList.map((s: SalesOrderHeader) => [Number(s.order_id), s.order_no]));
            } catch (err) {
                console.error("Error mapping sales orders for FM report:", err);
            }
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
        const returnsRes = await fetch(`${DIRECTUS_URL}/items/sales_return?limit=${limit}&sort=-created_at`, { headers, cache: "no-store" });
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
            const salesOrderId = inv.order_id ? Number(inv.order_id) : null;
            const salesOrderNo = salesOrderId ? soMap.get(salesOrderId) : null;
            const custCode = inv.customer_code || "GEN";
            const cust = customerMap.get(custCode);
            const custName = cust ? cust.customer_name : `Customer: ${custCode}`;
            const custAddress = cust ? [cust.brgy, cust.city, cust.province].filter(Boolean).join(", ") : "N/A";
            const custTin = cust ? cust.customer_tin : "N/A";

            const smId = inv.salesman_id ? Number(inv.salesman_id) : null;
            const sm = smId ? salesmanMap.get(smId) : null;
            const smName = sm?.salesman_name || (smId ? `Salesman #${smId}` : "Unassigned");
            const smCode = sm?.salesman_code || "N/A";

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

            const displayStatus = inv.transaction_status === "Cancelled"
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
                sales_order_no: salesOrderNo || "Manual",
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
            detailsMap
        });
    } catch (e) {
        console.error("API Error in FM Sales Invoice Report GET:", e);
        return NextResponse.json(
            { error: (e as { message?: string }).message || "Failed to load FM sales invoice report data." },
            { status: 500 }
        );
    }
}
