import { z } from "zod";

export const FPYQueryParamsSchema = z.object({
    jobOrderId: z.coerce.number().optional(),
    search: z.string().optional().default(""),
    branchId: z.string().optional().default("all"),
    productId: z.string().optional().default("all"),
    qualityTier: z.enum(["all", "excellent", "acceptable", "needs_attention"]).optional().default("all"),
    dateFrom: z.string().optional().default(""),
    dateTo: z.string().optional().default(""),
    status: z.string().optional().default("all"),
    page: z.coerce.number().min(1).optional().default(1),
    pageSize: z.coerce.number().min(5).max(100).optional().default(20),
    sortField: z.string().optional().default("job_order_no"),
    sortDirection: z.enum(["asc", "desc"]).optional().default("desc")
});

export type FPYQueryParams = z.infer<typeof FPYQueryParamsSchema>;
