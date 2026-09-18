import { z } from "zod";

export const ContributionMarginFilterSchema = z.object({
    searchQuery: z.string().optional().default(""),
    startDate: z.string().optional().default(""),
    endDate: z.string().optional().default(""),
    categoryId: z.string().optional().default("ALL"),
    brandId: z.string().optional().default("ALL"),
    marginStatus: z.string().optional().default("ALL"),
    drilldownProductId: z.string().optional()
});

export type ContributionMarginFilterInput = z.infer<typeof ContributionMarginFilterSchema>;
