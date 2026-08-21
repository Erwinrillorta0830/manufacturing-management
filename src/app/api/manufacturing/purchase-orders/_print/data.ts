import { paymentStatusLabel, inventoryStatusToPurchaseOrderStatus } from "../../procurement/_domain";
import { DIRECTUS_URL, procurementDirectusFetch, procurementDirectusHeaders } from "../../procurement/_directus";
import { fetchShipmentLineItems } from "../../procurement/shipments/shipments-helper";
import { getLandedCostComputation } from "../../procurement/landed-cost/_domain";
import type {
    ApprovalPrintEntry,
    CompanyHeaderSnapshot,
    LandedCostAllocationPrintRecord,
    LandedCostExpensePrintRecord,
    LandedCostPrintSnapshot,
    PurchaseOrderPrintDocumentType,
    PurchaseOrderPrintHeader,
    PurchaseOrderPrintLine,
    PurchaseOrderPrintableSnapshot,
    PurchaseOrderPrintTemplate,
    ReceivingPrintRecord,
    StorageAllocationPrintRecord,
    StorageMovementPrintRecord
} from "./types";

type DirectusRow = Record<string, unknown>;

export class PurchaseOrderPrintDataError extends Error {
    constructor(public readonly status: number, message: string) {
        super(message);
        this.name = "PurchaseOrderPrintDataError";
    }
}

function rowsFromBody(body: unknown): DirectusRow[] {
    return body && typeof body === "object" && Array.isArray((body as { data?: unknown }).data)
        ? (body as { data: DirectusRow[] }).data
        : [];
}

function asRecord(value: unknown): DirectusRow | null {
    return value && typeof value === "object" ? value as DirectusRow : null;
}

function relationId(value: unknown, keys: readonly string[] = ["id"]): number | null {
    const record = asRecord(value);
    const raw = record
        ? keys.map(key => record[key]).find(candidate => candidate !== undefined && candidate !== null)
        : value;
    const parsed = Number(raw);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function text(value: unknown, fallback = "N/A"): string {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    return fallback;
}

function number(value: unknown, fallback = 0): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function boolean(value: unknown): boolean {
    return value === true || Number(value) === 1;
}

function relationText(value: unknown, keys: readonly string[], fallback = "N/A"): string {
    const record = asRecord(value);
    if (!record) return text(value, fallback);
    for (const key of keys) {
        const candidate = record[key];
        if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    }
    const id = relationId(record, ["id", "user_id", "branch_id", "lot_id", "product_id"]);
    return id ? `#${id}` : fallback;
}

function dateText(value: unknown): string {
    const raw = text(value, "");
    if (!raw) return "N/A";
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? raw : date.toISOString();
}

async function directusRows(path: string, message: string, optional = false): Promise<DirectusRow[]> {
    const response = await procurementDirectusFetch(path);
    if (!response.ok) {
        if (optional && response.status === 404) return [];
        const status = response.status >= 500 ? 503 : response.status;
        throw new PurchaseOrderPrintDataError(status, message);
    }
    return rowsFromBody(await response.json());
}

async function directusRow(path: string, message: string): Promise<DirectusRow> {
    const response = await procurementDirectusFetch(path);
    if (response.status === 404) throw new PurchaseOrderPrintDataError(404, message);
    if (!response.ok) throw new PurchaseOrderPrintDataError(response.status >= 500 ? 503 : response.status, message);
    const body = await response.json();
    const data = body?.data;
    if (!data || typeof data !== "object") throw new PurchaseOrderPrintDataError(404, message);
    return data as DirectusRow;
}

async function lookupRow(collection: string, id: number | null, fields: string): Promise<DirectusRow | null> {
    if (!id) return null;
    try {
        return await directusRow(`/items/${collection}/${id}?fields=${encodeURIComponent(fields)}`, `Unable to load ${collection} ${id}.`);
    } catch (error) {
        if (error instanceof PurchaseOrderPrintDataError && error.status === 404) return null;
        throw error;
    }
}

async function loadCompanyHeader(): Promise<CompanyHeaderSnapshot> {
    const fallback: CompanyHeaderSnapshot = {
        name: "Vertex Manufacturing",
        address: "N/A",
        contact: "N/A",
        email: "N/A",
        logoDataUrl: null
    };
    let companyRows: DirectusRow[] = [];
    try {
        companyRows = await directusRows(
            "/items/company?filter[company_id][_eq]=1&limit=1&fields=*",
            "Unable to load the company header for the printable document.",
            true
        );
    } catch {
        return fallback;
    }
    const company = companyRows[0];
    if (!company) return fallback;
    const logoId = text(company.company_logo, "");
    let logoDataUrl: string | null = null;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(logoId)) {
        const response = await fetch(`${DIRECTUS_URL}/assets/${logoId}`, {
            headers: procurementDirectusHeaders(),
            cache: "no-store"
        }).catch(() => null);
        if (response?.ok) {
            const contentType = response.headers.get("content-type") || "image/png";
            const buffer = Buffer.from(await response.arrayBuffer());
            logoDataUrl = `data:${contentType};base64,${buffer.toString("base64")}`;
        }
    }
    return {
        name: text(company.company_name, fallback.name),
        address: [company.company_address, company.company_brgy, company.company_city, company.company_province, company.company_zipCode]
            .map(value => text(value, ""))
            .filter(Boolean)
            .join(", ") || fallback.address,
        contact: text(company.company_contact, fallback.contact),
        email: text(company.company_email, fallback.email),
        logoDataUrl
    };
}

async function loadPrintableTemplate(): Promise<PurchaseOrderPrintTemplate> {
    const fallback = { name: "Standard Manufacturing Purchase-Order Printable", version: "1" };
    try {
        const rows = await directusRows(
            "/items/pdf_templates?fields=id,name,template_name,version,updated_at&sort=-updated_at&limit=1",
            "Unable to load the printable template.",
            true
        );
        const row = rows[0];
        return row
            ? { name: text(row.name || row.template_name, fallback.name), version: text(row.version || row.updated_at, fallback.version) }
            : fallback;
    } catch {
        return fallback;
    }
}

async function loadSupplier(value: unknown) {
    const relation = asRecord(value);
    const id = relationId(value, ["id", "supplier_id"]);
    const loaded = await lookupRow("suppliers", id, "*");
    const row = { ...(loaded || {}), ...(relation || {}) };
    const supplierType = text(row.supplier_type, "");
    const supplierCurrency = text(row.currency || row.default_currency, "").toUpperCase();
    const isForeign = boolean(row.is_foreign)
        || /foreign/i.test(supplierType)
        || (supplierCurrency !== "" && supplierCurrency !== "PHP");
    const className = (supplierType || (isForeign ? "Foreign" : "Local")).toUpperCase();
    const currency = supplierCurrency || (isForeign ? "USD" : "PHP");
    return {
        name: text(row.supplier_name, id ? `Supplier #${id}` : "N/A"),
        address: [row.address, row.brgy, row.city, row.state_province, row.country, row.postal_code]
            .map(candidate => text(candidate, ""))
            .filter(Boolean)
            .join(", ") || "N/A",
        vendorClass: `${className} (${currency})`
    };
}

async function loadBranch(value: unknown): Promise<string> {
    const relation = asRecord(value);
    const id = relationId(value, ["id", "branch_id"]);
    const loaded = await lookupRow("branches", id, "id,branch_name,branch_code");
    const row = { ...(loaded || {}), ...(relation || {}) };
    const name = text(row.branch_name, id ? `Branch #${id}` : "Unassigned Branch");
    const code = text(row.branch_code, "");
    return code ? `${name} (${code})` : name;
}

function paymentArrangement(value: unknown): string {
    switch (Number(value)) {
        case 1: return "Advance Payment";
        case 2: return "Partial Payment";
        case 3: return "Full Payment";
        case 4: return "Refund";
        case 5: return "Installment";
        default: return value == null || value === "" ? "N/A" : `Payment Type #${value}`;
    }
}

async function loadLines(purchaseOrderId: number): Promise<PurchaseOrderPrintLine[]> {
    const lines = await fetchShipmentLineItems(purchaseOrderId);
    if (lines.length > 0) {
        return lines.map(line => {
            const product = asRecord(line.product_id) || {};
            const ordered = number(line.quantity_ordered);
            const received = number(line.quantity_received);
            const rejected = number(line.quantity_rejected);
            const unitPrice = number(line.base_unit_cost_php);
            const quantity = ordered || received;
            const discount = number(line.discount_amount_foreign || line.discount_percent && quantity * number(line.unit_price_foreign || line.base_unit_cost_php) * number(line.discount_percent) / 100);
            const netAmount = Math.max(0, quantity * number(line.unit_price_foreign || unitPrice) - discount);
            const unit = relationText(product.unit_of_measurement, ["unit_shortcut", "unit_name"], "PCS");
            return {
                lineId: number(line.line_id),
                productId: relationId(line.product_id, ["product_id"]),
                productCode: text(product.product_code),
                productName: text(product.product_name, `Product #${relationId(line.product_id, ["product_id"]) || "N/A"}`),
                categoryType: text(line.category_type),
                unit,
                orderedQuantity: ordered,
                receivedQuantity: received,
                acceptedQuantity: Math.max(0, received - rejected),
                rejectedQuantity: rejected,
                unitPrice,
                unitPriceForeign: number(line.unit_price_foreign || unitPrice),
                allocatedExpense: number(line.allocated_expense_php),
                finalLandedUnitCost: number(line.final_landed_unit_cost || unitPrice),
                discountAmount: discount,
                netAmount,
                purchaseIntent: text(line.purchase_intent),
                jobOrder: line.job_order_id ? `#${line.job_order_id}` : "N/A",
                batchNumber: text(line.batch_no || line.lot_number, "N/A"),
                expirationDate: dateText(line.expiration_date)
            };
        });
    }

    const fallbackRows = await directusRows(
        `/items/purchase_order_products?filter[purchase_order_id][_eq]=${purchaseOrderId}&fields=*,product_id.*&limit=-1`,
        "Unable to load purchase-order lines."
    );
    return fallbackRows.map(row => {
        const product = asRecord(row.product_id) || {};
        const ordered = number(row.ordered_quantity);
        const unitPrice = number(row.unit_price);
        return {
            lineId: relationId(row, ["purchase_order_product_id", "id"]) || 0,
            productId: relationId(row.product_id, ["product_id"]),
            productCode: text(product.product_code),
            productName: text(product.product_name, "Unknown product"),
            categoryType: text(row.category_type),
            unit: relationText(product.unit_of_measurement, ["unit_shortcut", "unit_name"], "PCS"),
            orderedQuantity: ordered,
            receivedQuantity: number(row.received),
            acceptedQuantity: number(row.received),
            rejectedQuantity: 0,
            unitPrice,
            unitPriceForeign: number(row.unit_price_foreign || unitPrice),
            allocatedExpense: number(row.allocated_expense_php),
            finalLandedUnitCost: number(row.final_landed_unit_cost || unitPrice),
            discountAmount: number(row.discounted_amount || row.discount_amount),
            netAmount: number(row.net_amount || row.total_amount || ordered * unitPrice),
            purchaseIntent: text(row.purchase_intent),
            jobOrder: row.job_order_id ? `#${row.job_order_id}` : "N/A",
            batchNumber: "N/A",
            expirationDate: "N/A"
        };
    });
}

async function loadApprovalHistory(purchaseOrderId: number): Promise<ApprovalPrintEntry[]> {
    const historyRows = await directusRows(
        `/items/purchase_order_approval_history?filter[purchase_order_id][_eq]=${purchaseOrderId}&fields=*&sort=created_at,history_id&limit=-1`,
        "Unable to load purchase-order approval history.",
        true
    );
    const actorIds = [...new Set(historyRows.map(row => relationId(row.actor_id, ["user_id", "id"])).filter((id): id is number => id !== null))];
    const actorRows = actorIds.length > 0
        ? await directusRows(`/items/user?filter[user_id][_in]=${actorIds.join(",")}&fields=user_id,user_fname,user_mname,user_lname,user_email&limit=-1`, "Unable to load approval actors.", true)
        : [];
    const actors = new Map(actorRows.map(row => [relationId(row, ["user_id", "id"]), [row.user_fname, row.user_mname, row.user_lname].map(value => text(value, "")).filter(Boolean).join(" ") || text(row.user_email, "Unknown user")]));
    return historyRows.map(row => ({
        historyId: relationId(row, ["history_id", "id"]) || 0,
        action: text(row.action),
        stage: text(row.approval_stage),
        actor: actors.get(relationId(row.actor_id, ["user_id", "id"])) || relationText(row.actor_id, ["user_fname", "user_email"], "Unknown user"),
        actorRole: relationText(row.actor_role_id, ["name", "role_name"], "N/A"),
        remarks: text(row.remarks, ""),
        fromStatus: row.from_inventory_status == null ? "N/A" : inventoryStatusToPurchaseOrderStatus(number(row.from_inventory_status), number(row.payment_status)),
        toStatus: row.to_inventory_status == null ? "N/A" : inventoryStatusToPurchaseOrderStatus(number(row.to_inventory_status), number(row.payment_status)),
        revisionBefore: number(row.revision_before),
        revisionAfter: number(row.revision_after),
        createdAt: dateText(row.created_at),
        snapshotAvailable: Boolean(row.revision_snapshot)
    }));
}

async function loadReceivingData(
    purchaseOrderId: number,
    lines: readonly PurchaseOrderPrintLine[],
    selectedHeaderId: number | null
) {
    const headerRows = await directusRows(
        `/items/purchase_order_receiving_headers?filter[purchase_order_id][_eq]=${purchaseOrderId}&fields=*&sort=created_at,id&limit=-1`,
        "Unable to load receiving headers.",
        true
    );
    const selectedHeader = selectedHeaderId
        ? headerRows.find(row => relationId(row, ["id"]) === selectedHeaderId)
        : null;
    if (selectedHeaderId && !selectedHeader) {
        throw new PurchaseOrderPrintDataError(404, "The selected receiving header does not belong to this purchase order.");
    }
    const receivingRows = await directusRows(
        `/items/purchase_order_receiving?filter[purchase_order_id][_eq]=${purchaseOrderId}&filter[is_reverted][_eq]=0&fields=*&sort=received_date,purchase_order_product_id&limit=-1`,
        "Unable to load committed receiving records.",
        true
    );
    const filteredRows = selectedHeaderId
        ? receivingRows.filter(row => relationId(row.receiving_header_id, ["id"]) === selectedHeaderId)
        : receivingRows;
    const productById = new Map(lines.map(line => [line.productId, line]));
    const receivingIds = filteredRows.map(row => relationId(row, ["purchase_order_product_id", "id"])).filter((id): id is number => id !== null);
    const branchIds = [...new Set(filteredRows.map(row => relationId(row.branch_id, ["id", "branch_id"])).filter((id): id is number => id !== null))];
    const lotIds = [...new Set(filteredRows.map(row => relationId(row.lot_id, ["lot_id", "id"])).filter((id): id is number => id !== null))];
    const [branchRows, lotRows, movementDateRows] = await Promise.all([
        branchIds.length ? directusRows(`/items/branches?filter[id][_in]=${branchIds.join(",")}&fields=id,branch_name,branch_code&limit=-1`, "Unable to load receiving branches.", true) : [],
        lotIds.length ? directusRows(`/items/lots?filter[lot_id][_in]=${lotIds.join(",")}&fields=*&limit=-1`, "Unable to load receiving storage lots.", true) : [],
        receivingIds.length ? directusRows(`/items/inventory_movements?filter[source_document_id][_in]=${receivingIds.join(",")}&fields=source_document_id,manufacturing_date&limit=-1`, "Unable to load receiving manufacturing dates.", true) : []
    ]);
    const branches = new Map(branchRows.map(row => [relationId(row, ["id"]), `${text(row.branch_name, "Branch")} ${text(row.branch_code, "")}`.trim()]));
    const lots = new Map(lotRows.map(row => [relationId(row, ["lot_id", "id"]), text(row.lot_name || row.lot_code, relationId(row, ["lot_id", "id"]) ? `Lot #${relationId(row, ["lot_id", "id"])}` : "N/A")]));
    const movementDates = new Map(movementDateRows.map(row => [relationId(row.source_document_id, ["purchase_order_product_id", "id"]), dateText(row.manufacturing_date)]));
    const records: ReceivingPrintRecord[] = filteredRows.map(row => {
        const productLine = productById.get(relationId(row.product_id, ["product_id"]));
        const header = asRecord(row.receiving_header_id);
        const headerId = relationId(row.receiving_header_id, ["id"]);
        const receiptNumber = text(row.receipt_no || header?.receiving_ticket_no, "N/A");
        const received = number(row.received_quantity);
        const rejected = number(row.quantity_rejected);
        const branchId = relationId(row.branch_id, ["id", "branch_id"]);
        const lotId = relationId(row.lot_id, ["lot_id", "id"]);
        return {
            receivingRecordId: relationId(row, ["purchase_order_product_id", "id"]) || 0,
            headerId,
            receiptNumber,
            product: productLine?.productName || relationText(row.product_id, ["product_name"], "Unknown product"),
            productCode: productLine?.productCode || relationText(row.product_id, ["product_code"], "N/A"),
            branch: branches.get(branchId) || (branchId ? `Branch #${branchId}` : "N/A"),
            storageLot: lots.get(lotId) || (lotId ? `Lot #${lotId}` : "N/A"),
            batchNumber: text(row.batch_no),
            manufacturingDate: dateText(row.manufacturing_date) === "N/A"
                ? movementDates.get(relationId(row, ["purchase_order_product_id", "id"])) || "N/A"
                : dateText(row.manufacturing_date),
            expirationDate: dateText(row.expiry_date || row.expiration_date),
            receivedQuantity: received,
            acceptedQuantity: Math.max(0, received - rejected),
            rejectedQuantity: rejected,
            overDeliveryQuantity: number(row.over_delivery_quantity),
            qaStatus: text(row.qa_status),
            rejectionReason: text(row.rejection_reason, ""),
            unitCost: number(row.unit_price || productLine?.unitPrice),
            finalLandedUnitCost: number(row.final_landed_unit_cost || productLine?.finalLandedUnitCost),
            isReplacement: boolean(row.is_replacement),
            receivedDate: dateText(row.received_date)
        };
    });
    const sourceHeaderId = selectedHeaderId
        || (headerRows.length === 1 ? relationId(headerRows[0], ["id"]) : null);
    return { headers: selectedHeader ? [selectedHeader] : headerRows, rows: filteredRows, records, sourceHeaderId };
}

async function loadMovements(
    receivingRows: readonly DirectusRow[],
    lines: readonly PurchaseOrderPrintLine[]
): Promise<StorageMovementPrintRecord[]> {
    const receivingIds = receivingRows.map(row => relationId(row, ["purchase_order_product_id", "id"])).filter((id): id is number => id !== null);
    if (!receivingIds.length) return [];
    const movementRows = await directusRows(
        `/items/inventory_movements?filter[source_document_id][_in]=${receivingIds.join(",")}&fields=*&limit=-1`,
        "Unable to load inventory movements for the printable document.",
        true
    );
    const lineByProduct = new Map(lines.map(line => [line.productId, line]));
    const branchIds = [...new Set(movementRows.map(row => relationId(row.branch_id, ["id", "branch_id"])).filter((id): id is number => id !== null))];
    const lotIds = [...new Set(movementRows.map(row => relationId(row.lot_id, ["lot_id", "id"])).filter((id): id is number => id !== null))];
    const [branchRows, lotRows] = await Promise.all([
        branchIds.length ? directusRows(`/items/branches?filter[id][_in]=${branchIds.join(",")}&fields=id,branch_name,branch_code&limit=-1`, "Unable to load movement branches.", true) : [],
        lotIds.length ? directusRows(`/items/lots?filter[lot_id][_in]=${lotIds.join(",")}&fields=*&limit=-1`, "Unable to load movement lots.", true) : []
    ]);
    const branches = new Map(branchRows.map(row => [relationId(row, ["id"]), `${text(row.branch_name, "Branch")} ${text(row.branch_code, "")}`.trim()]));
    const lots = new Map(lotRows.map(row => [relationId(row, ["lot_id", "id"]), text(row.lot_name || row.lot_code, "N/A")]));
    return movementRows.map(row => {
        const productId = relationId(row.product_id, ["product_id"]);
        const branchId = relationId(row.branch_id, ["id", "branch_id"]);
        const lotId = relationId(row.lot_id, ["lot_id", "id"]);
        const transactionType = relationText(row.transaction_type_id || row.transaction_type, ["type_name", "name"], "N/A");
        return {
            movementId: relationId(row, ["movement_id", "id"]) || 0,
            kind: /reject|bad/i.test(transactionType) ? "Rejected" : "Passed",
            product: lineByProduct.get(productId)?.productName || relationText(row.product_id, ["product_name"], "Unknown product"),
            productCode: lineByProduct.get(productId)?.productCode || relationText(row.product_id, ["product_code"], "N/A"),
            storageLot: lots.get(lotId) || relationText(row.lot_id, ["lot_name", "lot_code"], lotId ? `Lot #${lotId}` : "N/A"),
            branch: branches.get(branchId) || relationText(row.branch_id, ["branch_name", "branch_code"], branchId ? `Branch #${branchId}` : "N/A"),
            quantity: number(row.quantity),
            transactionType,
            sourceDocument: text(row.source_document_no, relationId(row.source_document_id, ["purchase_order_product_id", "id"]) ? `#${relationId(row.source_document_id, ["purchase_order_product_id", "id"])}` : "N/A"),
            batchNumber: text(row.batch_no)
        };
    });
}

async function loadAllocations(
    receivingRows: readonly DirectusRow[],
    lines: readonly PurchaseOrderPrintLine[],
    movements: readonly StorageMovementPrintRecord[]
): Promise<StorageAllocationPrintRecord[]> {
    const receivingIds = receivingRows.map(row => relationId(row, ["purchase_order_product_id", "id"])).filter((id): id is number => id !== null);
    if (!receivingIds.length) return [];
    let rows: DirectusRow[] = [];
    try {
        rows = await directusRows(
            `/items/manufacturing_job_order_materials_reservations?filter[purchase_order_receiving_id][_in]=${receivingIds.join(",")}&fields=*&limit=-1`,
            "Unable to load MRP storage allocations.",
            true
        );
    } catch (error) {
        // Older manufacturing schemas do not expose the receiving-line link on
        // MRP reservations. Inventory movements remain the authoritative
        // storage handoff in that schema, so keep the printable usable while
        // leaving the allocation table empty instead of failing the document.
        if (!(error instanceof PurchaseOrderPrintDataError) || ![403, 404].includes(error.status)) throw error;
    }
    const lineByProduct = new Map(lines.map(line => [line.productId, line]));
    return rows.map(row => {
        const productId = relationId(row.product_id, ["product_id"])
            || relationId(asRecord(row.jo_material_id)?.product_id, ["product_id"]);
        const product = lineByProduct.get(productId);
        const productName = product?.productName || relationText(row.product_id, ["product_name"], productId ? `Product #${productId}` : "Unknown product");
        const lotNames = movements.filter(movement => movement.product === productName).map(movement => movement.storageLot);
        const material = asRecord(row.jo_material_id);
        const jobOrder = asRecord(material?.job_order_id || row.job_order_id);
        return {
            allocationId: relationId(row, ["jo_materials_reservation_id", "id"]) || 0,
            product: productName,
            jobOrder: relationText(jobOrder || row.job_order_id, ["job_order_no", "order_no", "number", "name"], "N/A"),
            material: relationText(row.jo_material_id, ["material_name", "name"], relationId(row.jo_material_id, ["jo_material_id"]) ? `Material #${relationId(row.jo_material_id, ["jo_material_id"])}` : "N/A"),
            quantity: number(row.reserved_quantity),
            inventoryLots: [...new Set(lotNames)].join(", ") || "N/A"
        };
    });
}

async function loadLandedCost(
    purchaseOrderId: number,
    lines: readonly PurchaseOrderPrintLine[]
): Promise<LandedCostPrintSnapshot | null> {
    const canonical = await getLandedCostComputation(purchaseOrderId);
    const computation = canonical.computation;
    if (!computation) return null;
    const computationId = number(computation.id);
    const allocationRows = await directusRows(
        `/items/purchase_order_landed_cost_allocations?filter[computation_id][_eq]=${computationId}&fields=*&sort=id&limit=-1`,
        "Unable to load landed-cost allocations.",
        true
    );
    const accountIds = [...new Set(canonical.expenses.map(expense => relationId(expense.chart_of_account_id, ["id", "coa_id"])).filter((id): id is number => id !== null))];
    const accountRows = accountIds.length
        ? await directusRows(`/items/chart_of_accounts?filter[id][_in]=${accountIds.join(",")}&fields=*&limit=-1`, "Unable to load landed-cost accounts.", true)
        : [];
    const accounts = new Map(accountRows.map(row => [relationId(row, ["id", "coa_id"]), `${text(row.gl_code, "GL")} ${text(row.account_title || row.account_name, "N/A")}`.trim()]));
    const lineById = new Map(lines.map(line => [line.lineId, line]));
    const expenses: LandedCostExpensePrintRecord[] = canonical.expenses.map(expense => ({
        expenseId: expense.expense_id || null,
        expenseType: text(expense.expense_type),
        account: accounts.get(relationId(expense.chart_of_account_id, ["id", "coa_id"])) || (expense.chart_of_account_id ? `Account #${expense.chart_of_account_id}` : "N/A"),
        amount: number(expense.amount_php)
    }));
    const allocations: LandedCostAllocationPrintRecord[] = allocationRows.map(row => {
        const lineId = relationId(row.purchase_order_product_id, ["purchase_order_product_id", "id"]);
        const line = lineById.get(lineId || 0);
        return {
            allocationId: relationId(row, ["id"]),
            lineId,
            product: line?.productName || relationText(row.product_id, ["product_name"], "Unknown product"),
            quantity: number(row.received_quantity),
            baseUnitCost: number(row.base_unit_cost_php),
            allocatedExpense: number(row.allocated_fee),
            finalLandedUnitCost: number(row.final_landed_unit_cost),
            allocationPercent: row.value_share == null ? null : number(row.value_share) * 100
        };
    });
    return {
        computationId,
        status: text(computation.status),
        allocationRule: text(computation.allocation_rule),
        finalizedAt: dateText(computation.finalized_at || computation.updated_at),
        totalLandedFee: number(computation.total_landed_fee || expenses.reduce((sum, expense) => sum + expense.amount, 0)),
        roundingVariance: number(computation.rounding_variance),
        expenses,
        allocations,
        attachments: canonical.attachments.map(attachment => text(attachment.file_name || attachment.directus_file_id))
    };
}

export async function loadPurchaseOrderPrintableData(input: {
    purchaseOrderId: number;
    documentType: PurchaseOrderPrintDocumentType;
    generatedBy: string;
    historyId?: number | null;
    receivingHeaderId?: number | null;
}): Promise<PurchaseOrderPrintableSnapshot> {
    const purchaseOrder = await directusRow(`/items/purchase_order/${input.purchaseOrderId}?fields=*`, "Purchase order was not found.");
    const [supplier, branch, paymentTerms, paymentMode, company, template, lines, approvals] = await Promise.all([
        loadSupplier(purchaseOrder.supplier_name),
        loadBranch(purchaseOrder.branch_id),
        lookupRow("payment_terms", relationId(purchaseOrder.payment_terms, ["id"]), "id,payment_name,payment_days,payment_description"),
        lookupRow("purchase_order_payment_modes", relationId(purchaseOrder.payment_mode, ["id"]), "id,mode_name,code"),
        loadCompanyHeader(),
        loadPrintableTemplate(),
        loadLines(input.purchaseOrderId),
        loadApprovalHistory(input.purchaseOrderId)
    ]);
    const selectedApproval = input.historyId
        ? approvals.find(entry => entry.historyId === input.historyId) || null
        : approvals.slice().reverse().find(entry => entry.stage === "Finance" && ["FinanceApproved", "Rejected", "Cancelled"].includes(entry.action)) || null;
    if (input.historyId && selectedApproval && !["FinanceApproved", "Rejected", "Cancelled"].includes(selectedApproval.action)) {
        throw new PurchaseOrderPrintDataError(409, "The selected approval-history record is not a Finance decision.");
    }
    if (input.documentType === "FINANCE_DECISION" && !selectedApproval) {
        throw new PurchaseOrderPrintDataError(409, "No Finance approval or rejection record is available for this purchase order.");
    }
    const needsReceivingData = input.documentType === "QA_GOODS_RECEIPT" || input.documentType === "STORAGE_LOT_ALLOCATION";
    const receiving = needsReceivingData
        ? await loadReceivingData(input.purchaseOrderId, lines, input.receivingHeaderId || null)
        : { headers: [], rows: [], records: [], sourceHeaderId: null };
    if ((input.documentType === "QA_GOODS_RECEIPT" || input.documentType === "STORAGE_LOT_ALLOCATION") && receiving.records.length === 0) {
        throw new PurchaseOrderPrintDataError(409, "No committed QA goods-receipt record is available for this purchase order.");
    }
    const movements = input.documentType === "STORAGE_LOT_ALLOCATION"
        ? await loadMovements(receiving.rows, lines)
        : [];
    const allocations = input.documentType === "STORAGE_LOT_ALLOCATION"
        ? await loadAllocations(receiving.rows, lines, movements)
        : [];
    const landedCost = input.documentType === "LANDED_COST"
        ? await loadLandedCost(input.purchaseOrderId, lines)
        : null;
    if (input.documentType === "LANDED_COST" && !landedCost) {
        throw new PurchaseOrderPrintDataError(409, "No landed-cost computation is available for this purchase order.");
    }
    const supplierAddress = supplier.address;
    const header: PurchaseOrderPrintHeader = {
        id: input.purchaseOrderId,
        purchaseOrderNumber: text(purchaseOrder.purchase_order_no || purchaseOrder.purchase_order_id),
        reference: text(purchaseOrder.reference),
        encodedAt: dateText(purchaseOrder.date_encoded),
        supplier: supplier.name,
        supplierAddress,
        vendorClass: supplier.vendorClass,
        branch,
        paymentTerms: text(paymentTerms?.payment_name || paymentTerms?.payment_description, purchaseOrder.payment_terms ? `Payment Terms #${purchaseOrder.payment_terms}` : "N/A"),
        deliveryTerms: text(purchaseOrder.delivery_terms),
        paymentMode: text(paymentMode?.mode_name || paymentMode?.code, purchaseOrder.payment_mode ? `Payment Mode #${purchaseOrder.payment_mode}` : "N/A"),
        paymentArrangement: paymentArrangement(purchaseOrder.payment_type),
        priceType: text(purchaseOrder.price_type),
        currencyCode: text(purchaseOrder.currency_code, "PHP"),
        exchangeRate: number(purchaseOrder.exchange_rate, 1),
        inventoryStatus: inventoryStatusToPurchaseOrderStatus(number(purchaseOrder.inventory_status), number(purchaseOrder.payment_status)),
        paymentStatus: paymentStatusLabel(purchaseOrder.payment_status),
        workflowRevision: number(purchaseOrder.workflow_revision),
        totalAmount: number(purchaseOrder.total_amount || purchaseOrder.net_amount),
        grossAmount: number(purchaseOrder.gross_amount),
        totalForeignCurrency: number(purchaseOrder.total_foreign_currency),
        remark: text(purchaseOrder.remark, ""),
        isPosted: boolean(purchaseOrder.is_posted),
        isPostedAmounts: boolean(purchaseOrder.is_posted_amounts),
        isForceReceived: Boolean(text(purchaseOrder.force_received_at, "")),
        forceReceivedAt: text(purchaseOrder.force_received_at, ""),
        forceReceivedReason: text(purchaseOrder.force_received_reason, "")
    };
    return {
        documentType: input.documentType,
        generatedAt: new Date().toISOString(),
        generatedBy: input.generatedBy,
        company,
        template,
        purchaseOrder: header,
        lines,
        approvals,
        selectedApproval,
        receivingRecords: receiving.records,
        movements,
        allocations,
        landedCost,
        sourceReceivingHeaderId: receiving.sourceHeaderId
    };
}
