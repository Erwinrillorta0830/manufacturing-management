import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers as baseHeaders } from "@/app/api/manufacturing/directus-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface ProductTypeRecord {
  id: number;
  name: string;
  typeName?: string;
  description?: string;
}

const STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN;
const HEADERS: Record<string, string> = {
  ...baseHeaders,
  ...(STATIC_TOKEN ? { Authorization: `Bearer ${STATIC_TOKEN}` } : {}),
};

const DEFAULT_PRODUCT_TYPES: ProductTypeRecord[] = [
  { id: 388, name: "Finished Goods", typeName: "Finished Goods", description: "Completed manufactured goods (FEFO)" },
  { id: 389, name: "Raw Materials", typeName: "Raw Materials", description: "Perishable ingredients & materials (FEFO)" },
  { id: 390, name: "Packaging Items", typeName: "Packaging Items", description: "Packaging containers & materials (FIFO)" },
];

export async function GET() {
  try {
    const url = `${DIRECTUS_URL?.replace(/\/$/, "")}/items/product_type?limit=-1&sort=id`;
    const res = await fetch(url, {
      headers: HEADERS,
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json(DEFAULT_PRODUCT_TYPES);
    }

    const json = await res.json();
    const rawList = json.data || [];

    if (!Array.isArray(rawList) || rawList.length === 0) {
      return NextResponse.json(DEFAULT_PRODUCT_TYPES);
    }

    const list: ProductTypeRecord[] = rawList.map((item: Record<string, unknown>) => ({
      id: Number(item.id),
      name: String(item.name || item.type_name || `Type #${item.id}`),
      typeName: String(item.type_name || item.name || ""),
      description: String(item.description || ""),
    }));

    return NextResponse.json(list);
  } catch (error) {
    console.warn("[LotTransfer ProductTypes API] Fallback to standard product types:", error);
    return NextResponse.json(DEFAULT_PRODUCT_TYPES);
  }
}
