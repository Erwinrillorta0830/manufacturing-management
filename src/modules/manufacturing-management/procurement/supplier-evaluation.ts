import type { SupplierEvaluationGrade, SupplierEvaluationInput } from "./types";

type SupplierEvaluationRatings = Pick<
    SupplierEvaluationInput,
    "delivery_rating" | "quality_rating" | "price_rating" | "compliance_rating"
>;

export function calculateSupplierEvaluationScore(
    ratings: SupplierEvaluationRatings
): { overall_score: number; grade: SupplierEvaluationGrade } {
    const average = (
        ratings.delivery_rating
        + ratings.quality_rating
        + ratings.price_rating
        + ratings.compliance_rating
    ) / 4;
    const overall_score = Math.round((average / 5) * 100);

    let grade: SupplierEvaluationGrade = "F";
    if (overall_score >= 95) grade = "A+";
    else if (overall_score >= 85) grade = "A";
    else if (overall_score >= 70) grade = "B";
    else if (overall_score >= 50) grade = "C";

    return { overall_score, grade };
}
