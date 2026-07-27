import { NextResponse } from "next/server";
import { getUserIdFromToken } from "../invoice-consolidation/_auth";
import { releaseInvoiceReservations } from "../invoice-consolidation/_reservation-service";

import { DIRECTUS_URL, headers } from "../directus-api";

interface DirectusInvoiceDetail {
    invoice_no: number | string;
    product_id: number;
    quantity: number | string;
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

interface DetailsItem {
    id?: number;
    invoice_no?: string | number;
    return_no?: string;
    product_id: string | number;
    quantity: string | number;
    unit_price?: string | number;
    net_amount?: string | number;
}

interface SalesInvoiceHeader {
    invoice_id: number | string;
    order_id?: number | string;
    customer_code?: string;
    invoice_no?: string;
    created_date?: string;
    invoice_date?: string;
    due_date?: string;
    total_amount?: string | number;
    discount_amount?: string | number;
    vat_amount?: string | number;
    net_amount?: string | number;
    transaction_status?: string;
    payment_status?: string;
    remarks?: string;
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
    latitude?: string | number;
    longitude?: string | number;
    location?: string;
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
            
            let details: DetailsItem[] = [];
            if (isReturn) {
                const returnId = parsedId - 1000000;
                const retRes = await fetch(`${DIRECTUS_URL}/items/sales_return/${returnId}`, { headers });
                if (retRes.ok) {
                    const retData = (await retRes.json()).data || {};
                    const returnNo = retData.return_number;
                    if (returnNo) {
                        const escReturnNo = encodeURIComponent(returnNo);
                        const retDetailsRes = await fetch(`${DIRECTUS_URL}/items/sales_return_details?filter[return_no][_eq]=${escReturnNo}&limit=-1`, { headers, cache: "no-store" });
                        if (retDetailsRes.ok) {
                            details = (await retDetailsRes.json()).data || [];
                        }
                    }
                }
            } else {
                const invDetailsRes = await fetch(`${DIRECTUS_URL}/items/sales_invoice_details?filter[invoice_no][_eq]=${invoiceId}&limit=-1`, { headers, cache: "no-store" });
                if (invDetailsRes.ok) {
                    details = (await invDetailsRes.json()).data || [];
                }
            }

            // Resolve products metadata
            const productIds = Array.from(new Set(details.map(d => Number(d.product_id)).filter(Boolean)));
            let prodMap = new Map<number, DirectusProduct>();
            if (productIds.length > 0) {
                const prodRes = await fetch(`${DIRECTUS_URL}/items/products?filter[product_id][_in]=${productIds.join(",")}&limit=-1&fields=product_id,product_name,product_code,unit_of_measurement.unit_shortcut,unit_of_measurement_count,product_brand.brand_name,product_category.category_name`, { headers });
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
                    product_code: matched.product_code,
                    uom: matched.unit_of_measurement?.unit_shortcut || "PCS",
                    uom_count: matched.unit_of_measurement_count ? Number(matched.unit_of_measurement_count) : 1,
                    brand: matched.product_brand?.brand_name || "N/A",
                    category: matched.product_category?.category_name || "N/A"
                } : {
                    product_id: productId,
                    product_name: `Product #${productId}`,
                    product_code: `CODE-${productId}`,
                    uom: "PCS",
                    uom_count: 1,
                    brand: "N/A",
                    category: "N/A"
                };
            };

            const formattedDetails = details.map(d => ({
                id: d.id,
                invoice_no: d.invoice_no || d.return_no,
                order_id: parsedId,
                product_id: formatProduct(Number(d.product_id)),
                quantity: isReturn ? -(Number(d.quantity) || 0) : Number(d.quantity || 0),
                unit_price: Number(d.unit_price || 0),
                net_amount: Number(d.net_amount || 0)
            }));

            return NextResponse.json({ details: formattedDetails });
        }

        const limit = searchParams.get("limit") || "250";
        const includeDetails = searchParams.get("includeDetails") === "true";

        // 1. Fetch Invoices and Invoices Details
        const invoicesRes = await fetch(`${DIRECTUS_URL}/items/sales_invoice?limit=${limit}&sort=-invoice_id`, { headers, cache: "no-store" });
        if (!invoicesRes.ok) throw new Error(`Failed to fetch sales invoices: ${invoicesRes.status}`);
        const invoicesJson = await invoicesRes.json();
        const invoices: SalesInvoiceHeader[] = invoicesJson.data || [];

        // Fetch referenced sales orders to resolve order_no manually (chunked)
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
                console.error("Error fetching sales orders for invoice mapping:", err);
            }
        }

        // Fetch customers to resolve customer_name manually (chunked)
        const customerCodes = [...new Set(invoices.map((inv) => inv.customer_code).filter((c): c is string => !!c))];
        let customerMap = new Map<string, DirectusCustomer>();
        if (customerCodes.length > 0) {
            try {
                const chunkSize = 50;
                const custDataList: DirectusCustomer[] = [];
                for (let i = 0; i < customerCodes.length; i += chunkSize) {
                    const chunk = customerCodes.slice(i, i + chunkSize);
                    const escCodes = chunk.map(c => encodeURIComponent(c)).join(",");
                    const custRes = await fetch(`${DIRECTUS_URL}/items/customer?filter[customer_code][_in]=${escCodes}&limit=-1&fields=customer_code,customer_name,customer_tin,brgy,city,province,latitude,longitude,location`, { headers, cache: "no-store" });
                    if (custRes.ok) {
                        const data = (await custRes.json()).data || [];
                        custDataList.push(...data);
                    }
                }
                customerMap = new Map(custDataList.map((c: DirectusCustomer) => [c.customer_code, c]));
            } catch (err) {
                console.error("Error fetching customers for invoice mapping:", err);
            }
        }

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

        // 2. Fetch Sales Returns and Returns Details
        const returnsRes = await fetch(`${DIRECTUS_URL}/items/sales_return?limit=${limit}&sort=-created_at`, { headers, cache: "no-store" });
        if (!returnsRes.ok) throw new Error(`Failed to fetch sales returns: ${returnsRes.status}`);
        const returnsJson = await returnsRes.json();
        const returns: DirectusReturn[] = returnsJson.data || [];

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

        // 3. Resolve Product Metadata for both Invoices and Returns details
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
                const prodRes = await fetch(`${DIRECTUS_URL}/items/products?filter[product_id][_in]=${productIdsArray.join(",")}&limit=-1&fields=product_id,product_name,product_code,unit_of_measurement.unit_shortcut,unit_of_measurement_count,product_brand.brand_name,product_category.category_name`, { headers });
                if (prodRes.ok) {
                    const prodData: DirectusProduct[] = (await prodRes.json()).data || [];
                    prodMap = new Map(prodData.map((p) => [p.product_id, p]));
                }
            } catch (err) {
                console.error("Error fetching product metadata for invoices:", err);
            }
        }

        // Helper to format product details object for the frontend
        const formatProduct = (productId: number) => {
            const matched = prodMap.get(productId);
            return matched ? {
                product_id: matched.product_id,
                product_name: matched.product_name,
                product_code: matched.product_code,
                uom: matched.unit_of_measurement?.unit_shortcut || "PCS",
                uom_count: matched.unit_of_measurement_count ? Number(matched.unit_of_measurement_count) : 1,
                brand: matched.product_brand?.brand_name || "N/A",
                category: matched.product_category?.category_name || "N/A"
            } : {
                product_id: productId,
                product_name: `Product #${productId}`,
                product_code: `CODE-${productId}`,
                uom: "PCS",
                uom_count: 1,
                brand: "N/A",
                category: "N/A"
            };
        };

        // 4. Assemble output documents and details map
        interface ClientDocument {
            order_id: number;
            invoice_id?: number;
            invoice_no?: string;
            created_date?: string;
            date?: string;
            invoice_date?: string;
            due_date?: string;
            document_type: "invoice" | "return";
            document_no?: string;
            customer_id?: string;
            customer_name?: string;
            customer_code?: string;
            customer_address?: string;
            customer_tin?: string;
            customer_latitude?: number | null;
            customer_longitude?: number | null;
            customer_location?: string | null;
            customer_city?: string | null;
            sales_order_id?: number | null;
            sales_order_no?: string;
            total_amount?: number;
            discount_amount?: number;
            vat_amount?: number;
            net_amount?: number;
            status?: string;
            payment_status?: string;
            remarks?: string;
        }

        interface ClientDocumentDetail {
            order_id: number;
            product_id: {
                product_id: number;
                product_name: string;
                product_code: string;
                uom: string;
                uom_count: number;
                brand: string;
                category: string;
            };
            quantity: number;
        }

        const dataList: ClientDocument[] = [];
        const detailsMap: Record<number, ClientDocumentDetail[]> = {};

        // Process Invoices
        invoices.forEach((inv: SalesInvoiceHeader) => {
            const invId = Number(inv.invoice_id);
            const salesOrderId = inv.order_id ? Number(inv.order_id) : null;
            const salesOrderNo = salesOrderId ? soMap.get(salesOrderId) : null;
            const custCode = inv.customer_code || "GEN";
            const cust = customerMap.get(custCode);
            const custName = cust ? cust.customer_name : `Customer: ${custCode}`;
            const custAddress = cust ? [cust.brgy, cust.city, cust.province].filter(Boolean).join(", ") : "N/A";
            const custTin = cust ? cust.customer_tin : "N/A";

            let paid = 0;
            try {
                const payments = JSON.parse(inv.payment_status || "[]");
                if (Array.isArray(payments)) paid = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
            } catch {
                // Legacy rows may contain the literal "Unpaid" instead of payment history JSON.
            }
            const netAmount = Number(inv.net_amount || 0);
            const displayStatus = inv.transaction_status === "Cancelled"
                ? "Cancelled"
                : paid >= netAmount && netAmount > 0
                    ? "Paid"
                    : paid > 0 ? "Partially Paid" : "Unpaid";

            dataList.push({
                order_id: invId,
                invoice_id: invId,
                invoice_no: inv.invoice_no,
                document_no: inv.invoice_no,
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
                customer_latitude: cust ? (cust.latitude ? Number(cust.latitude) : null) : null,
                customer_longitude: cust ? (cust.longitude ? Number(cust.longitude) : null) : null,
                customer_location: cust ? cust.location : null,
                customer_city: cust ? cust.city : null,
                sales_order_id: salesOrderId,
                sales_order_no: salesOrderNo || "Manual",
                total_amount: Number(inv.total_amount || 0),
                discount_amount: Number(inv.discount_amount || 0),
                vat_amount: Number(inv.vat_amount || 0),
                net_amount: netAmount,
                status: displayStatus,
                payment_status: inv.payment_status || "[]",
                remarks: inv.remarks || ""
            });

            if (includeDetails) {
                const matchingDetails = invoiceDetails.filter((d) => Number(d.invoice_no) === invId);
                detailsMap[invId] = matchingDetails.map((d) => ({
                    order_id: invId,
                    product_id: formatProduct(Number(d.product_id)),
                    quantity: Number(d.quantity) || 0
                }));
            }
        });

        // Process Returns (Returns represent negative sales)
        returns.forEach((ret: DirectusReturn) => {
            const retId = Number(ret.return_id);
            const virtualId = retId + 1000000; // virtual ID to avoid collision with invoice_id
            
            const matchingDetails = returnDetails.filter((d) => String(d.return_no) === String(ret.return_number));
            const retNetAmount = matchingDetails.reduce((sum, d) => sum + Number(d.net_amount || 0), 0);

            dataList.push({
                order_id: virtualId,
                invoice_id: virtualId,
                invoice_no: ret.return_number,
                document_no: ret.return_number,
                created_date: ret.return_date || ret.created_at,
                date: ret.return_date || ret.created_at,
                invoice_date: ret.return_date || ret.created_at,
                due_date: ret.return_date || ret.created_at,
                document_type: "return",
                customer_id: ret.customer_id !== null && ret.customer_id !== undefined ? String(ret.customer_id) : undefined,
                customer_name: ret.customer_name || `Customer #${ret.customer_id}`,
                customer_code: "GEN",
                sales_order_id: null,
                sales_order_no: "N/A",
                total_amount: -retNetAmount,
                discount_amount: 0,
                vat_amount: 0,
                net_amount: -retNetAmount, // NEGATIVE amount for returns
                status: "Paid",
                remarks: ret.remarks || ""
            });

            if (includeDetails) {
                detailsMap[virtualId] = matchingDetails.map((d) => ({
                    order_id: virtualId,
                    product_id: formatProduct(Number(d.product_id)),
                    quantity: -(Number(d.quantity) || 0) // NEGATIVE quantity to subtract from sales totals
                }));
            }
        });

        return NextResponse.json({
            data: dataList,
            detailsMap
        });
    } catch (e) {
        console.error("API Error in sales-invoice GET:", e);
        return NextResponse.json({ error: (e as { message?: string }).message || "Failed to fetch invoice sales data" }, { status: 500 });
    }
}

export async function POST() {
    return NextResponse.json(
        { error: "Create invoices through /api/manufacturing/invoicing." },
        { status: 410 },
    );
}

export async function PATCH(request: Request) {
    try {
        const userId = await getUserIdFromToken();
        if (!userId) {
            return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
        }

        const body = await request.json();
        const { invoiceId, status, remarks, payment } = body;

        if (!invoiceId) {
            return NextResponse.json({ error: "Missing invoiceId" }, { status: 400 });
        }

        const getRes = await fetch(`${DIRECTUS_URL}/items/sales_invoice/${invoiceId}`, { headers });
        if (!getRes.ok) {
            throw new Error(`Failed to load invoice to update: ${getRes.status}`);
        }
        const currentInvoice = (await getRes.json()).data;
        if (!currentInvoice) {
            return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
        }

        const updatePayload: Record<string, unknown> = {};
        const cancelling = status === "Cancelled";

        if (payment) {
            if (currentInvoice.transaction_status === "Cancelled") {
                return NextResponse.json({ error: "Cancelled invoices cannot accept payments." }, { status: 409 });
            }
            const amount = Number(payment.amount);
            if (!Number.isFinite(amount) || amount <= 0) {
                return NextResponse.json({ error: "Payment amount must be positive." }, { status: 400 });
            }
            let history: PaymentHistoryItem[] = [];
            if (currentInvoice.payment_status) {
                try {
                    history = JSON.parse(currentInvoice.payment_status);
                    if (!Array.isArray(history)) history = [];
                } catch {
                    history = [];
                }
            }
            const totalPaid = history.reduce((s, p) => s + Number(p.amount || 0), 0);
            const netAmount = Number(currentInvoice.net_amount || 0);
            if (totalPaid + amount > netAmount) {
                return NextResponse.json({
                    error: `Payment of ₱${amount.toLocaleString()} exceeds remaining balance of ₱${(netAmount - totalPaid).toLocaleString()}.`,
                }, { status: 409 });
            }

            const newPayment: PaymentHistoryItem = {
                amount,
                method: payment.method || "Cash",
                reference: payment.reference || "",
                date: new Date().toISOString()
            };

            history.push(newPayment);
            updatePayload.payment_status = JSON.stringify(history);

            const paymentLog = `[Collection] ₱${newPayment.amount.toLocaleString(undefined, {minimumFractionDigits: 2})} via ${newPayment.method} (Ref: ${newPayment.reference}) on ${new Date(newPayment.date).toLocaleDateString()}`;
            updatePayload.remarks = currentInvoice.remarks
                ? `${currentInvoice.remarks}\n${paymentLog}`
                : paymentLog;
        } else {
            if (status) updatePayload.transaction_status = status;
            if (remarks !== undefined) updatePayload.remarks = remarks;
        }

        const res = await fetch(`${DIRECTUS_URL}/items/sales_invoice/${invoiceId}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify(updatePayload)
        });

        if (!res.ok) throw new Error(`Failed to update invoice in Directus: ${res.status}`);

        if (cancelling) {
            try {
                await releaseInvoiceReservations(Number(invoiceId), userId);
            } catch (error) {
                await fetch(`${DIRECTUS_URL}/items/sales_invoice/${invoiceId}`, {
                    method: "PATCH",
                    headers,
                    body: JSON.stringify({ transaction_status: currentInvoice.transaction_status }),
                }).catch(() => undefined);
                const message = error instanceof Error ? error.message : "Failed to release invoice reservations";
                return NextResponse.json({ error: message }, { status: 409 });
            }
        }

        if (cancelling && currentInvoice.order_id) {
            const activeRes = await fetch(
                `${DIRECTUS_URL}/items/sales_invoice?filter[order_id][_eq]=${currentInvoice.order_id}&filter[transaction_status][_neq]=Cancelled&fields=invoice_id&limit=2`,
                { headers, cache: "no-store" }
            );
            const otherActive: { invoice_id: number }[] = activeRes.ok ? (await activeRes.json()).data || [] : [];
            const hasOtherActive = otherActive.some((inv) => Number(inv.invoice_id) !== Number(invoiceId));

            if (!hasOtherActive) {
                const orderRes = await fetch(
                    `${DIRECTUS_URL}/items/sales_order/${currentInvoice.order_id}?fields=order_id,order_status`,
                    { headers, cache: "no-store" }
                );
                if (orderRes.ok) {
                    const order: { order_id: number; order_status: string } = (await orderRes.json()).data;
                    if (order.order_status === "For Invoicing" || order.order_status === "For Consolidation" || order.order_status === "For Picking") {
                        await fetch(`${DIRECTUS_URL}/items/sales_order/${currentInvoice.order_id}`, {
                            method: "PATCH",
                            headers,
                            body: JSON.stringify({ order_status: "For Invoicing" }),
                        });
                    }
                }
            }
        }

        return NextResponse.json({ success: true });
    } catch (e) {
        console.error("API Error in sales-invoice PATCH:", e);
        return NextResponse.json({ error: (e as { message?: string }).message || "Failed to update invoice" }, { status: 500 });
    }
}

