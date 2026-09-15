import { DIRECTUS_URL, headers as directusHeaders } from "@/app/api/manufacturing/services/core-api.service";

const EXPENSE_ACCOUNT_TYPES = new Set([
    "cost of sales",
    "cost of service",
    "general and administrative expenses",
    "finance cost",
    "other income",
]);

const INACTIVE_ACCOUNT_STATUSES = new Set([
    "inactive",
    "disabled",
    "archived",
    "deleted",
    "rejected",
]);

const TRUE_VALUES = new Set<unknown>([true, 1, "1", "true", "yes"]);
const FALSE_VALUES = new Set<unknown>([false, 0, "0", "false", "no"]);

export type DirectusRecord = Record<string, unknown>;

export type ExpenseTypeRecord = DirectusRecord & {
    id?: number | string | null;
    overhead_name?: string | null;
    normalized_name?: string | null;
    coa_id?: unknown;
    description?: string | null;
    is_active?: boolean | number | string | null;
    created_by?: unknown;
    created_at?: string | null;
    updated_by?: unknown;
    updated_at?: string | null;
};

export type ChartOfAccountRecord = DirectusRecord & {
    coa_id?: number | string | null;
    gl_code?: string | null;
    account_title?: string | null;
    account_type?: unknown;
    status?: unknown;
    is_active?: unknown;
};

export type AccountTypeRecord = DirectusRecord & {
    id?: number | string | null;
    account_name?: string | null;
};

export type ExpenseTypeChartAccount = {
    coaId: number;
    glCode: string | null;
    accountTitle: string;
    accountTypeName: string;
};

export type ExpenseType = {
    id: number;
    name: string;
    normalizedName: string;
    coaId: number | null;
    chartOfAccount: ExpenseTypeChartAccount | null;
    description: string | null;
    isActive: boolean;
    createdBy: number | null;
    createdAt: string | null;
    updatedBy: number | null;
    updatedAt: string | null;
};

export type ExpenseTypeOption = {
    id: number;
    label: string;
    coaId: number;
};

export type ExpenseTypeInput = {
    name?: unknown;
    coaId?: unknown;
    description?: unknown;
    isActive?: unknown;
};

export class ExpenseTypeDomainError extends Error {
    constructor(
        readonly status: number,
        readonly code: string,
        message: string,
        readonly details?: Record<string, unknown>,
    ) {
        super(message);
        this.name = "ExpenseTypeDomainError";
    }
}

function isRecord(value: unknown): value is DirectusRecord {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asPositiveId(value: unknown): number | null {
    const candidate = isRecord(value)
        ? value.id ?? value.coa_id ?? value.user_id
        : value;
    const parsed = typeof candidate === "number" ? candidate : Number(candidate);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function relationId(value: unknown): number | null {
    return asPositiveId(value);
}

export function parseBoolean(value: unknown, fallback: boolean): boolean {
    if (TRUE_VALUES.has(value)) return true;
    if (FALSE_VALUES.has(value)) return false;
    return fallback;
}

export function normalizeExpenseTypeName(value: unknown): string {
    return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

export function expenseTypeNameKey(value: unknown): string {
    return normalizeExpenseTypeName(value).toLocaleLowerCase();
}

export function isExpenseTypeActive(value: unknown): boolean {
    if (value === undefined || value === null || value === "") return true;
    return parseBoolean(value, true);
}

function recordValue(value: unknown, keys: string[]): unknown {
    if (!isRecord(value)) return undefined;
    for (const key of keys) {
        if (value[key] !== undefined && value[key] !== null) return value[key];
    }
    return undefined;
}

function normalizeAccountStatus(value: unknown): string {
    return String(value ?? "").trim().toLocaleLowerCase();
}

function resolveAccountTypeName(value: unknown, accountTypes: Map<number, string>): string {
    if (isRecord(value)) {
        const name = recordValue(value, ["account_name", "name", "title"]);
        if (typeof name === "string") return name.trim();
    }
    const accountTypeId = asPositiveId(value);
    return accountTypeId ? accountTypes.get(accountTypeId) || "" : "";
}

function isEligibleAccountStatus(row: ChartOfAccountRecord): boolean {
    if (row.is_active !== undefined && row.is_active !== null) {
        return parseBoolean(row.is_active, false);
    }
    const status = normalizeAccountStatus(row.status);
    return !status || !INACTIVE_ACCOUNT_STATUSES.has(status);
}

async function directusJson<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!DIRECTUS_URL) {
        throw new ExpenseTypeDomainError(500, "DIRECTUS_URL_MISSING", "Manufacturing Directus is not configured.");
    }

    const response = await fetch(`${DIRECTUS_URL}${path.startsWith("/") ? path : `/${path}`}`, {
        ...init,
        cache: "no-store",
        headers: { ...directusHeaders, ...(init.headers || {}) },
    });
    const body = await response.json().catch(() => null) as unknown;
    if (!response.ok) {
        const detail = isRecord(body) && typeof body.errors === "object"
            ? JSON.stringify(body.errors)
            : isRecord(body) && typeof body.error === "string"
                ? body.error
                : "";
        throw new ExpenseTypeDomainError(
            response.status >= 400 && response.status < 600 ? response.status : 502,
            "DIRECTUS_REQUEST_FAILED",
            `Expense type catalog request failed with HTTP ${response.status}${detail ? `: ${detail.slice(0, 300)}` : "."}`,
        );
    }
    return body as T;
}

function unwrapData<T>(body: unknown): T {
    if (isRecord(body) && body.data !== undefined) return body.data as T;
    return body as T;
}

export async function listExpenseTypeRecords(): Promise<ExpenseTypeRecord[]> {
    const body = await directusJson<{ data?: ExpenseTypeRecord[] }>(
        "/items/overhead_types?fields=*,coa_id.*&limit=-1&sort=overhead_name,id",
    );
    const rows = unwrapData<ExpenseTypeRecord[]>(body);
    return Array.isArray(rows) ? rows : [];
}

async function loadChartOfAccountRows(): Promise<ChartOfAccountRecord[]> {
    const body = await directusJson<{ data?: ChartOfAccountRecord[] }>(
        "/items/chart_of_accounts?fields=coa_id,gl_code,account_title,account_type,status&limit=-1&sort=gl_code,coa_id",
    );
    const rows = unwrapData<ChartOfAccountRecord[]>(body);
    return Array.isArray(rows) ? rows : [];
}

async function loadAccountTypeRows(): Promise<AccountTypeRecord[]> {
    const body = await directusJson<{ data?: AccountTypeRecord[] }>(
        "/items/account_types?fields=id,account_name&limit=-1&sort=account_name,id",
    );
    const rows = unwrapData<AccountTypeRecord[]>(body);
    return Array.isArray(rows) ? rows : [];
}

export async function getEligibleExpenseAccounts(): Promise<ExpenseTypeChartAccount[]> {
    const [accountRows, typeRows] = await Promise.all([loadChartOfAccountRows(), loadAccountTypeRows()]);
    const accountTypes = new Map(
        typeRows
            .map(row => [asPositiveId(row.id), String(row.account_name || "").trim()] as const)
            .filter(([id, name]) => id !== null && name.length > 0),
    ) as Map<number, string>;

    return accountRows
        .map(row => {
            const coaId = asPositiveId(row.coa_id);
            const accountTypeName = resolveAccountTypeName(row.account_type, accountTypes);
            if (!coaId || !isEligibleAccountStatus(row) || !EXPENSE_ACCOUNT_TYPES.has(accountTypeName.toLocaleLowerCase())) {
                return null;
            }
            return {
                coaId,
                glCode: typeof row.gl_code === "string" && row.gl_code.trim() ? row.gl_code.trim() : null,
                accountTitle: String(row.account_title || "").trim() || `Account #${coaId}`,
                accountTypeName,
            } satisfies ExpenseTypeChartAccount;
        })
        .filter((row): row is ExpenseTypeChartAccount => row !== null);
}

function expenseTypeFromRecord(record: ExpenseTypeRecord, accountMap?: Map<number, ExpenseTypeChartAccount>): ExpenseType {
    const id = asPositiveId(record.id);
    if (!id) throw new ExpenseTypeDomainError(502, "INVALID_EXPENSE_TYPE_RECORD", "Directus returned an expense type without a valid ID.");

    const coaId = relationId(record.coa_id);
    const coaRecord = isRecord(record.coa_id) ? record.coa_id : null;
    const accountTypeRecord = coaRecord && isRecord(coaRecord.account_type) ? coaRecord.account_type : null;
    const relationCoa = coaRecord && coaId
        ? {
            coaId,
            glCode: typeof coaRecord.gl_code === "string" ? coaRecord.gl_code : null,
            accountTitle: String(coaRecord.account_title || coaRecord.account_name || `Account #${coaId}`),
            accountTypeName: String(accountTypeRecord?.account_name || ""),
        }
        : null;
    const coa = relationCoa || (coaId ? accountMap?.get(coaId) || {
        coaId,
        glCode: null,
        accountTitle: `Account #${coaId}`,
        accountTypeName: "Unavailable or inactive",
    } : null);

    return {
        id,
        name: normalizeExpenseTypeName(record.overhead_name),
        normalizedName: expenseTypeNameKey(record.overhead_name),
        coaId,
        chartOfAccount: coa,
        description: typeof record.description === "string" && record.description.trim() ? record.description.trim() : null,
        isActive: isExpenseTypeActive(record.is_active),
        createdBy: relationId(record.created_by),
        createdAt: typeof record.created_at === "string" ? record.created_at : null,
        updatedBy: relationId(record.updated_by),
        updatedAt: typeof record.updated_at === "string" ? record.updated_at : null,
    };
}

export function toExpenseType(record: ExpenseTypeRecord): ExpenseType {
    return expenseTypeFromRecord(record);
}

export async function listExpenseTypes(options: {
    includeInactive?: boolean;
    query?: string;
    status?: "all" | "active" | "inactive";
} = {}): Promise<ExpenseType[]> {
    const rows = await listExpenseTypeRecords();
    const accountMap = new Map((await getEligibleExpenseAccounts()).map(account => [account.coaId, account]));
    const query = normalizeExpenseTypeName(options.query).toLocaleLowerCase();
    const status = options.status || (options.includeInactive ? "all" : "active");

    return rows
        .map(row => expenseTypeFromRecord(row, accountMap))
        .filter(row => {
            if (query && !`${row.name} ${row.description || ""}`.toLocaleLowerCase().includes(query)) return false;
            if (status === "active" && !row.isActive) return false;
            if (status === "inactive" && row.isActive) return false;
            if (!options.includeInactive && !row.isActive) return false;
            return true;
        });
}

export async function getActiveExpenseTypeOptions(): Promise<ExpenseTypeOption[]> {
    const [types, accounts] = await Promise.all([
        listExpenseTypes({ status: "active" }),
        getEligibleExpenseAccounts(),
    ]);
    const eligibleAccountIds = new Set(accounts.map(account => account.coaId));

    return types
        .map(type => type.coaId && eligibleAccountIds.has(type.coaId)
            ? { id: type.id, label: type.name, coaId: type.coaId }
            : null)
        .filter((option): option is ExpenseTypeOption => option !== null && option.label.length > 0)
        .sort((left, right) => left.label.localeCompare(right.label));
}

async function assertEligibleCoa(coaId: number): Promise<ExpenseTypeChartAccount> {
    const accounts = await getEligibleExpenseAccounts();
    const account = accounts.find(candidate => candidate.coaId === coaId);
    if (!account) {
        throw new ExpenseTypeDomainError(
            400,
            "EXPENSE_TYPE_COA_INVALID",
            "Select an active GL account from an allowed expense account category.",
            { coaId },
        );
    }
    return account;
}

function validateName(value: unknown): string {
    const name = normalizeExpenseTypeName(value);
    if (!name) throw new ExpenseTypeDomainError(400, "EXPENSE_TYPE_NAME_REQUIRED", "Expense Type name is required.");
    if (name.length > 150) throw new ExpenseTypeDomainError(400, "EXPENSE_TYPE_NAME_TOO_LONG", "Expense Type name must be 150 characters or fewer.");
    return name;
}

function validateDescription(value: unknown): string | null {
    if (value === undefined || value === null) return null;
    if (typeof value !== "string") throw new ExpenseTypeDomainError(400, "EXPENSE_TYPE_DESCRIPTION_INVALID", "Expense Type description must be text.");
    const description = value.trim();
    if (description.length > 255) throw new ExpenseTypeDomainError(400, "EXPENSE_TYPE_DESCRIPTION_TOO_LONG", "Expense Type description must be 255 characters or fewer.");
    return description || null;
}

async function assertUniqueName(name: string, currentId?: number): Promise<void> {
    const nameKey = expenseTypeNameKey(name);
    const rows = await listExpenseTypeRecords();
    const duplicate = rows.find(row => {
        const id = asPositiveId(row.id);
        return id !== currentId && expenseTypeNameKey(row.overhead_name) === nameKey;
    });
    if (duplicate) {
        throw new ExpenseTypeDomainError(
            409,
            "EXPENSE_TYPE_NAME_EXISTS",
            `Expense Type "${name}" already exists. Edit or reactivate the existing record instead.`,
            { existingId: asPositiveId(duplicate.id) },
        );
    }
}

async function createDirectusExpenseType(payload: DirectusRecord): Promise<ExpenseTypeRecord> {
    const body = await directusJson<{ data?: ExpenseTypeRecord }>("/items/overhead_types", {
        method: "POST",
        body: JSON.stringify(payload),
    });
    const row = unwrapData<ExpenseTypeRecord>(body);
    if (!isRecord(row)) throw new ExpenseTypeDomainError(502, "EXPENSE_TYPE_CREATE_EMPTY", "Directus did not return the created Expense Type.");
    return row as ExpenseTypeRecord;
}

export async function createExpenseType(input: ExpenseTypeInput, actorId: number): Promise<ExpenseType> {
    const name = validateName(input.name);
    const coaId = asPositiveId(input.coaId);
    if (!coaId) throw new ExpenseTypeDomainError(400, "EXPENSE_TYPE_COA_REQUIRED", "A GL account is required for every Expense Type.");
    await assertUniqueName(name);
    const account = await assertEligibleCoa(coaId);

    const row = await createDirectusExpenseType({
        overhead_name: name,
        normalized_name: expenseTypeNameKey(name),
        coa_id: coaId,
        description: validateDescription(input.description),
        is_active: true,
        created_by: actorId,
        created_at: new Date().toISOString(),
    });
    return { ...expenseTypeFromRecord(row, new Map([[account.coaId, account]])), chartOfAccount: account };
}

export async function updateExpenseType(id: number, input: ExpenseTypeInput, actorId: number): Promise<ExpenseType> {
    const rows = await listExpenseTypeRecords();
    const current = rows.find(row => asPositiveId(row.id) === id);
    if (!current) throw new ExpenseTypeDomainError(404, "EXPENSE_TYPE_NOT_FOUND", "Expense Type was not found.");

    const name = validateName(input.name ?? current.overhead_name);
    const currentCoaId = relationId(current.coa_id);
    const requestedCoaId = input.coaId === undefined ? currentCoaId : asPositiveId(input.coaId);
    const isActive = input.isActive === undefined ? isExpenseTypeActive(current.is_active) : parseBoolean(input.isActive, false);

    await assertUniqueName(name, id);
    let account: ExpenseTypeChartAccount | null = null;
    if (isActive) {
        if (!requestedCoaId) throw new ExpenseTypeDomainError(400, "EXPENSE_TYPE_COA_REQUIRED", "An active Expense Type must have a GL account.");
        account = await assertEligibleCoa(requestedCoaId);
    } else if (requestedCoaId) {
        account = await getEligibleExpenseAccounts().then(accounts => accounts.find(candidate => candidate.coaId === requestedCoaId) || null);
    }

    const body = await directusJson<{ data?: ExpenseTypeRecord }>(`/items/overhead_types/${encodeURIComponent(String(id))}`, {
        method: "PATCH",
        body: JSON.stringify({
            overhead_name: name,
            normalized_name: expenseTypeNameKey(name),
            coa_id: requestedCoaId,
            description: validateDescription(input.description),
            is_active: isActive,
            updated_by: actorId,
            updated_at: new Date().toISOString(),
        }),
    });
    const row = unwrapData<ExpenseTypeRecord>(body);
    if (!isRecord(row)) throw new ExpenseTypeDomainError(502, "EXPENSE_TYPE_UPDATE_EMPTY", "Directus did not return the updated Expense Type.");
    return {
        ...expenseTypeFromRecord(row as ExpenseTypeRecord, account ? new Map([[account.coaId, account]]) : undefined),
        chartOfAccount: account || null,
    };
}

export async function createLegacyOverheadType(input: {
    name: string;
    coaId: number;
    description?: string;
    actorId: number;
}): Promise<ExpenseTypeRecord> {
    const created = await createExpenseType(input, input.actorId);
    return {
        id: created.id,
        overhead_name: created.name,
        normalized_name: created.normalizedName,
        coa_id: created.coaId,
        description: created.description,
        is_active: created.isActive,
        created_by: created.createdBy,
        created_at: created.createdAt,
        updated_by: created.updatedBy,
        updated_at: created.updatedAt,
    };
}
