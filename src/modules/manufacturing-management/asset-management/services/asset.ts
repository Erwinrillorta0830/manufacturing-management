import {
  AssetTableData,
  Department,
  ItemClassification,
  ItemType,
  User,
} from "../types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

const AUTH_HEADERS = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${process.env.DIRECTUS_STATIC_TOKEN}`,
};

/**
 * Helper to ensure a reference (like item_type or item_classification) exists.
 * If not, it creates it and returns the ID.
 */
async function ensureReferenceExists(
  collection: string,
  fieldName: string,
  value: string | number,
) {
  if (!value) return null;

  // If it's already a number, assume it's an ID
  if (
    typeof value === "number" ||
    (!isNaN(Number(value)) && typeof value !== "string")
  ) {
    return Number(value);
  }

  const searchRes = await fetch(
    `${API_BASE_URL}/items/${collection}?filter[${fieldName}][_eq]=${encodeURIComponent(value.toString())}`,
    { headers: AUTH_HEADERS },
  );
  const searchJson = await searchRes.json();

  if (searchJson.data && searchJson.data.length > 0) {
    return searchJson.data[0].id;
  }

  const createRes = await fetch(`${API_BASE_URL}/items/${collection}`, {
    method: "POST",
    headers: AUTH_HEADERS,
    body: JSON.stringify({ [fieldName]: value }),
  });

  const createJson = await createRes.json();
  if (!createRes.ok) {
    throw new Error(
      `Failed to create new ${collection}: ${createJson.errors?.[0]?.message}`,
    );
  }

  return createJson.data.id;
}

/**
 * Fetch all assets with merged data from related tables
 */
export async function fetchAssets(): Promise<AssetTableData[]> {
  const [assetsRes, itemsRes, deptsRes, usersRes, tRes, cRes] =
    await Promise.all([
      fetch(`${API_BASE_URL}/items/assets_and_equipment?limit=-1&sort=-id`, {
        headers: AUTH_HEADERS,
        cache: "no-store",
      }),
      fetch(
        `${API_BASE_URL}/items/items?fields=id,item_name,item_type,item_classification&limit=-1`,
        { headers: AUTH_HEADERS },
      ),
      fetch(`${API_BASE_URL}/items/department?limit=-1`, {
        headers: AUTH_HEADERS,
      }),
      fetch(`${API_BASE_URL}/items/user?limit=-1`, { headers: AUTH_HEADERS }),
      fetch(`${API_BASE_URL}/items/item_type?limit=-1`, {
        headers: AUTH_HEADERS,
      }),
      fetch(`${API_BASE_URL}/items/item_classification?limit=-1`, {
        headers: AUTH_HEADERS,
      }),
    ]);

  if (
    !assetsRes.ok ||
    !itemsRes.ok ||
    !deptsRes.ok ||
    !usersRes.ok ||
    !tRes.ok ||
    !cRes.ok
  ) {
    throw new Error("Failed to fetch data from Directus");
  }

  const assetsJson = await assetsRes.json();
  const itemsJson = await itemsRes.json();
  const deptsJson = await deptsRes.json();
  const usersJson = await usersRes.json();
  const typeJson = await tRes.json();
  const classJson = await cRes.json();

  const itemsMap = new Map(
    (itemsJson.data || []).map((i: Record<string, unknown>) => [
      Number(i.id),
      i,
    ]),
  );
  const deptsMap = new Map(
    (deptsJson.data || []).map((d: Record<string, unknown>) => [
      Number(d.department_id),
      d.department_name,
    ]),
  );
  const usersMap = new Map(
    (usersJson.data || []).map((u: Record<string, unknown>) => [
      Number(u.user_id),
      `${u.user_fname} ${u.user_lname}`.trim(),
    ]),
  );
  const typesMap = new Map(
    (typeJson.data || []).map((t: Record<string, unknown>) => [
      Number(t.id),
      t.type_name,
    ]),
  );
  const classMap = new Map(
    (classJson.data || []).map((c: Record<string, unknown>) => [
      Number(c.id),
      c.classification_name,
    ]),
  );

  return (assetsJson.data || []).map((asset: Record<string, unknown>) => {
    const baseItem = itemsMap.get(Number(asset.item_id)) as Record<
      string,
      unknown
    >;
    return {
      ...asset,
      item_name: baseItem?.item_name ?? "N/A",
      item_type_name: typesMap.get(Number(baseItem?.item_type)) ?? "N/A",
      classification_name:
        classMap.get(Number(baseItem?.item_classification)) ?? "N/A",
      department_name: deptsMap.get(Number(asset.department)) ?? "Unassigned",
      assigned_to_name: usersMap.get(Number(asset.employee)) ?? "Unassigned",
      item_image: asset.item_image,
      serial: asset.serial,
      is_active_warning: asset.is_active_warning,
    };
  });
}

/**
 * Fetch Departments
 */
export async function fetchDepartments(): Promise<Department[]> {
  const res = await fetch(`${API_BASE_URL}/items/department?limit=-1`, {
    headers: AUTH_HEADERS,
  });
  const json = await res.json();
  return json.data || [];
}

/**
 * Fetch Users
 */
export async function fetchUsers(): Promise<User[]> {
  const res = await fetch(`${API_BASE_URL}/items/user?limit=-1`, {
    headers: AUTH_HEADERS,
  });
  const json = await res.json();
  return json.data || [];
}

/**
 * Fetch Item Types
 */
export async function fetchItemTypes(): Promise<ItemType[]> {
  const res = await fetch(`${API_BASE_URL}/items/item_type?limit=-1`, {
    headers: AUTH_HEADERS,
  });
  const json = await res.json();
  return json.data || [];
}

/**
 * Fetch Item Classifications
 */
export async function fetchItemClassifications(): Promise<
  ItemClassification[]
> {
  const res = await fetch(
    `${API_BASE_URL}/items/item_classification?limit=-1`,
    {
      headers: AUTH_HEADERS,
    },
  );
  const json = await res.json();
  return json.data || [];
}

/**
 * Fetch unique items with their type and classification names
 */
export async function fetchItems(): Promise<Record<string, unknown>[]> {
  const [itemsRes] = await Promise.all([
    fetch(
      `${API_BASE_URL}/items/items?fields=*,item_type.type_name,item_classification.classification_name&limit=-1`,
      {
        headers: AUTH_HEADERS,
        cache: "no-store",
      },
    ),
    fetch(`${API_BASE_URL}/items/item_type?limit=-1`, {
      headers: AUTH_HEADERS,
    }),
    fetch(`${API_BASE_URL}/items/item_classification?limit=-1`, {
      headers: AUTH_HEADERS,
    }),
  ]);

  if (!itemsRes.ok) throw new Error("Failed to fetch items");

  const itemsJson = await itemsRes.json();
  return itemsJson.data || [];
}

/**
 * Create a new asset
 */
export async function createAsset(body: Record<string, unknown>) {
  // 1. Check if an item with this name already exists to prevent duplicates
  const itemName = body.item_name as string;
  const existingItemRes = await fetch(
    `${API_BASE_URL}/items/items?filter[item_name][_eq]=${encodeURIComponent(itemName)}&fields=id,item_type,item_classification`,
    { headers: AUTH_HEADERS },
  );
  const existingItemJson = await existingItemRes.json();

  let itemId;

  if (existingItemJson.data && existingItemJson.data.length > 0) {
    // Reuse existing item
    itemId = existingItemJson.data[0].id;
  } else {
    // Create new baseline item
    const typeId = await ensureReferenceExists(
      "item_type",
      "type_name",
      body.item_type as string | number,
    );
    const classId = await ensureReferenceExists(
      "item_classification",
      "classification_name",
      body.item_classification as string | number,
    );

    const itemRes = await fetch(`${API_BASE_URL}/items/items`, {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify({
        item_name: body.item_name,
        item_type: typeId,
        item_classification: classId,
      }),
    });

    const itemData = await itemRes.json();
    if (!itemRes.ok)
      throw new Error(itemData.errors?.[0]?.message || "Failed to create item");

    itemId = itemData.data.id;
  }

  // 2. Format Date
  let dateStr: string;
  const dateInput = body.date_acquired;
  if (!dateInput) {
    dateStr = new Date().toISOString().split("T")[0];
  } else {
    try {
      const parsedDate = new Date(dateInput as string | number | Date);
      dateStr = isNaN(parsedDate.getTime())
        ? new Date().toISOString().split("T")[0]
        : parsedDate.toISOString().split("T")[0];
    } catch {
      dateStr = new Date().toISOString().split("T")[0];
    }
  }

  // 3. Create Asset Record
  const assetPayload = {
    item_id: itemId,
    condition: body.condition || "Good",
    cost_per_item: Number(body.cost_per_item) || 0,
    quantity: Number(body.quantity) || 1,
    total: Number(body.cost_per_item || 0) * Number(body.quantity || 1),
    life_span: Number(body.life_span) || 12,
    date_acquired: dateStr,
    department: Number(body.department),
    employee: body.employee ? Number(body.employee) : null,
    barcode: body.barcode || null,
    rfid_code: body.rfid_code || null,
    serial: body.serial || null,
    is_active_warning: Number(body.is_active_warning) || 0,
    encoder: body.encoder || 133,
    item_image: body.item_image || null,
  };

  const assetRes = await fetch(`${API_BASE_URL}/items/assets_and_equipment`, {
    method: "POST",
    headers: AUTH_HEADERS,
    body: JSON.stringify(assetPayload),
  });

  const assetData = await assetRes.json();
  if (!assetRes.ok)
    throw new Error(assetData.errors?.[0]?.message || "Failed to create asset");

  return assetData.data;
}

/**
 * Update an existing asset
 */
export async function updateAsset(body: Record<string, unknown>) {
  const { id, item_id, ...updateData } = body;

  if (!id || !item_id)
    throw new Error("Asset ID and Item ID are required for updates");

  // 1. Update References & Base Item
  const typeId = await ensureReferenceExists(
    "item_type",
    "type_name",
    (updateData.item_type_name || updateData.item_type) as string | number,
  );
  const classId = await ensureReferenceExists(
    "item_classification",
    "classification_name",
    (updateData.classification_name || updateData.item_classification) as
      | string
      | number,
  );

  const itemUpdateRes = await fetch(`${API_BASE_URL}/items/items/${item_id}`, {
    method: "PATCH",
    headers: AUTH_HEADERS,
    body: JSON.stringify({
      item_name: updateData.item_name,
      item_type: typeId,
      item_classification: classId,
    }),
  });

  if (!itemUpdateRes.ok) throw new Error("Failed to update base item details");

  // 2. Update Asset Record
  const assetPayload = {
    condition: updateData.condition,
    cost_per_item: Number(updateData.cost_per_item),
    quantity: Number(updateData.quantity),
    total: Number(updateData.cost_per_item) * Number(updateData.quantity),
    life_span: Number(updateData.life_span),
    date_acquired: (updateData.date_acquired as string | undefined)?.split(
      "T",
    )[0],
    department: Number(updateData.department),
    employee: updateData.employee ? Number(updateData.employee) : null,
    item_image: updateData.item_image,
    barcode: updateData.barcode,
    rfid_code: updateData.rfid_code,
    serial: updateData.serial,
    is_active_warning: Number(updateData.is_active_warning),
  };

  const assetUpdateRes = await fetch(
    `${API_BASE_URL}/items/assets_and_equipment/${id}`,
    {
      method: "PATCH",
      headers: AUTH_HEADERS,
      body: JSON.stringify(assetPayload),
    },
  );

  const assetResult = await assetUpdateRes.json();
  if (!assetUpdateRes.ok)
    throw new Error(
      assetResult.errors?.[0]?.message ||
        "Failed to update asset equipment record",
    );

  return assetResult.data;
}
