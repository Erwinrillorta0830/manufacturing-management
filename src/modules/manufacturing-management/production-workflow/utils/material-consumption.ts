import type { ProductionMaterialReservation } from "../types";

export type MaterialConsumptionReservation = Pick<
    ProductionMaterialReservation,
    | "jo_material_id"
    | "allocated_quantity"
    | "required_quantity"
    | "issued_to_wip_quantity"
    | "reserved_quantity"
    | "staged_quantity"
    | "available_stock"
>;

export interface MaterialConsumptionDefault {
    theoreticalQuantity: number;
    actualQuantity: string;
}

type EditableReservation = Pick<ProductionMaterialReservation, "jo_material_id" | "reservation_id" | "actual_qty">;

const QUANTITY_SCALE = 1_000_000;

export function sumProductionOutputQuantities(good: unknown, rejected: unknown, scrap: unknown): number {
    return [good, rejected, scrap].reduce<number>((sum, value) => {
        const parsed = Number(value ?? 0);
        return sum + (Number.isFinite(parsed) ? parsed : 0);
    }, 0);
}

export function preserveExistingActualQuantities<T extends EditableReservation>(
    refreshedMaterials: T[],
    previousMaterials: T[]
): T[] {
    const previousActuals = new Map(previousMaterials.map((material) => [
        `${material.jo_material_id}:${material.reservation_id ?? "unreserved"}`,
        material.actual_qty
    ]));

    return refreshedMaterials.map((material) => {
        const key = `${material.jo_material_id}:${material.reservation_id ?? "unreserved"}`;
        const previousActual = previousActuals.get(key);
        return previousActual === undefined ? material : { ...material, actual_qty: previousActual };
    });
}

function finiteNonNegative(value: unknown): number {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function roundQuantity(value: number): number {
    return Math.round(value * QUANTITY_SCALE) / QUANTITY_SCALE;
}

function reservationBasis(reservation: MaterialConsumptionReservation): number {
    return finiteNonNegative(
        reservation.issued_to_wip_quantity
        || reservation.reserved_quantity
        || reservation.staged_quantity
        || 0
    );
}

/**
 * Calculate the theoretical and default actual consumption per reservation.
 * Theoretical demand follows the Job Order's allocated/required quantity per
 * target output; actual defaults are distributed over remaining WIP and never
 * exceed a reservation's available stock.
 */
export function calculateMaterialConsumptionDefaults(
    reservations: MaterialConsumptionReservation[],
    targetQuantity: number,
    totalOutputQuantity: number
): MaterialConsumptionDefault[] {
    const result = reservations.map(() => ({ theoreticalQuantity: 0, actualQuantity: "0.000000" }));
    if (reservations.length === 0) return result;

    const groupedIndices = new Map<number, number[]>();
    reservations.forEach((reservation, index) => {
        const materialId = Number(reservation.jo_material_id || 0);
        const group = groupedIndices.get(materialId) || [];
        group.push(index);
        groupedIndices.set(materialId, group);
    });

    const target = finiteNonNegative(targetQuantity);
    const output = finiteNonNegative(totalOutputQuantity);
    if (target <= 0 || output <= 0) return result;

    for (const indices of groupedIndices.values()) {
        const first = reservations[indices[0]];
        const baseValue = first.allocated_quantity ?? first.required_quantity ?? 0;
        const baseQuantity = finiteNonNegative(baseValue);
        const totalTheoretical = roundQuantity((baseQuantity / target) * output);
        const availableWeights = indices.map((index) => finiteNonNegative(reservations[index].available_stock));
        const availableTotal = availableWeights.reduce((sum, value) => sum + value, 0);
        const fallbackWeights = indices.map((index) => reservationBasis(reservations[index]));
        const chosenWeights = availableTotal > 0
            ? availableWeights
            : fallbackWeights;
        const weightTotal = chosenWeights.reduce((sum, value) => sum + value, 0);
        const weights = weightTotal > 0
            ? chosenWeights.map((value) => value / weightTotal)
            : indices.map(() => 1 / indices.length);

        let distributedTheoretical = 0;
        indices.forEach((reservationIndex, localIndex) => {
            const theoreticalQuantity = localIndex === indices.length - 1
                ? roundQuantity(totalTheoretical - distributedTheoretical)
                : roundQuantity(totalTheoretical * weights[localIndex]);
            distributedTheoretical += theoreticalQuantity;

            const available = availableWeights[localIndex];
            const actualQuantity = roundQuantity(Math.min(theoreticalQuantity, available));
            result[reservationIndex] = {
                theoreticalQuantity: Math.max(0, theoreticalQuantity),
                actualQuantity: actualQuantity.toFixed(6)
            };
        });
    }

    return result;
}
