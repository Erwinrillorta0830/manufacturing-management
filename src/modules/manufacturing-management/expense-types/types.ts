export type ExpenseTypeStatus = "all" | "active" | "inactive";

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

export type ExpenseTypeFormValues = {
    name: string;
    coaId: string;
    description: string;
    isActive: boolean;
};
