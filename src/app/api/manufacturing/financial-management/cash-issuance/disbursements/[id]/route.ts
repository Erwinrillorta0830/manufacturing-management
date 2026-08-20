import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decodeJwtPayload } from "@/lib/auth-utils";
import { normalizeDisbursement, getLineItems, getUserMap, PayableInput, PaymentInput, RelationValue, resolveEncoderId, cleanSupportingDocsUrl, getCoaMap, getDivisionMap, getBankMap, relationId, canonicalizeDisbursementPayload, canonicalizePersistedDisbursement, loadNormalizedDisbursement, DisbursementRow, findMissingPayableDateError, resolveTransactionTypeId } from "../route";
import {
    findTaggedPurchaseOrderReferences,
    findUnpostedPurchaseOrderReferences,
} from "../_purchase-order-eligibility";
import { findMissingPayableDivisionError, findMissingVatPrincipalDivisionError, normalizeVatSplitDivisions } from "../_payable-split-integrity";
import { acquireMemoCapLock, refreshSupplierMemoStatuses, validateSupplierMemoCaps } from "../_memo-cap-integrity";
import { isPettyCashBankAccount, validatePaymentLine } from "../_payment-method";
import { isPaymentAllocationScope, resolveDisbursementUpdateStatus } from "@/modules/manufacturing-management/financial-management/cash-issuance/utils/update-scope";

export const runtime = "nodejs";

// 🚀 PUT Handler - Directus Native
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const cookieStore = await cookies();
    const token = cookieStore.get("vos_access_token")?.value;

    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const resolvedParams = await params;
    const id = Number(resolvedParams.id);

    const decoded = decodeJwtPayload(token);
    const encoderEmail = decoded?.email || decoded?.sub || null;
    const currentUserId = await resolveEncoderId(encoderEmail);

    if (!currentUserId) {
        return NextResponse.json({
            message: "User Profile Not Found",
            detail: "Your account is not registered in the system user directory. Voucher updates are blocked."
        }, { status: 403 });
    }

    let releaseMemoCapLock: (() => void) | undefined;

    try {
        const body = await request.json();
        const isPaymentAllocationUpdate = isPaymentAllocationScope(body.saveScope);
        if (isPaymentAllocationUpdate) {
            const unexpectedFields = [
                "docNo",
                "transactionTypeId",
                "payeeId",
                "remarks",
                "totalAmount",
                "transactionDate",
                "departmentId",
                "fundSourceId",
                "supportingDocumentsUrl",
                "payables",
            ].filter((field) => Object.prototype.hasOwnProperty.call(body, field));
            if (unexpectedFields.length > 0) {
                return NextResponse.json({
                    message: "Payment allocation updates cannot change voucher header or payable fields.",
                    detail: `Remove these fields from the payment-only request: ${unexpectedFields.join(", ")}.`,
                }, { status: 409 });
            }
        }
        const requestedTransactionTypeId = body.transactionTypeId == null || body.transactionTypeId === ""
            ? null
            : Number(body.transactionTypeId);
        if (requestedTransactionTypeId !== null && requestedTransactionTypeId !== 1 && requestedTransactionTypeId !== 2) {
            return NextResponse.json({ message: "Transaction Type must be Trade (1) or Non-Trade (2)." }, { status: 400 });
        }
        const requestedPayables = (body.payables || []) as PayableInput[];
        const hasPaymentPatch = Object.prototype.hasOwnProperty.call(body, "payments");
        const requestedPayments = hasPaymentPatch && Array.isArray(body.payments)
            ? body.payments as PaymentInput[]
            : [];
        if (isPaymentAllocationUpdate && !hasPaymentPatch) {
            return NextResponse.json({ message: "Payment allocation lines are required." }, { status: 400 });
        }
        const missingPrincipalDivisionError = isPaymentAllocationUpdate
            ? null
            : findMissingVatPrincipalDivisionError(requestedPayables);
        if (missingPrincipalDivisionError) {
            return NextResponse.json({ message: missingPrincipalDivisionError }, { status: 400 });
        }
        const normalizedPayables = normalizeVatSplitDivisions(requestedPayables);
        const payableLinesInput = normalizedPayables.filter((line: PayableInput) =>
            !!line.coaId || (line.amount != null && Number(line.amount) !== 0) || (line.referenceNo && line.referenceNo.trim() !== "")
        );
        const missingPayableDivisionError = isPaymentAllocationUpdate
            ? null
            : findMissingPayableDivisionError(payableLinesInput);
        if (missingPayableDivisionError) {
            return NextResponse.json({ message: missingPayableDivisionError }, { status: 400 });
        }
        const missingPayableDateError = isPaymentAllocationUpdate
            ? null
            : findMissingPayableDateError(payableLinesInput);
        if (missingPayableDateError) {
            return NextResponse.json({ message: missingPayableDateError }, { status: 400 });
        }
        const paymentLinesInput = hasPaymentPatch
            ? requestedPayments.filter((line: PaymentInput) =>
                !!line.coaId || (line.amount != null && Number(line.amount) !== 0) || (line.checkNo != null && String(line.checkNo).trim() !== "")
            )
            : [];
        const [coaMap, bankMap] = await Promise.all([getCoaMap(), getBankMap()]);
        for (let index = 0; index < paymentLinesInput.length; index++) {
            const line = paymentLinesInput[index];
            const validationError = validatePaymentLine(
                line,
                coaMap.get(Number(line.coaId)),
                bankMap.get(Number(line.bankId)),
            );
            if (validationError) {
                return NextResponse.json({
                    message: validationError,
                    detail: `Payment row ${index + 1} is invalid.`,
                }, { status: 400 });
            }
        }
        const normalizedPaymentLines = paymentLinesInput.map((line) =>
            isPettyCashBankAccount(bankMap.get(Number(line.bankId)))
                ? { ...line, checkNo: "" }
                : line
        );

        // 1. Fetch current status from Directus
        const directusUrl = `${(process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "")}/items/disbursement/${id}`;
        const directusToken = process.env.DIRECTUS_STATIC_TOKEN || "";

        const currentRes = await fetch(directusUrl, {
            headers: {
                Authorization: `Bearer ${directusToken}`,
                "Content-Type": "application/json",
            },
            cache: "no-store",
        });

        if (!currentRes.ok) {
            return NextResponse.json({ message: "Disbursement not found" }, { status: 404 });
        }

        const currentDis = (await currentRes.json()).data;
        const transactionTypeId = requestedTransactionTypeId
            ?? resolveTransactionTypeId(currentDis.transaction_type, currentDis.doc_no ?? body.docNo);

        if (transactionTypeId === null) {
            return NextResponse.json({
                message: "Transaction Type is missing. Repair the voucher before updating it.",
            }, { status: 400 });
        }

        if (currentDis.status === "Submitted") {
            return NextResponse.json({
                message: "Submitted vouchers are locked and cannot be edited.",
                detail: "An authorized approver must return this voucher for revision before it can be changed.",
            }, { status: 409 });
        }

        // Immutability Enforcement Check
        if (Number(currentDis.isPosted) === 1) {
            return NextResponse.json({ message: "Cannot modify a transaction that is already Posted to the GL. This record is immutable." }, { status: 400 });
        }

        if (currentDis.status !== "Draft" && currentDis.status !== "Approved" && currentDis.status !== "Returned for Revision" && currentDis.status !== "Released" && currentDis.status !== "Partially Released") {
            return NextResponse.json({ message: "Only Draft, Approved, Returned, Released, or Partially Released disbursements can be edited." }, { status: 400 });
        }

        const currentLineItems = await getLineItems([id]);
        const currentPayables = currentLineItems.payables.get(id) || [];
        const currentPayments = currentLineItems.payments.get(id) || [];
        const currentPayeeId = currentDis.payee && typeof currentDis.payee === "object" && "id" in currentDis.payee
            ? Number(currentDis.payee.id)
            : (typeof currentDis.payee === "number" ? currentDis.payee : Number(currentDis.payee));
        const currentTransactionTypeId = resolveTransactionTypeId(currentDis.transaction_type, currentDis.doc_no);

        if (isPaymentAllocationUpdate) {
            if (currentDis.status !== "Approved" && currentDis.status !== "Partially Released") {
                return NextResponse.json({
                    message: "Payment allocations can only be edited for Approved or Partially Released vouchers.",
                }, { status: 409 });
            }

            const effectivePaymentTotal = normalizedPaymentLines.reduce(
                (sum: number, line: PaymentInput) => sum + (Number(line.amount) || 0),
                0,
            );
            const currentTotalAmount = Number(currentDis.total_amount) || 0;
            if (effectivePaymentTotal > currentTotalAmount + 0.01) {
                return NextResponse.json({
                    message: "Payment total cannot exceed the voucher total.",
                    detail: `Payments total ${effectivePaymentTotal.toFixed(2)} exceeds voucher total ${currentTotalAmount.toFixed(2)}.`,
                }, { status: 400 });
            }

            const paymentIds = currentPayments
                .map((line) => Number(line.id))
                .filter((paymentId) => Number.isInteger(paymentId) && paymentId > 0);
            if (paymentIds.length > 0) {
                const deletePaymentsRes = await fetch(`${(process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "")}/items/disbursement_payments`, {
                    method: "DELETE",
                    headers: { Authorization: `Bearer ${directusToken}`, "Content-Type": "application/json" },
                    body: JSON.stringify(paymentIds),
                });
                if (!deletePaymentsRes.ok) throw new Error(await deletePaymentsRes.text());
            }

            const paymentLines = normalizedPaymentLines
                .filter((line: PaymentInput) =>
                    !!line.coaId || (line.amount != null && Number(line.amount) !== 0) || (line.checkNo != null && String(line.checkNo).trim() !== "")
                )
                .map((line: PaymentInput) => ({
                    disbursement_id: id,
                    coa_id: line.coaId ? Number(line.coaId) : null,
                    bank_id: line.bankId ? Number(line.bankId) : null,
                    check_no: line.checkNo || "",
                    date: line.date,
                    amount: Number(line.amount) || 0,
                    remarks: line.remarks || "",
                    ...(line.releasedBy != null && line.releasedBy !== ""
                        ? { released_by: Number(line.releasedBy) }
                        : {}),
                    ...(line.releasedDate != null && line.releasedDate !== ""
                        ? { released_date: line.releasedDate }
                        : {}),
                }));

            if (paymentLines.length > 0) {
                const paymentInsertRes = await fetch(`${(process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "")}/items/disbursement_payments`, {
                    method: "POST",
                    headers: { Authorization: `Bearer ${directusToken}`, "Content-Type": "application/json" },
                    body: JSON.stringify(paymentLines),
                });
                if (!paymentInsertRes.ok) throw new Error(await paymentInsertRes.text());
            }

            const paymentHeaderRes = await fetch(directusUrl, {
                method: "PATCH",
                headers: {
                    Authorization: `Bearer ${directusToken}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ paid_amount: effectivePaymentTotal }),
            });
            if (!paymentHeaderRes.ok) throw new Error(await paymentHeaderRes.text());
            const persistedPaymentHeader = ((await paymentHeaderRes.json()).data || {}) as Partial<DisbursementRow>;

            const verifiedPaymentItems = await getLineItems([id]);
            const verifiedPayables = verifiedPaymentItems.payables.get(id) || [];
            const verifiedPayments = verifiedPaymentItems.payments.get(id) || [];
            const expectedCanonical = canonicalizeDisbursementPayload({
                transactionTypeId: currentTransactionTypeId,
                payeeId: currentPayeeId,
                remarks: currentDis.remarks,
                totalAmount: currentDis.total_amount,
                transactionDate: currentDis.transaction_date,
                departmentId: relationId(currentDis.department_id, "department_id"),
                fundSourceId: relationId(currentDis.fund_source_id as RelationValue),
                supportingDocumentsUrl: currentDis.supporting_documents_url,
                payables: currentPayables.map((line) => ({
                    divisionId: relationId(line.division_id, "division_id"),
                    referenceNo: line.reference_no,
                    date: line.date,
                    coaId: relationId(line.coa_id, "coa_id"),
                    amount: line.amount,
                    remarks: line.remarks,
                })),
                payments: normalizedPaymentLines,
            });
            const actualCanonical = canonicalizePersistedDisbursement(
                currentDis,
                verifiedPayables,
                verifiedPayments,
            );
            if (actualCanonical !== expectedCanonical) {
                throw new Error("Payment allocation update failed integrity verification.");
            }

            return NextResponse.json(await loadNormalizedDisbursement({
                ...currentDis,
                ...persistedPaymentHeader,
                paid_amount: effectivePaymentTotal,
            }, token));
        }

        const effectivePaymentLines: PaymentInput[] = hasPaymentPatch
            ? normalizedPaymentLines
            : currentPayments.map((line) => ({
                coaId: relationId(line.coa_id, "coa_id"),
                bankId: relationId(line.bank_id as RelationValue),
                checkNo: line.check_no == null ? "" : String(line.check_no),
                date: line.date == null ? undefined : String(line.date),
                amount: Number(line.amount) || 0,
                remarks: line.remarks == null ? "" : String(line.remarks),
            }));
        const incomingCanonical = canonicalizeDisbursementPayload({
            transactionTypeId,
            payeeId: body.payeeId,
            remarks: body.remarks,
            totalAmount: body.totalAmount,
            transactionDate: body.transactionDate,
            departmentId: body.departmentId,
            fundSourceId: body.fundSourceId,
            supportingDocumentsUrl: body.supportingDocumentsUrl,
            payables: payableLinesInput,
                payments: effectivePaymentLines,
        });

        const currentNonPaymentCanonical = canonicalizeDisbursementPayload({
            transactionTypeId: currentTransactionTypeId,
            payeeId: currentPayeeId,
            remarks: currentDis.remarks,
            totalAmount: currentDis.total_amount,
            transactionDate: currentDis.transaction_date,
            departmentId: relationId(currentDis.department_id, "department_id"),
            fundSourceId: relationId(currentDis.fund_source_id as RelationValue),
            supportingDocumentsUrl: currentDis.supporting_documents_url,
            payables: currentPayables.map((line) => ({
                divisionId: relationId(line.division_id, "division_id"),
                referenceNo: line.reference_no,
                date: line.date,
                coaId: relationId(line.coa_id, "coa_id"),
                amount: line.amount,
                remarks: line.remarks,
            })),
            payments: [],
        });
        const incomingNonPaymentCanonical = canonicalizeDisbursementPayload({
            transactionTypeId,
            payeeId: body.payeeId,
            remarks: body.remarks,
            totalAmount: body.totalAmount,
            transactionDate: body.transactionDate,
            departmentId: body.departmentId,
            fundSourceId: body.fundSourceId,
            supportingDocumentsUrl: body.supportingDocumentsUrl,
            payables: payableLinesInput,
            payments: [],
        });
        const isPaymentOnlyPartialEdit = currentDis.status === "Partially Released"
            && currentNonPaymentCanonical === incomingNonPaymentCanonical;
        if (currentDis.status === "Partially Released" && !isPaymentOnlyPartialEdit) {
            return NextResponse.json({
                message: "Partially released vouchers can only be updated through payment lines.",
                detail: "Voucher header and payable lines are locked until the remaining balance is fully released.",
            }, { status: 409 });
        }

        const effectivePaymentTotal = effectivePaymentLines.reduce(
            (sum: number, line: PaymentInput) => sum + (Number(line.amount) || 0),
            0,
        );
        const requestedTotalAmount = Number(body.totalAmount) || 0;
        if (effectivePaymentTotal > requestedTotalAmount + 0.01) {
            return NextResponse.json({
                message: "Payment total cannot exceed the voucher total.",
                detail: `Payments total ${effectivePaymentTotal.toFixed(2)} exceeds voucher total ${requestedTotalAmount.toFixed(2)}.`,
            }, { status: 400 });
        }

        if (canonicalizePersistedDisbursement(currentDis, currentPayables, currentPayments) === incomingCanonical) {
            return NextResponse.json(await loadNormalizedDisbursement(currentDis, token));
        }

        if (!isPaymentOnlyPartialEdit) {
            const payableSupplierId = body.payeeId != null ? Number(body.payeeId) : currentPayeeId;
            const taggedPoReferences = await findTaggedPurchaseOrderReferences(
                requestedPayables.map((line) => line.referenceNo),
                payableSupplierId,
                id,
            );
            if (taggedPoReferences.length > 0) {
                return NextResponse.json({
                    message: "Disbursement cannot include purchase orders already tagged to another TR.",
                    detail: `Already-tagged references: ${taggedPoReferences.join(", ")}`,
                    references: taggedPoReferences,
                }, { status: 409 });
            }

            releaseMemoCapLock = await acquireMemoCapLock([
                ...currentPayables.map((line) => ({ referenceNo: line.reference_no, amount: line.amount })),
                ...payableLinesInput,
            ]);

            const unpostedPoReferences = await findUnpostedPurchaseOrderReferences(
                requestedPayables.map((line) => line.referenceNo),
                payableSupplierId,
            );
            if (unpostedPoReferences.length > 0) {
                return NextResponse.json({
                    message: "Disbursement cannot include purchase-order amounts that have not been posted.",
                    detail: `Unposted or ineligible references: ${unpostedPoReferences.join(", ")}`,
                    references: unpostedPoReferences,
                }, { status: 409 });
            }

            const memoCapError = await validateSupplierMemoCaps(
                payableSupplierId,
                requestedPayables,
                id,
            );
            if (memoCapError) {
                return NextResponse.json({
                    message: memoCapError.isLocked
                        ? "Supplier memo is currently locked by an unposted TR."
                        : "Supplier memo amount exceeds its authorized cap.",
                    detail: memoCapError.message,
                    memoNumber: memoCapError.memoNumber,
                    authorizedAmount: memoCapError.authorizedAmount,
                    appliedAmount: memoCapError.appliedAmount,
                    requestedAmount: memoCapError.requestedAmount,
                    remainingAmount: memoCapError.remainingAmount,
                    isLocked: memoCapError.isLocked || false,
                    lockingTrDocNo: memoCapError.lockingTrDocNo || null,
                    lockingTrStatus: memoCapError.lockingTrStatus || null,
                    lockingTrCount: memoCapError.lockingTrCount || 0,
                }, { status: 409 });
            }
        }

        // 2. Fetch existing payables & payments to clear them (matching Spring Boot's behavior)
        const payablesUrl = `${(process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "")}/items/disbursement_payables?filter[disbursement_id][_eq]=${id}&fields=id`;
        const payablesRes = await fetch(payablesUrl, {
            headers: { Authorization: `Bearer ${directusToken}` },
            cache: "no-store",
        });
        const existingPayables = ((await payablesRes.json()).data || []) as { id: number }[];
        const payableIds = existingPayables.map((p) => p.id);

        const paymentsUrl = `${(process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "")}/items/disbursement_payments?filter[disbursement_id][_eq]=${id}&fields=id`;
        const paymentsRes = await fetch(paymentsUrl, {
            headers: { Authorization: `Bearer ${directusToken}` },
            cache: "no-store",
        });
        const existingPayments = ((await paymentsRes.json()).data || []) as { id: number }[];
        const paymentIds = existingPayments.map((p) => p.id);

        // Delete existing line items
        if (payableIds.length > 0) {
            await fetch(`${(process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "")}/items/disbursement_payables`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${directusToken}`, "Content-Type": "application/json" },
                body: JSON.stringify(payableIds),
            });
        }
        if (hasPaymentPatch && paymentIds.length > 0) {
            await fetch(`${(process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "")}/items/disbursement_payments`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${directusToken}`, "Content-Type": "application/json" },
                body: JSON.stringify(paymentIds),
            });
        }

        // 3. Status transition
        let newStatus = currentDis.status;
        let approverId: number | null | undefined = relationId(currentDis.approver_id, "user_id");
        let dateApproved = currentDis.date_approved;

        const sameMoney = (left: unknown, right: unknown) =>
            Math.round((Number(left) || 0) * 100) === Math.round((Number(right) || 0) * 100);
        const isHeaderOrPayableModified =
            (body.totalAmount != null && !sameMoney(body.totalAmount, currentDis.total_amount)) ||
            (body.payeeId != null && Number(body.payeeId) !== currentPayeeId) ||
            transactionTypeId !== currentTransactionTypeId;

        newStatus = resolveDisbursementUpdateStatus(
            currentDis.status,
            body.saveScope,
            isHeaderOrPayableModified,
        );
        if (newStatus === "Submitted" && currentDis.status === "Approved") {
            approverId = null;
            dateApproved = null;
        }

        // 4. Calculate paid amount (sum of payments)
        const calculatedPaidAmount = effectivePaymentLines.reduce(
            (sum: number, p: PaymentInput) => sum + (Number(p.amount) || 0),
            0
        );

        // 5. Update parent header (no nested O2M — Directus doesn't support it)
        const headerPayload = {
            transaction_type: transactionTypeId,
            payee: Number(body.payeeId),
            remarks: body.remarks || "",
            total_amount: Number(body.totalAmount) || 0,
            paid_amount: calculatedPaidAmount,
            transaction_date: body.transactionDate,
            // Header-level Division is deprecated. Payable lines carry Cost Division.
            division_id: null,
            department_id: body.departmentId ? Number(body.departmentId) : null,
            fund_source_id: body.fundSourceId ? Number(body.fundSourceId) : null,
            supporting_documents_url: cleanSupportingDocsUrl(body.supportingDocumentsUrl),
            status: newStatus,
            approver_id: approverId,
            date_approved: dateApproved,
        };

        const updateRes = await fetch(`${(process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "")}/items/disbursement/${id}`, {
            method: "PATCH",
            headers: {
                Authorization: `Bearer ${directusToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(headerPayload),
        });
        if (!updateRes.ok) throw new Error(await updateRes.text());
        const updatedHeader = (await updateRes.json()).data as DisbursementRow;

        // 5b. Batch insert new line items
        const payableLines = normalizedPayables
            .filter((line: PayableInput) => !!line.coaId || (line.amount != null && Number(line.amount) !== 0) || (line.referenceNo && line.referenceNo.trim() !== ""))
            .map((line: PayableInput) => ({
                disbursement_id: id,
                division_id: line.divisionId ? Number(line.divisionId) : null,
                reference_no: line.referenceNo || "",
                date: line.date,
                coa_id: line.coaId ? Number(line.coaId) : null,
                amount: Number(line.amount) || 0,
                remarks: line.remarks || ""
            }));

        const paymentLines = hasPaymentPatch
            ? normalizedPaymentLines
            .filter((line: PaymentInput) => !!line.coaId || (line.amount != null && Number(line.amount) !== 0) || (line.checkNo != null && String(line.checkNo).trim() !== ""))
            .map((line: PaymentInput) => {
                const payload: {
                    disbursement_id: number;
                    coa_id: number | null;
                    bank_id: number | null;
                    check_no: string;
                    date: string | undefined;
                    amount: number;
                    remarks: string;
                    released_by?: number;
                    released_date?: string;
                } = {
                    disbursement_id: id,
                    coa_id: line.coaId ? Number(line.coaId) : null,
                    bank_id: line.bankId ? Number(line.bankId) : null,
                    check_no: line.checkNo || "",
                    date: line.date,
                    amount: Number(line.amount) || 0,
                    remarks: line.remarks || ""
                };
                if (line.releasedBy != null && line.releasedBy !== "") {
                    payload.released_by = Number(line.releasedBy);
                }
                if (line.releasedDate != null && line.releasedDate !== "") {
                    payload.released_date = line.releasedDate;
                }
                return payload;
            })
            : [];

        const lineRes = await Promise.all([
            payableLines.length > 0
                ? fetch(`${(process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "")}/items/disbursement_payables`, {
                      method: "POST",
                      headers: { Authorization: `Bearer ${directusToken}`, "Content-Type": "application/json" },
                      body: JSON.stringify(payableLines),
                  })
                : Promise.resolve(),
            paymentLines.length > 0
                ? fetch(`${(process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "")}/items/disbursement_payments`, {
                      method: "POST",
                      headers: { Authorization: `Bearer ${directusToken}`, "Content-Type": "application/json" },
                      body: JSON.stringify(paymentLines),
                  })
                : Promise.resolve(),
        ]);

        for (const res of lineRes) {
            if (res && !res.ok) {
                throw new Error(await res.text());
            }
        }

        const verifiedLineItems = await getLineItems([id]);
        const verifiedPayables = verifiedLineItems.payables.get(id) || [];
        const verifiedPayments = verifiedLineItems.payments.get(id) || [];
        if (canonicalizePersistedDisbursement(updatedHeader, verifiedPayables, verifiedPayments) !== incomingCanonical) {
            throw new Error("Updated disbursement lines failed integrity verification.");
        }

        // 6. Fetch full line items structure, user maps, coa maps and map back to response DTO format
        const lineItems = await getLineItems([id]);

        const divisionMap = await getDivisionMap();

        // 7. Get fresh, fully-populated header details to normalize and return
        const fields = [
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
        ].join(",");
        
        const freshRes = await fetch(`${(process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "")}/items/disbursement/${id}?fields=${fields}`, {
            headers: {
                Authorization: `Bearer ${directusToken}`,
                "Content-Type": "application/json",
            },
            cache: "no-store",
        });

        if (!freshRes.ok) throw new Error("Failed to fetch fresh disbursement header");
        const freshDis = (await freshRes.json()).data;
        if (Number(freshDis.transaction_type) !== transactionTypeId) {
            throw new Error("Disbursement was updated but its transaction type was not persisted. Verify the Directus transaction_type field permissions.");
        }

        const userIdsToFetch: number[] = [];
        const addId = (val: number | undefined) => {
            if (typeof val === "number" && Number.isFinite(val)) {
                userIdsToFetch.push(val);
            }
        };
        addId(relationId(freshDis.encoder_id, "user_id"));
        addId(relationId(freshDis.approver_id, "user_id"));
        addId(relationId(freshDis.posted_by, "user_id"));
        const payments = lineItems.payments.get(Number(id)) || [];
        payments.forEach(p => {
            // Removed p.released_by
        });

        const userMap = await getUserMap(token, userIdsToFetch);

        return NextResponse.json(
            normalizeDisbursement(freshDis, lineItems.payables, lineItems.payments, userMap, coaMap, divisionMap, bankMap)
        );

    } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json({ message: "BFF Error", detail: errorMessage }, { status: 502 });
    } finally {
        releaseMemoCapLock?.();
    }
}

// 🚀 DELETE Handler - Directus Native with Immutability Check
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const cookieStore = await cookies();
    const token = cookieStore.get("vos_access_token")?.value;

    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const resolvedParams = await params;
    const id = Number(resolvedParams.id);

    const decoded = decodeJwtPayload(token);
    const encoderEmail = decoded?.email || decoded?.sub || null;
    const currentUserId = await resolveEncoderId(encoderEmail);

    if (!currentUserId) {
        return NextResponse.json({
            message: "User Profile Not Found",
            detail: "Your account is not registered in the system user directory. Voucher deletion is blocked."
        }, { status: 403 });
    }

    try {
        const directusToken = process.env.DIRECTUS_STATIC_TOKEN || "";
        const directusUrl = `${(process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "")}/items/disbursement/${id}`;

        const currentRes = await fetch(directusUrl, {
            headers: { Authorization: `Bearer ${directusToken}` },
            cache: "no-store",
        });

        if (!currentRes.ok) {
            return NextResponse.json({ message: "Disbursement not found" }, { status: 404 });
        }

        const currentDis = (await currentRes.json()).data;

        if (currentDis.status === "Submitted") {
            return NextResponse.json({
                message: "Submitted vouchers are locked and cannot be deleted.",
                detail: "An authorized approver must return this voucher for revision before it can be changed.",
            }, { status: 409 });
        }

        // Immutability Enforcement Check
        if (Number(currentDis.isPosted) === 1) {
            return NextResponse.json({ message: "Cannot delete a transaction that is already Posted to the GL. This record is immutable." }, { status: 400 });
        }

        const memoPayeeId = relationId(currentDis.payee, "id") || 0;
        const existingLineItems = await getLineItems([id]);
        const memoReferences = (existingLineItems.payables.get(id) || [])
            .map((line) => String(line.reference_no || ""))
            .filter((reference) => reference.trim() !== "");

        // Soft Delete: stamp is_deleted = 1, deleted_at = NOW(), and deleted_by = currentUserId
        const deletePayload = {
            is_deleted: 1,
            deleted_at: new Date().toISOString(),
            deleted_by: currentUserId,
            status: "Deleted"
        };

        const patchRes = await fetch(directusUrl, {
            method: "PATCH",
            headers: {
                Authorization: `Bearer ${directusToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(deletePayload),
        });

        if (!patchRes.ok) throw new Error(await patchRes.text());

        if (memoPayeeId) {
            await refreshSupplierMemoStatuses(memoPayeeId, memoReferences);
        }

        return NextResponse.json({ message: "Disbursement soft-deleted successfully" });

    } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json({ message: "BFF Error", detail: errorMessage }, { status: 502 });
    }
}
