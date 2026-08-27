import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decodeJwtPayload } from "@/lib/auth-utils";
import { relationId, normalizeDisbursement } from "@/modules/manufacturing-management/financial-management/cash-issuance/services/disbursement.helpers";
import { getLineItems, getUserMap, resolveEncoderId, getCoaMap, getDivisionMap, getBankMap, loadNormalizedDisbursement } from "@/modules/manufacturing-management/financial-management/cash-issuance/services/disbursement.repo";
import type { PayableRow, DisbursementRow, PaymentRow } from "@/modules/manufacturing-management/financial-management/cash-issuance/services/disbursement.types";
import { findUnpostedPurchaseOrderReferences } from "../../_purchase-order-eligibility";
import { findVatSplitDivisionError } from "../../_payable-split-integrity";
import { acquireMemoCapLock, refreshSupplierMemoStatuses, validateSupplierMemoCaps } from "../../_memo-cap-integrity";
import { validatePaymentLine } from "../../_payment-method";
import { hasDisbursementApprovalAccess } from "../../_approval-access";

export const runtime = "nodejs";

const DIRECTUS_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");
const DIRECTUS_TOKEN = process.env.DIRECTUS_STATIC_TOKEN || "";

// 🚀 Helper: Sync Purchase Order Statuses
async function syncPurchaseOrderStatuses(disbursement: DisbursementRow, payablesList: PayableRow[]) {
    const poNumbers = new Set<string>();
    payablesList.forEach((p) => {
        const ref = String(p.reference_no || "");
        if (ref && ref.includes("/")) {
            const parts = ref.split("/");
            const poNo = parts[0].trim();
            if (poNo) poNumbers.add(poNo);
        }
    });

    for (const poNo of poNumbers) {
        try {
            // Find PO from Directus
            const poRes = await fetch(`${DIRECTUS_URL}/items/purchase_order?filter[purchase_order_no][_eq]=${encodeURIComponent(poNo)}&fields=purchase_order_id,payment_type,payment_status`, {
                headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}` }
            });
            if (!poRes.ok) continue;
            const poData = (await poRes.json()).data?.[0];
            if (!poData) continue;

            const poId = poData.purchase_order_id;

            // Automatically set to partially paid (status 3)
            await fetch(`${DIRECTUS_URL}/items/purchase_order/${poId}`, {
                method: "PATCH",
                headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}`, "Content-Type": "application/json" },
                body: JSON.stringify({ payment_status: 3 })
            });

            // Calculate total liability
            // 1. Sum of purchase_order_receiving
            const recRes = await fetch(`${DIRECTUS_URL}/items/purchase_order_receiving?filter[purchase_order_id][_eq]=${poId}&fields=total_amount,received_quantity,unit_price`, {
                headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}` }
            });
            const receivingList = ((await recRes.json()).data || []) as { total_amount?: number | string | null; received_quantity?: number; unit_price?: number | string }[];
            const receivingSum = receivingList.reduce((sum: number, r) => {
                const amt = r.total_amount !== null && r.total_amount !== undefined
                    ? Number(r.total_amount)
                    : (Number(r.received_quantity || 0) * Number(r.unit_price || 0));
                return sum + amt;
            }, 0);

            // 2. Sum of purchase_order_products (only if payment_type == 1)
            let productsSum = 0;
            if (Number(poData.payment_type) === 1) {
                const prodRes = await fetch(`${DIRECTUS_URL}/items/purchase_order_products?filter[purchase_order_id][_eq]=${poId}&fields=total_amount,ordered_quantity,unit_price`, {
                    headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}` }
                });
                const productsList = ((await prodRes.json()).data || []) as { total_amount?: number | string | null; ordered_quantity?: number; unit_price?: number | string }[];
                productsSum = productsList.reduce((sum: number, p) => {
                    const amt = p.total_amount !== null && p.total_amount !== undefined
                        ? Number(p.total_amount)
                        : (Number(p.ordered_quantity || 0) * Number(p.unit_price || 0));
                    return sum + amt;
                }, 0);
            }

            const totalLiability = receivingSum + productsSum;

            // Calculate total paid from all Released or Posted disbursements
            const disRes = await fetch(`${DIRECTUS_URL}/items/disbursement?filter[status][_in]=Released,Posted&fields=id&limit=-1`, {
                headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}` }
            });
            const disList = disRes.ok ? (((await disRes.json()).data || []) as Array<{ id: number }>) : [];
            const disIds = disList.map(d => d.id);

            // Always include the current disbursement being transitioned
            const currentId = Number(disbursement.id);
            if (currentId && !disIds.includes(currentId)) {
                disIds.push(currentId);
            }

            let totalPaid = 0;
            if (disIds.length > 0) {
                const paidRes = await fetch(`${DIRECTUS_URL}/items/disbursement_payables?filter[reference_no][_starts_with]=${encodeURIComponent(poNo + " /")}&filter[disbursement_id][_in]=${disIds.join(",")}&fields=amount`, {
                    headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}` }
                });
                const paidList = paidRes.ok ? (((await paidRes.json()).data || []) as Array<{ amount?: number }>) : [];
                totalPaid = paidList.reduce((sum: number, p) => {
                    const amt = Number(p.amount) || 0;
                    return sum + (amt > 0 ? amt : 0);
                }, 0);
            }

            if (totalPaid >= (totalLiability - 1.0)) {
                // Mark as fully paid (status 4)
                await fetch(`${DIRECTUS_URL}/items/purchase_order/${poId}`, {
                    method: "PATCH",
                    headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}`, "Content-Type": "application/json" },
                    body: JSON.stringify({ payment_status: 4 })
                });
            }
        } catch (e) {
            console.error(`Sync PO status failed for PO ${poNo}:`, e);
        }
    }
}

// 🚀 Helper: Lock Applied Memos
async function lockAppliedMemos(payablesList: PayableRow[], supplierId: number) {
    const referenceNumbers = Array.from(new Set(
        payablesList.map((p) => String(p.reference_no || "")).filter((ref) => ref && ref.trim())
    ));

    await refreshSupplierMemoStatuses(supplierId, referenceNumbers);
}

// 🚀 PATCH Handler - Status Transitions
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const cookieStore = await cookies();
    const token = cookieStore.get("vos_access_token")?.value;

    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const resolvedParams = await params;
    const id = Number(resolvedParams.id);

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    if (!status) return NextResponse.json({ message: "Status is required" }, { status: 400 });

    const decoded = decodeJwtPayload(token);
    const encoderEmail = decoded?.email || decoded?.sub || null;
    const currentUserId = await resolveEncoderId(encoderEmail);

    if (!currentUserId) {
        return NextResponse.json({
            message: "User Profile Not Found",
            detail: "Your account is not registered in the system user directory. State transitions are blocked."
        }, { status: 403 });
    }

    let releaseMemoCapLock: (() => void) | undefined;

    try {
        // 1. Fetch current record from Directus
        const directusUrl = `${DIRECTUS_URL}/items/disbursement/${id}`;
        const currentRes = await fetch(directusUrl, {
            headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}` },
            cache: "no-store",
        });

        if (!currentRes.ok) return NextResponse.json({ message: "Disbursement not found in Directus" }, { status: 404 });
        const currentDis = (await currentRes.json()).data;

        const currentStatus = String(currentDis.status || "");
        const isReplay = currentStatus === status ||
            (status === "Submitted" && currentStatus === "Approved" && Number(currentDis.total_amount) < 1000);
        if (isReplay) {
            return NextResponse.json(await loadNormalizedDisbursement(currentDis));
        }

        // Immutability Enforcement: block modifications if isPosted = 1
        if (Number(currentDis.isPosted) === 1) {
            return NextResponse.json({
                message: "Immutability Violation",
                detail: "Cannot modify a transaction that is already Posted to the GL. This record is immutable."
            }, { status: 400 });
        }

        if (status === "Returned for Revision") {
            if (currentStatus !== "Submitted" && currentStatus !== "Approved") {
                return NextResponse.json({
                    message: "Only Submitted or Approved vouchers can be returned for revision.",
                }, { status: 400 });
            }

            if (!(await hasDisbursementApprovalAccess(currentUserId))) {
                return NextResponse.json({
                    message: "Only authorized disbursement approvers can return a voucher for revision.",
                }, { status: 403 });
            }
        }

        if (status === "Draft" && currentStatus === "Submitted") {
            return NextResponse.json({
                message: "Submitted vouchers are locked. An authorized approver must return the voucher for revision.",
            }, { status: 409 });
        }

        // 2. Fetch line items to calculate double-entry debits/credits balance
        const lineItems = await getLineItems([id]);
        const payables = (lineItems.payables.get(id) || []) as PayableRow[];
        const payments = (lineItems.payments.get(id) || []) as PaymentRow[];
        const coaMap = await getCoaMap();
        const bankMap = await getBankMap();

        releaseMemoCapLock = await acquireMemoCapLock(
            payables.map((line) => ({ referenceNo: line.reference_no, amount: line.amount })),
        );

        const currentPayeeId = relationId(currentDis.payee, "id") || 0;
        const memoCapError = currentPayeeId
            ? await validateSupplierMemoCaps(
                currentPayeeId,
                status === "Returned for Revision"
                    ? []
                    : payables.map((line) => ({ referenceNo: line.reference_no, amount: line.amount })),
                id,
            )
            : null;
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

        let totalDebit = 0;
        let totalCredit = 0;

        payables.forEach((p) => {
            const amt = Number(p.amount) || 0;
            if (amt >= 0) totalDebit += amt;
            else totalCredit += Math.abs(amt);
        });

        payments.forEach((p) => {
            const amt = Number(p.amount) || 0;
            if (amt >= 0) totalCredit += amt;
            else totalDebit += Math.abs(amt);
        });

        totalDebit = Math.round(totalDebit * 100) / 100;
        totalCredit = Math.round(totalCredit * 100) / 100;
        const isBalanced = Math.abs(totalDebit - totalCredit) <= 0.01;

        // 3. Status Transition Logic matching Spring Boot and Specifications
        let newStatus = status;
        let approverId: number | null | undefined = relationId(currentDis.approver_id, "user_id");
        let dateApproved = currentDis.date_approved;
        let postedBy: number | null | undefined = relationId(currentDis.posted_by, "user_id");
        let datePosted = currentDis.date_posted;
        let isPosted = currentDis.isPosted;
        // Removed obsolete fields: submittedBy, dateSubmitted, releasedBy, dateReleased
        let paidAmount = currentDis.paid_amount;

        switch (status) {
            case "Submitted": {
                if (currentDis.status !== "Draft" && currentDis.status !== "Returned for Revision") {
                    return NextResponse.json({ message: "Can only submit from Draft or Returned status." }, { status: 400 });
                }

                const unpostedPoReferences = await findUnpostedPurchaseOrderReferences(
                    payables.map((line) => line.reference_no),
                    relationId(currentDis.payee, "id"),
                );
                if (unpostedPoReferences.length > 0) {
                    return NextResponse.json({
                        message: "Disbursement cannot include purchase-order amounts that have not been posted.",
                        detail: `Unposted or ineligible references: ${unpostedPoReferences.join(", ")}`,
                        references: unpostedPoReferences,
                    }, { status: 409 });
                }

                // Submission Integrity Constraint: disbursement.total_amount = sum(disbursement_payables.amount)
                const vatSplitDivisionError = findVatSplitDivisionError(payables.map((line) => ({
                    referenceNo: line.reference_no,
                    divisionId: relationId(line.division_id, "division_id"),
                    remarks: line.remarks,
                })));
                if (vatSplitDivisionError) {
                    return NextResponse.json({
                        message: "VAT split Cost Division mismatch",
                        detail: vatSplitDivisionError,
                    }, { status: 400 });
                }

                const totalPayableLinesSum = payables.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
                const roundedPayables = Math.round(totalPayableLinesSum * 100) / 100;
                const roundedTotalAmount = Math.round(Number(currentDis.total_amount) * 100) / 100;

                if (roundedTotalAmount !== roundedPayables) {
                    return NextResponse.json({
                        message: "Submission Integrity Mismatch",
                        detail: `The total disbursement amount (${roundedTotalAmount}) does not equal the sum of payables (${roundedPayables}).`
                    }, { status: 400 });
                }

                // Removed submittedBy and dateSubmitted assignments

                // Existing Draft and Returned for Revision vouchers must always
                // return to formal approval, including low-value vouchers.
                newStatus = "Submitted";
                break;
            }
            case "Approved":
                if (currentDis.status !== "Submitted") {
                    return NextResponse.json({ message: "Can only approve Submitted disbursements." }, { status: 400 });
                }
                approverId = currentUserId;
                dateApproved = new Date().toISOString();
                break;

            case "Released":
            case "Partially Released": {
                if (currentDis.status !== "Approved" && currentDis.status !== "Released" && currentDis.status !== "Partially Released") {
                    return NextResponse.json({ message: "Can only release Approved or already Released disbursements." }, { status: 400 });
                }

                for (let index = 0; index < payments.length; index++) {
                    const line = payments[index];
                    const validationError = validatePaymentLine({
                        coaId: relationId(line.coa_id, "coa_id"),
                        bankId: relationId(line.bank_id as never),
                        checkNo: line.check_no,
                    },
                    coaMap.get(relationId(line.coa_id, "coa_id") || 0),
                    bankMap.get(relationId(line.bank_id as never) || 0));
                    if (validationError) {
                        return NextResponse.json({
                            message: validationError,
                            detail: `Payment row ${index + 1} is invalid.`,
                        }, { status: 400 });
                    }
                }

                // Removed releasedBy and dateReleased assignments

                // Recalculate parent values dynamically upon payment line processing:
                // disbursement.paid_amount = sum(disbursement_payments.amount)
                const totalPaidPayments = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
                paidAmount = totalPaidPayments;

                // Dynamically determine status based on total paid amount vs total voucher amount
                const totalVoucherAmount = Number(currentDis.total_amount) || 0;
                if (totalPaidPayments > totalVoucherAmount + 0.01) {
                    return NextResponse.json({
                        message: "Payment total cannot exceed the voucher total.",
                        detail: `Payments total ${totalPaidPayments.toFixed(2)} exceeds voucher total ${totalVoucherAmount.toFixed(2)}.`,
                    }, { status: 400 });
                }
                if (Math.abs(totalVoucherAmount - totalPaidPayments) < 0.01) {
                    newStatus = "Released";
                } else {
                    newStatus = "Partially Released";
                }

                // Batch-update all related payment rows to bind release audit stamps
                const paymentIds = payments.map((p) => p.id).filter(Boolean);
                if (paymentIds.length > 0) {
                    try {
                        const batchRes = await fetch(`${DIRECTUS_URL}/items/disbursement_payments`, {
                            method: "PATCH",
                            headers: {
                                Authorization: `Bearer ${DIRECTUS_TOKEN}`,
                                "Content-Type": "application/json"
                            },
                            body: JSON.stringify({
                                keys: paymentIds,
                                data: {
                                    // Removed released_by
                                    released_date: new Date().toISOString()
                                }
                            })
                        });
                        if (!batchRes.ok) {
                            console.error("Directus payment lines release stamp failed:", await batchRes.text());
                        }
                    } catch (err) {
                        console.error("Failed to execute batch release update on payments:", err);
                    }
                }

                // Sync PO statuses
                await syncPurchaseOrderStatuses(currentDis, payables);
                break;
            }
            case "Posted":
                if (currentDis.status !== "Released" && currentDis.status !== "Partially Released") {
                    return NextResponse.json({ message: "Can only post Released or Partially Released disbursements." }, { status: 400 });
                }
                if (!isBalanced) {
                    return NextResponse.json({ message: "Cannot post: Debits do not match Credits. The voucher must be balanced first." }, { status: 400 });
                }
                if (currentDis.approver_id != null && Number(currentDis.approver_id) === currentUserId) {
                    return NextResponse.json({
                        message: "Segregation of Duties Violation",
                        detail: "The user who approved the voucher cannot post it."
                    }, { status: 400 });
                }
                isPosted = 1;
                postedBy = currentUserId;
                datePosted = new Date().toISOString();
                // Sync PO statuses
                await syncPurchaseOrderStatuses(currentDis, payables);
                break;

            case "Draft":
            case "Returned for Revision":
                approverId = null;
                dateApproved = null;
                // Removed submittedBy and dateSubmitted resets
                newStatus = status;
                break;

            default:
                return NextResponse.json({ message: `Unknown status transition: ${status}` }, { status: 400 });
        }

        // 4. Update status and attributes in Directus
        const updatePayload = {
            status: newStatus,
            approver_id: approverId,
            date_approved: dateApproved,
            posted_by: postedBy,
            date_posted: datePosted,
            isPosted: isPosted,
            // Removed obsolete fields
            paid_amount: paidAmount
        };

        const patchRes = await fetch(`${DIRECTUS_URL}/items/disbursement/${id}?fields=*.*`, {
            method: "PATCH",
            headers: {
                Authorization: `Bearer ${DIRECTUS_TOKEN}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(updatePayload)
        });

        if (!patchRes.ok) throw new Error(await patchRes.text());
        const updatedDis = (await patchRes.json()).data;

        if (status === "Posted" || status === "Returned for Revision") {
            await lockAppliedMemos(payables, currentPayeeId);
        }

        // 5. Build DTO representation
        const userIdsToFetch: number[] = [];
        const addId = (val: number | undefined) => {
            if (typeof val === "number" && Number.isFinite(val)) {
                userIdsToFetch.push(val);
            }
        };
        addId(relationId(updatedDis.encoder_id, "user_id"));
        addId(relationId(updatedDis.approver_id, "user_id"));
        addId(relationId(updatedDis.posted_by, "user_id"));
        payments.forEach(() => {
            // Removed p.released_by
        });

        const userMap = await getUserMap(userIdsToFetch);
        const divisionMap = await getDivisionMap();
        const normalized = normalizeDisbursement(updatedDis, payables, payments, userMap, coaMap, divisionMap, bankMap);

        return NextResponse.json(normalized);

    } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ message: "BFF Error", detail: errorMessage }, { status: 502 });
    } finally {
        releaseMemoCapLock?.();
    }
}
