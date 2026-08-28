import { DisbursementPayload } from "./disbursement.schema";
import {
    directusFetch,
    getSupplierIds,
    getWerDocumentNumbers,
    getLineItems,
    getUserMap,
    getCoaMap,
    getDivisionMap,
    getBankMap,
    resolveEncoderId,
    loadNormalizedDisbursement,
    compensateCreatedDisbursement,
} from "./disbursement.repo";
import {
    cleanSupportingDocsUrl,
    normalizeDisbursement,
    canonicalizeDisbursementPayload,
    canonicalizePersistedDisbursement,
    asNumber,
    resolveTransactionTypeId,
    relationId,
} from "./disbursement.helpers";
import { DisbursementRow, DirectusList, PayableInput, PaymentInput, RelationValue } from "./disbursement.types";
import {
    acquireDocumentNumberLock,
    findNextAvailableDocumentNumber,
    isDocumentNumberConflictError,
} from "@/modules/manufacturing-management/financial-management/treasury/disbursement/document-number";
import {
    findTaggedPurchaseOrderReferences,
    findUnpostedPurchaseOrderReferences,
} from "@/app/api/manufacturing/financial-management/cash-issuance/disbursements/_purchase-order-eligibility";
import {
    findMissingPayableDivisionError,
    findMissingVatPrincipalDivisionError,
    normalizeVatSplitDivisions,
} from "@/app/api/manufacturing/financial-management/cash-issuance/disbursements/_payable-split-integrity";
import { acquireMemoCapLock, validateSupplierMemoCaps, refreshSupplierMemoStatuses } from "@/app/api/manufacturing/financial-management/cash-issuance/disbursements/_memo-cap-integrity";
import { isPettyCashBankAccount, validatePaymentLine } from "@/app/api/manufacturing/financial-management/cash-issuance/disbursements/_payment-method";
import { findMissingPayableDateError } from "./disbursement.helpers";
import { isPaymentAllocationScope, resolveDisbursementUpdateStatus } from "@/modules/manufacturing-management/financial-management/cash-issuance/utils/update-scope";

function normalizePage(value: string | null) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
}

function normalizeSize(value: string | null) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return 20;
    return Math.min(100, Math.floor(parsed));
}

function appendFilter(params: URLSearchParams, index: number, field: string, operator: string, value: string) {
    params.set(`filter[_and][${index}][${field}][${operator}]`, value);
    return index + 1;
}

export class DisbursementService {
    static async listDisbursements(searchParams: URLSearchParams) {
        const supplier = searchParams.get("supplier") || "";
        const supplierIds = await getSupplierIds(supplier);
        const page = normalizePage(searchParams.get("page"));
        const size = normalizeSize(searchParams.get("size"));

        if (supplier && supplierIds.length === 0) {
            return { content: [], totalElements: 0, totalPages: 0, number: page, size };
        }

        const source = searchParams.get("source")?.trim().toUpperCase() || "";
        const werDocumentNumbers = source === "WER" ? await getWerDocumentNumbers() : [];

        if (source === "WER" && werDocumentNumbers.length === 0) {
            return { content: [], totalElements: 0, totalPages: 0, number: page, size };
        }

        const type = searchParams.get("type") || "All";
        const status = searchParams.get("status") || "All";
        const startDate = searchParams.get("startDate") || "";
        const endDate = searchParams.get("endDate") || "";
        const divisionId = searchParams.get("divisionId") || "";
        const departmentId = searchParams.get("departmentId") || "";
        const docNo = searchParams.get("docNo") || "";
        const isPosted = searchParams.get("isPosted") || "";

        const params = new URLSearchParams();
        let filterIndex = 0;

        params.set("limit", String(size));
        params.set("offset", String(page * size));
        params.set("meta", "filter_count");
        params.set("sort", "-date_created,-id");
        params.set(
            "fields",
            [
                "id",
                "doc_no",
                "transaction_type",
                "payee.id",
                "payee.supplier_name",
                "remarks",
                "total_amount",
                "paid_amount",
                "encoder_id",
                "approver_id",
                "posted_by",
                "isPosted",
                "transaction_date",
                "date_created",
                "date_approved",
                "date_posted",
                "division_id.division_id",
                "division_id.division_name",
                "department_id.department_id",
                "department_id.department_name",
                "fund_source_id",
                "supporting_documents_url",
                "status",
            ].join(","),
        );

        if (type === "Trade") filterIndex = appendFilter(params, filterIndex, "transaction_type", "_eq", "1");
        else if (type === "Non-Trade") filterIndex = appendFilter(params, filterIndex, "transaction_type", "_eq", "2");

        if (source === "WER") filterIndex = appendFilter(params, filterIndex, "doc_no", "_in", werDocumentNumbers.join(","));

        if (status && status !== "All") {
            const op = status.includes(",") ? "_in" : "_eq";
            filterIndex = appendFilter(params, filterIndex, "status", op, status);
        } else {
            filterIndex = appendFilter(params, filterIndex, "status", "_neq", "Deleted");
        }

        if (isPosted !== "") filterIndex = appendFilter(params, filterIndex, "isPosted", "_eq", isPosted);
        if (supplierIds.length > 0) filterIndex = appendFilter(params, filterIndex, "payee", "_in", supplierIds.join(","));
        if (startDate) filterIndex = appendFilter(params, filterIndex, "transaction_date", "_gte", startDate);
        if (endDate) filterIndex = appendFilter(params, filterIndex, "transaction_date", "_lte", endDate);
        if (divisionId) filterIndex = appendFilter(params, filterIndex, "division_id", "_eq", divisionId);
        if (departmentId) filterIndex = appendFilter(params, filterIndex, "department_id", "_eq", departmentId);
        if (docNo) appendFilter(params, filterIndex, "doc_no", "_contains", docNo);

        const disbursementsRes = await directusFetch<DirectusList<DisbursementRow>>(`/items/disbursement?${params.toString()}`);
        const rows = disbursementsRes.data ?? [];
        const ids = rows.map((row) => asNumber(row.id) ?? 0).filter(Boolean);
        const lineItems = await getLineItems(ids);
        const totalElements = asNumber(disbursementsRes.meta?.filter_count) ?? rows.length;

        const userIdsToFetch: number[] = [];
        const addId = (val: number | undefined) => {
            if (typeof val === "number" && Number.isFinite(val)) userIdsToFetch.push(val);
        };
        rows.forEach(row => {
            addId(relationId(row.encoder_id, "user_id"));
            addId(relationId(row.approver_id, "user_id"));
            addId(relationId(row.posted_by, "user_id"));
        });

        const userMap = await getUserMap(userIdsToFetch);
        const coaMap = await getCoaMap();
        const divisionMap = await getDivisionMap();
        const bankMap = await getBankMap();

        return {
            content: rows.map((row) => normalizeDisbursement(row, lineItems.payables.get(asNumber(row.id) || 0) || [], lineItems.payments.get(asNumber(row.id) || 0) || [], userMap, coaMap, divisionMap, bankMap)),
            totalElements,
            totalPages: Math.ceil(totalElements / size),
            number: page,
            size,
        };
    }

    static async createDisbursement(body: DisbursementPayload, encoderEmail: string | null) {
        const currentUserId = await resolveEncoderId(encoderEmail);
        if (!currentUserId) throw new Error("User Profile Not Found");

        let createdId: number | undefined;

        let creationFinalized = false;
        let releaseMemoCapLock: (() => void) | undefined;
        let releaseDocumentNumberLock: (() => void) | undefined;

        try {
            const transactionTypeId = Number(body.transactionTypeId) as 1 | 2;
            if (transactionTypeId !== 1 && transactionTypeId !== 2) throw new Error("Transaction Type must be Trade (1) or Non-Trade (2).");
            
            const requestedPayables = (body.payables || []) as PayableInput[];
            const requestedPayments = (body.payments || []) as PaymentInput[];
            const missingPrincipalDivisionError = findMissingVatPrincipalDivisionError(requestedPayables);
            if (missingPrincipalDivisionError) throw new Error(missingPrincipalDivisionError);
            
            const normalizedPayables = normalizeVatSplitDivisions(requestedPayables);
            const payableLinesInput = normalizedPayables.filter((line) =>
                !!line.coaId || (line.amount != null && Number(line.amount) !== 0) || (line.referenceNo && line.referenceNo.trim() !== "")
            );
            
            const missingPayableDivisionError = findMissingPayableDivisionError(payableLinesInput);
            if (missingPayableDivisionError) throw new Error(missingPayableDivisionError);
            
            const missingPayableDateError = findMissingPayableDateError(payableLinesInput);
            if (missingPayableDateError) throw new Error(missingPayableDateError);
            
            const paymentLinesInput = requestedPayments.filter((line) =>
                !!line.coaId || (line.amount != null && Number(line.amount) !== 0) || (line.checkNo != null && String(line.checkNo).trim() !== "")
            );
            
            const [coaMap, bankMap] = await Promise.all([getCoaMap(), getBankMap()]);
            for (let index = 0; index < paymentLinesInput.length; index++) {
                const line = paymentLinesInput[index];
                const validationError = validatePaymentLine(line, coaMap.get(Number(line.coaId)), bankMap.get(Number(line.bankId)));
                if (validationError) throw new Error(`Payment row ${index + 1} is invalid: ${validationError}`);
            }
            
            const normalizedPaymentLines = paymentLinesInput.map((line) =>
                isPettyCashBankAccount(bankMap.get(Number(line.bankId))) ? { ...line, checkNo: "" } : line
            );

            releaseMemoCapLock = await acquireMemoCapLock(payableLinesInput);

            if (!body.payeeId) throw new Error("Payee (Supplier ID) is required.");

            const memoCapError = await validateSupplierMemoCaps(Number(body.payeeId), requestedPayables);
            if (memoCapError) {
                const err = new Error(memoCapError.isLocked ? "Supplier memo is currently locked by an unposted TR." : "Supplier memo amount exceeds its authorized cap.") as Error & { status?: number; detail?: unknown };
                err.status = 409;
                err.detail = memoCapError;
                throw err;
            }

            const taggedPoReferences = await findTaggedPurchaseOrderReferences(requestedPayables.map((line) => line.referenceNo), Number(body.payeeId));
            if (taggedPoReferences.length > 0) throw new Error("Disbursement cannot include purchase orders already tagged to an existing TR.");

            const unpostedPoReferences = await findUnpostedPurchaseOrderReferences(requestedPayables.map((line) => line.referenceNo), Number(body.payeeId));
            if (unpostedPoReferences.length > 0) throw new Error("Disbursement cannot include purchase-order amounts that have not been posted.");

            const incomingCanonical = canonicalizeDisbursementPayload({
                transactionTypeId, payeeId: body.payeeId, remarks: body.remarks, totalAmount: body.totalAmount,
                transactionDate: body.transactionDate, departmentId: body.departmentId, fundSourceId: body.fundSourceId,
                supportingDocumentsUrl: body.supportingDocumentsUrl, payables: payableLinesInput, payments: normalizedPaymentLines,
            });

            const calculatedPaidAmount = normalizedPaymentLines.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

            releaseDocumentNumberLock = await acquireDocumentNumberLock(transactionTypeId);
            let createRes: { data: DisbursementRow } | undefined;
            for (let attempt = 0; attempt < 16; attempt++) {
                const docNoForCreation = await findNextAvailableDocumentNumber(transactionTypeId, directusFetch);
                const headerPayload = {
                    doc_no: docNoForCreation, transaction_type: transactionTypeId, payee: Number(body.payeeId),
                    remarks: body.remarks || "", total_amount: Number(body.totalAmount) || 0, paid_amount: calculatedPaidAmount,
                    encoder_id: currentUserId, transaction_date: body.transactionDate, division_id: null,
                    department_id: body.departmentId ? Number(body.departmentId) : null,
                    fund_source_id: body.fundSourceId ? Number(body.fundSourceId) : null,
                    supporting_documents_url: cleanSupportingDocsUrl(body.supportingDocumentsUrl),
                    status: "Draft", approver_id: null, date_approved: null,
                };
                try {
                    createRes = await directusFetch<{ data: DisbursementRow }>("/items/disbursement", { method: "POST", body: JSON.stringify(headerPayload) });
                    break;
                } catch (error: unknown) {
                    if (!isDocumentNumberConflictError(error) || attempt === 15) throw error;
                }
            }

            if (!createRes) throw new Error("Disbursement could not be created with an available document number.");
            const createdDisbursement = createRes.data;
            const persistedId = asNumber(createdDisbursement.id);
            if (!persistedId) throw new Error("Disbursement created but returned no ID.");
            createdId = persistedId;

            const payableLines = payableLinesInput.map((line) => ({
                disbursement_id: persistedId, division_id: line.divisionId ? Number(line.divisionId) : null,
                reference_no: line.referenceNo || "", date: line.date, coa_id: line.coaId ? Number(line.coaId) : null,
                amount: Number(line.amount) || 0, remarks: line.remarks || ""
            }));

            const paymentLines = normalizedPaymentLines.map((line) => {
                const payload: Record<string, unknown> = {
                    disbursement_id: persistedId, coa_id: line.coaId ? Number(line.coaId) : null,
                    bank_id: line.bankId ? Number(line.bankId) : null, check_no: line.checkNo || "",
                    date: line.date, amount: Number(line.amount) || 0, remarks: line.remarks || ""
                };
                if (line.releasedDate != null && line.releasedDate !== "") payload.released_date = line.releasedDate;
                return payload;
            });

            await Promise.all([
                payableLines.length > 0 ? directusFetch("/items/disbursement_payables", { method: "POST", body: JSON.stringify(payableLines) }) : Promise.resolve(),
                paymentLines.length > 0 ? directusFetch("/items/disbursement_payments", { method: "POST", body: JSON.stringify(paymentLines) }) : Promise.resolve(),
            ]);

            const verifiedLineItems = await getLineItems([persistedId]);
            const verifiedPayables = verifiedLineItems.payables.get(persistedId) || [];
            const verifiedPayments = verifiedLineItems.payments.get(persistedId) || [];
            const verifiedCanonical = canonicalizePersistedDisbursement(createdDisbursement, verifiedPayables, verifiedPayments);
            if (verifiedCanonical !== incomingCanonical) throw new Error("Created disbursement lines failed integrity verification.");

            creationFinalized = true;

            const freshDis = await directusFetch<{ data: DisbursementRow }>(`/items/disbursement/${persistedId}?fields=id,doc_no,transaction_type,payee.id,payee.supplier_name,remarks,total_amount,paid_amount,encoder_id,approver_id,posted_by,isPosted,transaction_date,date_created,date_approved,date_posted,division_id.division_id,division_id.division_name,department_id.department_id,department_id.department_name,fund_source_id,supporting_documents_url,status`);
            return await loadNormalizedDisbursement(freshDis.data);
        } catch (err) {
            if (createdId && !creationFinalized) {
                try {
                    await compensateCreatedDisbursement(createdId);
                } catch (cleanupError) {
                    console.error("Cleanup error:", cleanupError);
                }
            }
            throw err;
        } finally {
            releaseDocumentNumberLock?.();
            releaseMemoCapLock?.();
        }
    }

    static async updateDisbursement(id: number, body: DisbursementPayload, encoderEmail: string | null) {
        const currentUserId = await resolveEncoderId(encoderEmail);
        if (!currentUserId) throw new Error("User Profile Not Found");

        let releaseMemoCapLock: (() => void) | undefined;
        try {
            const isPaymentAllocationUpdate = isPaymentAllocationScope(body.scope || "");
            
            if (isPaymentAllocationUpdate) {
                const unexpectedFields = [
                    "docNo", "transactionTypeId", "payeeId", "remarks", "totalAmount",
                    "transactionDate", "departmentId", "fundSourceId", "supportingDocumentsUrl", "payables",
                ].filter((field) => Object.prototype.hasOwnProperty.call(body, field));
                if (unexpectedFields.length > 0) {
                    throw new Error(`Payment allocation updates cannot change voucher header or payable fields. Remove: ${unexpectedFields.join(", ")}`);
                }
            }

            const requestedTransactionTypeId = body.transactionTypeId == null ? null : Number(body.transactionTypeId);
            if (requestedTransactionTypeId !== null && requestedTransactionTypeId !== 1 && requestedTransactionTypeId !== 2) {
                throw new Error("Transaction Type must be Trade (1) or Non-Trade (2).");
            }

            const requestedPayables = (body.payables || []) as PayableInput[];
            const hasPaymentPatch = Object.prototype.hasOwnProperty.call(body, "payments");
            const requestedPayments = hasPaymentPatch && Array.isArray(body.payments) ? body.payments as PaymentInput[] : [];

            if (isPaymentAllocationUpdate && !hasPaymentPatch) throw new Error("Payment allocation lines are required.");

            const missingPrincipalDivisionError = isPaymentAllocationUpdate ? null : findMissingVatPrincipalDivisionError(requestedPayables);
            if (missingPrincipalDivisionError) throw new Error(missingPrincipalDivisionError);

            const normalizedPayables = normalizeVatSplitDivisions(requestedPayables);
            const payableLinesInput = normalizedPayables.filter((line) =>
                !!line.coaId || (line.amount != null && Number(line.amount) !== 0) || (line.referenceNo && line.referenceNo.trim() !== "")
            );

            const missingPayableDivisionError = isPaymentAllocationUpdate ? null : findMissingPayableDivisionError(payableLinesInput);
            if (missingPayableDivisionError) throw new Error(missingPayableDivisionError);

            const missingPayableDateError = isPaymentAllocationUpdate ? null : findMissingPayableDateError(payableLinesInput);
            if (missingPayableDateError) throw new Error(missingPayableDateError);

            const paymentLinesInput = hasPaymentPatch ? requestedPayments.filter((line) =>
                !!line.coaId || (line.amount != null && Number(line.amount) !== 0) || (line.checkNo != null && String(line.checkNo).trim() !== "")
            ) : [];

            const [coaMap, bankMap] = await Promise.all([getCoaMap(), getBankMap()]);
            for (let index = 0; index < paymentLinesInput.length; index++) {
                const line = paymentLinesInput[index];
                const validationError = validatePaymentLine(line, coaMap.get(Number(line.coaId)), bankMap.get(Number(line.bankId)));
                if (validationError) throw new Error(`Payment row ${index + 1} is invalid. ${validationError}`);
            }

            const normalizedPaymentLines = paymentLinesInput.map((line) =>
                isPettyCashBankAccount(bankMap.get(Number(line.bankId))) ? { ...line, checkNo: "" } : line
            );

            const currentDisReq = await directusFetch<{ data: DisbursementRow }>(`/items/disbursement/${id}`);
            if (!currentDisReq?.data) throw new Error("Disbursement not found");
            const currentDis = currentDisReq.data;
            
            const transactionTypeId = requestedTransactionTypeId ?? resolveTransactionTypeId(currentDis.transaction_type, currentDis.doc_no);
            if (transactionTypeId === null) throw new Error("Transaction Type is missing. Repair the voucher before updating it.");
            if (currentDis.status === "Submitted") throw new Error("Submitted vouchers are locked and cannot be edited.");
            if (Number(currentDis.isPosted) === 1) throw new Error("Cannot modify a transaction that is already Posted to the GL. This record is immutable.");

            const allowedStatuses = ["Draft", "Approved", "Returned for Revision", "Released", "Partially Released"];
            if (!allowedStatuses.includes(currentDis.status as string)) throw new Error("Only Draft, Approved, Returned, Released, or Partially Released disbursements can be edited.");

            const currentLineItems = await getLineItems([id]);
            const currentPayables = currentLineItems.payables.get(id) || [];
            const currentPayments = currentLineItems.payments.get(id) || [];
            
            const currentPayeeId = currentDis.payee && typeof currentDis.payee === "object" && "id" in currentDis.payee
                ? Number(currentDis.payee.id)
                : Number(currentDis.payee);
            const currentTransactionTypeId = resolveTransactionTypeId(currentDis.transaction_type, currentDis.doc_no);

            if (isPaymentAllocationUpdate) {
                if (currentDis.status !== "Approved" && currentDis.status !== "Partially Released") {
                    const err = new Error("Payment allocations can only be edited for Approved or Partially Released vouchers.") as Error & { status?: number };
                    err.status = 409; throw err;
                }
                const effectivePaymentTotal = normalizedPaymentLines.reduce((sum, line) => sum + (Number(line.amount) || 0), 0);
                const currentTotalAmount = Number(currentDis.total_amount) || 0;
                
                if (effectivePaymentTotal > currentTotalAmount + 0.01) {
                    throw new Error(`Payments total ${effectivePaymentTotal.toFixed(2)} exceeds voucher total ${currentTotalAmount.toFixed(2)}.`);
                }

                const paymentIds = currentPayments.map(line => Number(line.id)).filter(pid => Number.isInteger(pid) && pid > 0);
                if (paymentIds.length > 0) {
                    await directusFetch("/items/disbursement_payments", { method: "DELETE", body: JSON.stringify(paymentIds) });
                }

                const paymentLines = normalizedPaymentLines.map(line => ({
                    disbursement_id: id, coa_id: line.coaId ? Number(line.coaId) : null, bank_id: line.bankId ? Number(line.bankId) : null,
                    check_no: line.checkNo || "", date: line.date, amount: Number(line.amount) || 0, remarks: line.remarks || "",
                    ...(line.releasedDate != null && line.releasedDate !== "" ? { released_date: line.releasedDate } : {}),
                }));

                if (paymentLines.length > 0) {
                    await directusFetch("/items/disbursement_payments", { method: "POST", body: JSON.stringify(paymentLines) });
                }

                const paymentHeaderRes = await directusFetch<{ data: DisbursementRow }>(`/items/disbursement/${id}`, {
                    method: "PATCH", body: JSON.stringify({ paid_amount: effectivePaymentTotal })
                });

                const verifiedPaymentItems = await getLineItems([id]);
                const expectedCanonical = canonicalizeDisbursementPayload({
                    transactionTypeId: currentTransactionTypeId, payeeId: currentPayeeId, remarks: currentDis.remarks,
                    totalAmount: currentDis.total_amount, transactionDate: currentDis.transaction_date,
                    departmentId: relationId(currentDis.department_id, "department_id"),
                    fundSourceId: relationId(currentDis.fund_source_id as RelationValue),
                    supportingDocumentsUrl: currentDis.supporting_documents_url,
                    payables: currentPayables.map((line) => ({
                        divisionId: relationId(line.division_id, "division_id"), referenceNo: line.reference_no,
                        date: line.date, coaId: relationId(line.coa_id, "coa_id"), amount: line.amount, remarks: line.remarks,
                    })),
                    payments: normalizedPaymentLines,
                });
                
                const actualCanonical = canonicalizePersistedDisbursement(currentDis, verifiedPaymentItems.payables.get(id) || [], verifiedPaymentItems.payments.get(id) || []);
                if (actualCanonical !== expectedCanonical) throw new Error("Payment allocation update failed integrity verification.");

                return await loadNormalizedDisbursement({ ...currentDis, ...paymentHeaderRes.data, paid_amount: effectivePaymentTotal });
            }

            const effectivePaymentLines = hasPaymentPatch ? normalizedPaymentLines : currentPayments.map(line => ({
                coaId: relationId(line.coa_id, "coa_id"), bankId: relationId(line.bank_id as RelationValue),
                checkNo: line.check_no == null ? "" : String(line.check_no), date: line.date == null ? undefined : String(line.date),
                amount: Number(line.amount) || 0, remarks: line.remarks == null ? "" : String(line.remarks),
            }));

            const incomingCanonical = canonicalizeDisbursementPayload({
                transactionTypeId, payeeId: body.payeeId, remarks: body.remarks, totalAmount: body.totalAmount,
                transactionDate: body.transactionDate, departmentId: body.departmentId, fundSourceId: body.fundSourceId,
                supportingDocumentsUrl: body.supportingDocumentsUrl, payables: payableLinesInput, payments: effectivePaymentLines,
            });

            const currentNonPaymentCanonical = canonicalizeDisbursementPayload({
                transactionTypeId: currentTransactionTypeId, payeeId: currentPayeeId, remarks: currentDis.remarks,
                totalAmount: currentDis.total_amount, transactionDate: currentDis.transaction_date,
                departmentId: relationId(currentDis.department_id, "department_id"), fundSourceId: relationId(currentDis.fund_source_id as RelationValue),
                supportingDocumentsUrl: currentDis.supporting_documents_url,
                payables: currentPayables.map((line) => ({
                    divisionId: relationId(line.division_id, "division_id"), referenceNo: line.reference_no, date: line.date,
                    coaId: relationId(line.coa_id, "coa_id"), amount: line.amount, remarks: line.remarks,
                })),
                payments: [],
            });

            const incomingNonPaymentCanonical = canonicalizeDisbursementPayload({
                transactionTypeId, payeeId: body.payeeId, remarks: body.remarks, totalAmount: body.totalAmount,
                transactionDate: body.transactionDate, departmentId: body.departmentId, fundSourceId: body.fundSourceId,
                supportingDocumentsUrl: body.supportingDocumentsUrl, payables: payableLinesInput, payments: [],
            });

            const isPaymentOnlyPartialEdit = currentDis.status === "Partially Released" && currentNonPaymentCanonical === incomingNonPaymentCanonical;
            if (currentDis.status === "Partially Released" && !isPaymentOnlyPartialEdit) {
                const err = new Error("Partially released vouchers can only be updated through payment lines.") as Error & { status?: number };
                err.status = 409; throw err;
            }

            const effectivePaymentTotal = effectivePaymentLines.reduce((sum, line) => sum + (Number(line.amount) || 0), 0);
            const requestedTotalAmount = Number(body.totalAmount) || 0;
            if (effectivePaymentTotal > requestedTotalAmount + 0.01) {
                throw new Error(`Payments total ${effectivePaymentTotal.toFixed(2)} exceeds voucher total ${requestedTotalAmount.toFixed(2)}.`);
            }

            if (canonicalizePersistedDisbursement(currentDis, currentPayables, currentPayments) === incomingCanonical) {
                return await loadNormalizedDisbursement(currentDis);
            }

            if (!isPaymentOnlyPartialEdit) {
                const payableSupplierId = body.payeeId != null ? Number(body.payeeId) : currentPayeeId;
                const taggedPoReferences = await findTaggedPurchaseOrderReferences(requestedPayables.map(line => line.referenceNo), payableSupplierId, id);
                if (taggedPoReferences.length > 0) throw new Error("Disbursement cannot include purchase orders already tagged to another TR.");

                releaseMemoCapLock = await acquireMemoCapLock([
                    ...currentPayables.map((line) => ({ referenceNo: line.reference_no, amount: line.amount })),
                    ...payableLinesInput,
                ]);

                const unpostedPoReferences = await findUnpostedPurchaseOrderReferences(requestedPayables.map(line => line.referenceNo), payableSupplierId);
                if (unpostedPoReferences.length > 0) throw new Error("Disbursement cannot include purchase-order amounts that have not been posted.");

                const memoCapError = await validateSupplierMemoCaps(payableSupplierId, requestedPayables, id);
                if (memoCapError) {
                    const err = new Error(memoCapError.isLocked ? "Supplier memo is currently locked by an unposted TR." : "Supplier memo amount exceeds its authorized cap.") as Error & { status?: number; detail?: unknown };
                    err.status = 409; err.detail = memoCapError; throw err;
                }
            }

            const payableIds = currentPayables.map(p => p.id);
            const paymentIds = currentPayments.map(p => p.id);

            if (payableIds.length > 0) {
                await directusFetch("/items/disbursement_payables", { method: "DELETE", body: JSON.stringify(payableIds) });
            }
            if (hasPaymentPatch && paymentIds.length > 0) {
                await directusFetch("/items/disbursement_payments", { method: "DELETE", body: JSON.stringify(paymentIds) });
            }

            const sameMoney = (left: unknown, right: unknown) => Math.round((Number(left) || 0) * 100) === Math.round((Number(right) || 0) * 100);
            const isHeaderOrPayableModified = (body.totalAmount != null && !sameMoney(body.totalAmount, currentDis.total_amount)) ||
                (body.payeeId != null && Number(body.payeeId) !== currentPayeeId) || transactionTypeId !== currentTransactionTypeId;

            const newStatus = resolveDisbursementUpdateStatus(currentDis.status as string, body.scope || "", isHeaderOrPayableModified);
            let approverId: number | null | undefined = relationId(currentDis.approver_id, "user_id");
            let dateApproved = currentDis.date_approved;
            if (newStatus === "Submitted" && currentDis.status === "Approved") {
                approverId = null; dateApproved = null;
            }

            const calculatedPaidAmount = effectivePaymentLines.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

            const headerPayload = {
                transaction_type: transactionTypeId, payee: Number(body.payeeId), remarks: body.remarks || "",
                total_amount: Number(body.totalAmount) || 0, paid_amount: calculatedPaidAmount, transaction_date: body.transactionDate,
                division_id: null, department_id: body.departmentId ? Number(body.departmentId) : null,
                fund_source_id: body.fundSourceId ? Number(body.fundSourceId) : null,
                supporting_documents_url: cleanSupportingDocsUrl(body.supportingDocumentsUrl), status: newStatus,
                approver_id: approverId, date_approved: dateApproved,
            };

            const updateRes = await directusFetch<{ data: DisbursementRow }>(`/items/disbursement/${id}`, {
                method: "PATCH", body: JSON.stringify(headerPayload),
            });
            const updatedHeader = updateRes.data;

            const payableLines = normalizedPayables.filter((line) => !!line.coaId || (line.amount != null && Number(line.amount) !== 0) || (line.referenceNo && line.referenceNo.trim() !== ""))
                .map((line) => ({
                    disbursement_id: id, division_id: line.divisionId ? Number(line.divisionId) : null, reference_no: line.referenceNo || "",
                    date: line.date, coa_id: line.coaId ? Number(line.coaId) : null, amount: Number(line.amount) || 0, remarks: line.remarks || ""
                }));

            const paymentLines = hasPaymentPatch ? normalizedPaymentLines
                .filter((line) => !!line.coaId || (line.amount != null && Number(line.amount) !== 0) || (line.checkNo != null && String(line.checkNo).trim() !== ""))
                .map((line) => {
                    const payload: Record<string, unknown> = {
                        disbursement_id: id, coa_id: line.coaId ? Number(line.coaId) : null, bank_id: line.bankId ? Number(line.bankId) : null,
                        check_no: line.checkNo || "", date: line.date, amount: Number(line.amount) || 0, remarks: line.remarks || ""
                    };
                    if (line.releasedDate != null && line.releasedDate !== "") payload.released_date = line.releasedDate;
                    return payload;
                }) : [];

            await Promise.all([
                payableLines.length > 0 ? directusFetch("/items/disbursement_payables", { method: "POST", body: JSON.stringify(payableLines) }) : Promise.resolve(),
                paymentLines.length > 0 ? directusFetch("/items/disbursement_payments", { method: "POST", body: JSON.stringify(paymentLines) }) : Promise.resolve(),
            ]);

            const verifiedLineItems = await getLineItems([id]);
            if (canonicalizePersistedDisbursement(updatedHeader, verifiedLineItems.payables.get(id) || [], verifiedLineItems.payments.get(id) || []) !== incomingCanonical) {
                throw new Error("Updated disbursement lines failed integrity verification.");
            }

            const freshRes = await directusFetch<{ data: DisbursementRow }>(`/items/disbursement/${id}?fields=id,doc_no,transaction_type,payee.id,payee.supplier_name,remarks,total_amount,paid_amount,encoder_id,approver_id,posted_by,isPosted,transaction_date,date_created,date_approved,date_posted,division_id.division_id,division_id.division_name,department_id.department_id,department_id.department_name,fund_source_id,supporting_documents_url,status`);
            return await loadNormalizedDisbursement(freshRes.data);
        } finally {
            releaseMemoCapLock?.();
        }
    }

    static async deleteDisbursement(id: number, encoderEmail: string | null) {
        const currentUserId = await resolveEncoderId(encoderEmail);
        if (!currentUserId) throw new Error("User Profile Not Found");

        const currentDisReq = await directusFetch<{ data: DisbursementRow }>(`/items/disbursement/${id}`);
        if (!currentDisReq?.data) throw new Error("Disbursement not found");
        const currentDis = currentDisReq.data;

        if (currentDis.status === "Submitted") throw new Error("Submitted vouchers are locked and cannot be deleted.");
        if (Number(currentDis.isPosted) === 1) throw new Error("Cannot delete a transaction that is already Posted to the GL. This record is immutable.");

        const memoPayeeId = relationId(currentDis.payee, "id") || 0;
        const existingLineItems = await getLineItems([id]);
        const memoReferences = (existingLineItems.payables.get(id) || []).map(line => String(line.reference_no || "")).filter(ref => ref.trim() !== "");

        await directusFetch(`/items/disbursement/${id}`, {
            method: "PATCH",
            body: JSON.stringify({ is_deleted: 1, deleted_at: new Date().toISOString(), deleted_by: currentUserId, status: "Deleted" })
        });

        if (memoPayeeId) {
            await refreshSupplierMemoStatuses(memoPayeeId, memoReferences);
        }

        return { message: "Disbursement soft-deleted successfully" };
    }
}
