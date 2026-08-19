import type { PCRStatusFilter } from "../types";

export function apiStatusParam(status?: PCRStatusFilter): string | undefined {
    return status && status !== "ALL" ? status : undefined;
}
