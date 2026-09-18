import { z } from "zod";

export const ScrapFiltersSchema = z.object({
    search: z.string().default(""),
    branchId: z.string().default("all"),
    productId: z.string().default("all"),
    defectCategory: z.string().default("all"),
    status: z.string().default("all"),
    dateFrom: z.string().default(""),
    dateTo: z.string().default("")
});

export type ScrapFiltersInput = z.infer<typeof ScrapFiltersSchema>;
