export interface PageMeta {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
}

export interface PaginatedResponse<T> {
    data: T[];
    meta: PageMeta;
}

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

export function hasPagination(searchParams: URLSearchParams): boolean {
    return searchParams.has("page") || searchParams.has("pageSize");
}

export function readPagination(searchParams: URLSearchParams): { page: number; pageSize: number } {
    const rawPage = Number(searchParams.get("page") || 1);
    const rawPageSize = Number(searchParams.get("pageSize") || DEFAULT_PAGE_SIZE);
    const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1;
    const pageSize = Number.isSafeInteger(rawPageSize) && rawPageSize > 0
        ? Math.min(rawPageSize, MAX_PAGE_SIZE)
        : DEFAULT_PAGE_SIZE;

    return { page, pageSize };
}

export function paginate<T>(rows: T[], searchParams: URLSearchParams): PaginatedResponse<T> {
    const { page, pageSize } = readPagination(searchParams);
    const total = rows.length;
    const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
    const offset = (page - 1) * pageSize;

    return {
        data: rows.slice(offset, offset + pageSize),
        meta: { page, pageSize, total, totalPages }
    };
}
