import {
    createLegacyOverheadType,
    getActiveExpenseTypeOptions,
} from "@/app/api/manufacturing/expense-types/_domain";

export async function fetchAllOverheadTypes(): Promise<unknown[]> {
    try {
        const options = await getActiveExpenseTypeOptions();
        return options.map(option => ({
            id: option.id,
            overhead_name: option.label,
            coa_id: option.coaId,
            is_active: true,
        }));
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed fetching overhead types:", e);
        return [];
    }
}

export async function createOverheadType(data: { name: string; coa_id?: number | null; description?: string; created_by?: number | null }): Promise<unknown> {
    if (!data.created_by) throw new Error("A valid administrator session is required.");
    return createLegacyOverheadType({
        name: data.name,
        coaId: data.coa_id || 0,
        description: data.description,
        actorId: data.created_by,
    });
}
