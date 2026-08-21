import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export const runtime = "nodejs";

const DIRECTUS_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");
const DIRECTUS_TOKEN = process.env.DIRECTUS_STATIC_TOKEN || "";

interface DashboardDisbursement {
    id: number;
    doc_no?: string;
    transaction_date?: string;
    date_created?: string;
    status?: string;
    total_amount?: number;
    paid_amount?: number;
    payee?: {
        id?: number;
        supplier_name?: string;
    };
    division_id?: {
        division_id?: number;
        division_name?: string;
    };
    department_id?: {
        department_id?: number;
        department_name?: string;
    };
    payables?: Array<{
        amount?: number;
        coa_id?: {
            coa_id?: number;
            account_title?: string;
        };
    }>;
    payments?: Array<{
        amount?: number;
        check_no?: string;
        bank_id?: number;
        coa_id?: {
            coa_id?: number;
            account_title?: string;
        };
    }>;
    supporting_documents_url?: string;
}

interface PayableRow {
    id: number;
    disbursement_id: number;
    division_id?: {
        division_id?: number;
        division_name?: string;
    } | number | null;
    reference_no?: string;
    date?: string;
    coa_id?: {
        coa_id?: number;
        account_title?: string;
    } | number | null;
    amount?: number;
    remarks?: string;
}

interface PaymentRow {
    id: number;
    disbursement_id: number;
    coa_id?: {
        coa_id?: number;
        account_title?: string;
    } | number | null;
    bank_id?: number;
    check_no?: string;
    date?: string;
    amount?: number;
    remarks?: string;
}

export async function GET(req: NextRequest) {
    const cookieStore = await cookies();
    const token = cookieStore.get("vos_access_token")?.value;

    if (!token) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");
    const status = url.searchParams.get("status") || "ALL";
    const payeeId = url.searchParams.get("payeeId");
    const transactionType = url.searchParams.get("transactionType");
    const encoderId = url.searchParams.get("encoderId");
    const coaId = url.searchParams.get("coaId");
    const minAmount = url.searchParams.get("minAmount");
    const maxAmount = url.searchParams.get("maxAmount");
    const remarks = url.searchParams.get("remarks");
    const divisionId = url.searchParams.get("divisionId");

    try {
        const encodersPromise = fetch(`${DIRECTUS_URL}/items/disbursement?groupBy[]=encoder_id&filter[encoder_id][_null]=false`, {
            headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}` },
            cache: "no-store",
        }).then(res => res.json()).catch(err => {
            console.warn("Failed to fetch active encoders list:", err);
            return { data: [] };
        });

        const coasPromise = fetch(`${DIRECTUS_URL}/items/chart_of_accounts?limit=-1&fields=coa_id,account_title`, {
            headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}` },
            cache: "no-store",
        }).then(res => res.json()).catch(err => {
            console.warn("Failed to fetch chart of accounts list for dashboard:", err);
            return { data: [] };
        });

        const bankAccountsPromise = fetch(`${DIRECTUS_URL}/items/bank_accounts?limit=-1&fields=bank_id,bank_name,account_number`, {
            headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}` },
            cache: "no-store",
        }).then(res => res.json()).catch(err => {
            console.warn("Failed to fetch bank accounts list for dashboard:", err);
            return { data: [] };
        });

        const filterAnd: Record<string, unknown>[] = [];
        if (startDate) filterAnd.push({ transaction_date: { _gte: startDate } });
        if (endDate) filterAnd.push({ transaction_date: { _lte: endDate } });
        
        if (status && status !== "ALL") {
            const list = status.split(",").map(s => s.trim()).filter(Boolean);
            if (list.length > 0) {
                filterAnd.push({ status: { _in: list } });
            }
        } else {
            filterAnd.push({ status: { _neq: "Deleted" } });
        }
        if (payeeId && payeeId !== "ALL" && payeeId !== "") {
            const ids = payeeId.split(",").map(Number).filter(n => !isNaN(n));
            if (ids.length > 0) {
                filterAnd.push({ payee: { _in: ids } });
            }
        }
        if (transactionType && transactionType !== "ALL" && transactionType !== "") {
            const ids = transactionType.split(",").map(Number).filter(n => !isNaN(n));
            if (ids.length > 0) {
                filterAnd.push({ transaction_type: { _in: ids } });
            }
        }
        if (encoderId && encoderId !== "ALL" && encoderId !== "") {
            const ids = encoderId.split(",").map(Number).filter(n => !isNaN(n));
            if (ids.length > 0) {
                filterAnd.push({ encoder_id: { _in: ids } });
            }
        }
        
        if (minAmount) filterAnd.push({ total_amount: { _gte: Number(minAmount) } });
        if (maxAmount) filterAnd.push({ total_amount: { _lte: Number(maxAmount) } });

        if (remarks && remarks.trim() !== "") {
            filterAnd.push({
                _or: [
                    { remarks: { _contains: remarks } },
                    { payables: { remarks: { _contains: remarks } } }
                ]
            });
        }

        if (coaId && coaId !== "ALL" && coaId !== "") {
            const ids = coaId.split(",").map(Number).filter(n => !isNaN(n));
            if (ids.length > 0) {
                filterAnd.push({
                    _or: [
                        { payables: { coa_id: { _in: ids } } },
                        { payments: { coa_id: { _in: ids } } }
                    ]
                });
            }
        }

        if (divisionId && divisionId !== "ALL" && divisionId !== "") {
            const ids = divisionId.split(",").map(Number).filter(n => !isNaN(n));
            if (ids.length > 0) {
                filterAnd.push({ division_id: { _in: ids } });
            }
        }
        const queryParams = new URLSearchParams({
            limit: "-1",
            fields: [
                "id",
                "doc_no",
                "transaction_date",
                "date_created",
                "status",
                "payee.id",
                "payee.supplier_name",
                "total_amount",
                "paid_amount",
                "division_id.division_id",
                "division_id.division_name",
                "department_id.department_id",
                "department_id.department_name",
                "payables.coa_id.coa_id",
                "payables.coa_id.account_title",
                "payables.amount",
                "payments.coa_id.coa_id",
                "payments.coa_id.account_title",
                "payments.amount",
                "payments.check_no",
                "payments.bank_id",
                "supporting_documents_url"
            ].join(","),
            sort: "-date_created,-id"
        });

        if (filterAnd.length > 0) {
            queryParams.set("filter", JSON.stringify({ _and: filterAnd }));
        }

        const directusRes = await fetch(`${DIRECTUS_URL}/items/disbursement?${queryParams.toString()}`, {
            headers: {
                Authorization: `Bearer ${DIRECTUS_TOKEN}`,
            },
            cache: "no-store",
        });

        if (!directusRes.ok) throw new Error(await directusRes.text());
        const disbursements = ((await directusRes.json()).data || []) as DashboardDisbursement[];

        // Keep the register order deterministic even if the Directus adapter does not honor sort.
        disbursements.sort((a, b) => {
            const createdA = a.date_created ? Date.parse(a.date_created) : Number.NEGATIVE_INFINITY;
            const createdB = b.date_created ? Date.parse(b.date_created) : Number.NEGATIVE_INFINITY;
            const createdDiff = (Number.isNaN(createdB) ? Number.NEGATIVE_INFINITY : createdB)
                - (Number.isNaN(createdA) ? Number.NEGATIVE_INFINITY : createdA);

            return createdDiff || Number(b.id) - Number(a.id);
        });

        // Extract voucher IDs
        const ids = disbursements.map(d => d.id).filter(Boolean);

        let payablesList: PayableRow[] = [];
        let paymentsList: PaymentRow[] = [];

        if (ids.length > 0) {
            const payableParams = new URLSearchParams({
                limit: "-1",
                fields: "id,disbursement_id,division_id.division_id,division_id.division_name,reference_no,date,coa_id,coa_id.coa_id,coa_id.account_title,amount,remarks",
            });
            payableParams.set("filter[disbursement_id][_in]", ids.join(","));

            const paymentParams = new URLSearchParams({
                limit: "-1",
                fields: "id,disbursement_id,coa_id,coa_id.coa_id,coa_id.account_title,bank_id,check_no,date,amount,remarks",
            });
            paymentParams.set("filter[disbursement_id][_in]", ids.join(","));

            const [payablesRes, paymentsRes] = await Promise.all([
                fetch(`${DIRECTUS_URL}/items/disbursement_payables?${payableParams.toString()}`, {
                    headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}` },
                    cache: "no-store"
                }),
                fetch(`${DIRECTUS_URL}/items/disbursement_payments?${paymentParams.toString()}`, {
                    headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}` },
                    cache: "no-store"
                })
            ]);

            if (payablesRes.ok) payablesList = (await payablesRes.json()).data || [];
            if (paymentsRes.ok) paymentsList = (await paymentsRes.json()).data || [];
        }

        const payablesMap = new Map<number, PayableRow[]>();
        payablesList.forEach((p) => {
            const dId = Number(p.disbursement_id);
            if (dId) {
                const current = payablesMap.get(dId) || [];
                current.push(p);
                payablesMap.set(dId, current);
            }
        });

        const paymentsMap = new Map<number, PaymentRow[]>();
        paymentsList.forEach((p) => {
            const dId = Number(p.disbursement_id);
            if (dId) {
                const current = paymentsMap.get(dId) || [];
                current.push(p);
                paymentsMap.set(dId, current);
            }
        });

        const coasJson = (await coasPromise) as { data?: { coa_id?: number; account_title?: string }[] } | null | undefined;
        const coaMap = new Map<number, string>();
        if (coasJson && Array.isArray(coasJson.data)) {
            coasJson.data.forEach((c) => {
                const id = Number(c.coa_id);
                const title = String(c.account_title);
                if (id && title) {
                    coaMap.set(id, title);
                }
            });
        }

        const bankAccountsJson = (await bankAccountsPromise) as { data?: { bank_id?: number; bank_name?: string; account_number?: string }[] } | null | undefined;
        const bankMap = new Map<number, string>();
        if (bankAccountsJson && Array.isArray(bankAccountsJson.data)) {
            bankAccountsJson.data.forEach((b) => {
                const id = Number(b.bank_id);
                const name = `${b.bank_name || ""} - ${b.account_number || ""}`.trim() || b.bank_name || "";
                if (id && name) {
                    bankMap.set(id, name);
                }
            });
        }

        // 2. Perform aggregates in-memory
        let totalDisbursed = 0;
        let totalPaid = 0;

        const divisionMap = new Map<number, { 
            name: string; 
            amount: number;
            departments: Map<number, { name: string; amount: number }> 
        }>();
        const paymentCoaMap = new Map<number, { title: string; amount: number }>();
        const payableCoaMap = new Map<number, { title: string; amount: number }>();

        const vouchers = disbursements.map((d: DashboardDisbursement) => {
            const docAmt = Number(d.total_amount) || 0;
            const paidAmt = Number(d.paid_amount) || 0;

            totalDisbursed += docAmt;
            totalPaid += paidAmt;

            const payables = payablesMap.get(d.id) || [];
            const payments = paymentsMap.get(d.id) || [];

            // Group division & department expenses: strictly by the disbursement header division & department & paid amount
            const divId = d.division_id?.division_id || (typeof d.division_id === "number" ? d.division_id : null);
            const divName = d.division_id?.division_name || "N/A";
            const divIdNum = divId ? Number(divId) : 0;

            const deptId = d.department_id?.department_id || (typeof d.department_id === "number" ? d.department_id : null);
            const deptName = d.department_id?.department_name || "N/A";
            const deptIdNum = deptId ? Number(deptId) : 0;

            const currentDiv = divisionMap.get(divIdNum) || { name: String(divName), amount: 0, departments: new Map() };
            currentDiv.amount += paidAmt;

            if (deptIdNum) {
                const currentDept = currentDiv.departments.get(deptIdNum) || { name: String(deptName), amount: 0 };
                currentDept.amount += paidAmt;
                currentDiv.departments.set(deptIdNum, currentDept);
            }
            divisionMap.set(divIdNum, currentDiv);

            // Group by cash/bank account of payment (actual cash outflows)
            payments.forEach((p) => {
                const pCoaId = p.coa_id && typeof p.coa_id === "object" && "coa_id" in p.coa_id
                    ? p.coa_id.coa_id
                    : (typeof p.coa_id === "number" ? p.coa_id : null);
                let title = "N/A";
                if (p.coa_id && typeof p.coa_id === "object" && "account_title" in p.coa_id) {
                    title = String(p.coa_id.account_title);
                } else if (pCoaId) {
                    title = coaMap.get(Number(pCoaId)) || `Account #${pCoaId}`;
                }
                if (pCoaId) {
                    const idNum = Number(pCoaId);
                    const currentCoa = paymentCoaMap.get(idNum) || { title: String(title), amount: 0 };
                    currentCoa.amount += Number(p.amount) || 0;
                    paymentCoaMap.set(idNum, currentCoa);
                }
            });

            // Group by account of payable (expense accounts)
            payables.forEach((p) => {
                const pCoaId = p.coa_id && typeof p.coa_id === "object" && "coa_id" in p.coa_id
                    ? p.coa_id.coa_id
                    : (typeof p.coa_id === "number" ? p.coa_id : null);
                let title = "N/A";
                if (p.coa_id && typeof p.coa_id === "object" && "account_title" in p.coa_id) {
                    title = String(p.coa_id.account_title);
                } else if (pCoaId) {
                    title = coaMap.get(Number(pCoaId)) || `Account #${pCoaId}`;
                }
                if (pCoaId) {
                    const idNum = Number(pCoaId);
                    const currentCoa = payableCoaMap.get(idNum) || { title: String(title), amount: 0 };
                    currentCoa.amount += Number(p.amount) || 0;
                    payableCoaMap.set(idNum, currentCoa);
                }
            });

            const checkNumbers = Array.from(new Set(
                payments.map((p) => p.check_no).filter((c): c is string => Boolean(c && c.trim()))
            )).join(", ");

            const bankNames = Array.from(new Set(
                payments.map((p) => p.bank_id).filter(Boolean)
            )).map(b => bankMap.get(Number(b)) || `Bank ID #${b}`).join(", ");

            const expenseAccountsHit = Array.from(new Set(
                payables.map((p) => {
                    if (p.coa_id && typeof p.coa_id === "object" && "account_title" in p.coa_id) {
                        return p.coa_id.account_title;
                    }
                    return undefined;
                }).filter((t): t is string => Boolean(t && t.trim()))
            )).join(", ");

            return {
                id: d.id,
                docNo: d.doc_no || "",
                transactionDate: d.transaction_date || "",
                status: d.status || "Draft",
                payeeName: d.payee?.supplier_name || "",
                totalAmount: docAmt,
                paidAmount: paidAmt,
                checkNumbers,
                bankNames,
                expenseAccountsHit,
                supportingDocumentsUrl: d.supporting_documents_url || ""
            };
        });

        const divisionExpenses = Array.from(divisionMap.entries()).map(([id, data]) => ({
            divisionId: id,
            divisionName: data.name,
            totalExpense: Math.round(data.amount * 100) / 100,
            departments: Array.from(data.departments.entries()).map(([dId, dData]) => ({
                departmentId: dId,
                departmentName: dData.name,
                totalExpense: Math.round(dData.amount * 100) / 100
            }))
        }));

        const paymentCoaExpenses = Array.from(paymentCoaMap.entries()).map(([id, data]) => ({
            coaId: id,
            accountTitle: data.title,
            totalExpense: Math.round(data.amount * 100) / 100
        }));

        const payableCoaExpenses = Array.from(payableCoaMap.entries()).map(([id, data]) => ({
            coaId: id,
            accountTitle: data.title,
            totalExpense: Math.round(data.amount * 100) / 100
        }));

        const payableDivisionMap = new Map<number, { name: string; amount: number }>();
        payablesList.forEach((p) => {
            const pDivId = p.division_id && typeof p.division_id === "object" && "division_id" in p.division_id
                ? p.division_id.division_id
                : (typeof p.division_id === "number" ? p.division_id : null);
            let name = "N/A";
            if (p.division_id && typeof p.division_id === "object" && "division_name" in p.division_id) {
                name = String(p.division_id.division_name);
            }
            const divIdNum = pDivId ? Number(pDivId) : 0;
            const current = payableDivisionMap.get(divIdNum) || { name, amount: 0 };
            current.amount += Number(p.amount) || 0;
            payableDivisionMap.set(divIdNum, current);
        });

        const payableDivisionExpenses = Array.from(payableDivisionMap.entries()).map(([id, data]) => ({
            divisionId: id,
            divisionName: data.name,
            totalExpense: Math.round(data.amount * 100) / 100
        }));

        const encodersJson = (await encodersPromise) as { data?: { encoder_id?: number | null }[] } | null | undefined;
        const activeEncoderIds = (encodersJson?.data || [])
            .map((e): number | null | undefined => e?.encoder_id)
            .filter((id): id is number => typeof id === "number");

        return NextResponse.json({
            totalDisbursed: Math.round(totalDisbursed * 100) / 100,
            totalPaid: Math.round(totalPaid * 100) / 100,
            totalUnpaidPayables: Math.round((totalDisbursed - totalPaid) * 100) / 100,
            divisionExpenses,
            payableDivisionExpenses,
            paymentCoaExpenses,
            payableCoaExpenses,
            vouchers,
            activeEncoderIds
        });

    } catch (err: unknown) {
        console.error("[BFF GET Disbursement Dashboard Error]:", err);
        return NextResponse.json({
            message: "BFF Error",
            detail: (err instanceof Error ? err.message : String(err))
        }, { status: 502 });
    }
}
