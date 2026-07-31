import { 
    UnitOption, 
    WeightUnitOption, 
    SelectOption 
} from "../types/raw-materials.types";

export async function fetchProductInventoryDetails(productId: number) {
    const res = await fetch(`/api/manufacturing/inventory?productId=${productId}`);
    if (!res.ok) {
        throw new Error("Failed to load inventory details");
    }
    const data = await res.json();
    return data.lots || [];
}

export async function fetchRawMaterialMetadata(): Promise<{
    units: UnitOption[];
    weightUnits: WeightUnitOption[];
    brands: SelectOption[];
    categories: SelectOption[];
}> {
    const [unitsRes, brandsRes, categoriesRes, weightUnitsRes] = await Promise.all([
        fetch("/api/manufacturing/finished-goods/units").then(res => res.json()),
        fetch("/api/manufacturing/finished-goods/brands").then(res => res.json()),
        fetch("/api/manufacturing/finished-goods/categories").then(res => res.json()),
        fetch("/api/manufacturing/finished-goods/weight-units").then(res => res.json())
    ]);

    const units: UnitOption[] = unitsRes || [];
    const weightUnits: WeightUnitOption[] = weightUnitsRes || [];
    const brands: SelectOption[] = (brandsData => (brandsData || []).map((b: any) => ({ value: String(b.brand_id), label: b.brand_name })))(brandsRes);
    const categories: SelectOption[] = (categoriesData => (categoriesData || []).map((c: any) => ({ value: String(c.category_id), label: c.category_name })))(categoriesRes);

    return { units, weightUnits, brands, categories };
}

export async function createBrandOnTheFly(name: string): Promise<SelectOption> {
    const res = await fetch("/api/manufacturing/finished-goods/brands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand_name: name })
    });
    if (!res.ok) throw new Error("Failed to create brand");
    const data = await res.json();
    const newBrand = data.brand;
    if (!newBrand) throw new Error("Invalid response creating brand");
    return { value: String(newBrand.brand_id), label: newBrand.brand_name };
}

export async function createCategoryOnTheFly(name: string): Promise<SelectOption> {
    const res = await fetch("/api/manufacturing/finished-goods/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category_name: name })
    });
    if (!res.ok) throw new Error("Failed to create category");
    const data = await res.json();
    const newCat = data.category;
    if (!newCat) throw new Error("Invalid response creating category");
    return { value: String(newCat.category_id), label: newCat.category_name };
}

export async function fetchLinkedSuppliers(productId: number): Promise<number[]> {
    const res = await fetch(`/api/manufacturing/procurement/raw-materials?productId=${productId}`);
    if (!res.ok) return [];
    return res.json();
}
