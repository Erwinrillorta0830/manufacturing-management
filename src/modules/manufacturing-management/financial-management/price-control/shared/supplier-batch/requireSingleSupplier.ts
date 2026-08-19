import { toast } from "sonner";

type SupplierLike = {
    id: number;
    supplier_name?: string | null;
    supplier_shortcut?: string | null;
};

function supplierLabel(supplier: SupplierLike | undefined, supplierId: number): string {
    if (!supplier) return `Supplier #${supplierId}`;
    const shortcut = String(supplier.supplier_shortcut ?? "").trim();
    const name = String(supplier.supplier_name ?? "").trim();
    return shortcut && name ? `${shortcut} - ${name}` : name || shortcut || `Supplier #${supplierId}`;
}

export function requireSingleSupplier(
    supplierIds: number[] | undefined,
    suppliers: SupplierLike[],
): { id: number; name: string } | null {
    const ids = supplierIds ?? [];

    if (ids.length === 0) {
        toast.error("Select exactly one supplier in the filter before exporting or importing.");
        return null;
    }

    if (ids.length > 1) {
        toast.error("Select only one supplier in the filter before exporting or importing.");
        return null;
    }

    const id = Number(ids[0]);
    if (!Number.isFinite(id) || id <= 0) {
        toast.error("Invalid supplier selection.");
        return null;
    }

    const supplier = suppliers.find((item) => Number(item.id) === id);
    return { id, name: supplierLabel(supplier, id) };
}
