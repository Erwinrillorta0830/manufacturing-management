'use server';

import { fetchItems } from '../services/api';
import { UserRow } from './hooks/use-stock-transfer-summary';

export interface UnitRow {
  unit_id: number;
  unit_name: string;
  unit_shortcut: string;
}

/**
 * Server action to fetch users for the summary module.
 */
export async function getSummaryUsers(): Promise<UserRow[]> {
  try {
    const res = await fetchItems<UserRow>("items/user", {
      limit: -1,
      fields: ["user_id", "user_fname", "user_mname", "user_lname"].join(","),
    });
    return res.data || [];
  } catch (err) {
    console.error('[Summary Action] Failed to fetch users:', err);
    return [];
  }
}

/**
 * Server action to fetch units for the summary module.
 */
export async function getSummaryUnits(): Promise<UnitRow[]> {
  try {
    const res = await fetchItems<UnitRow>("items/units", {
      limit: -1,
      fields: ["unit_id", "unit_name", "unit_shortcut"].join(","),
    });
    return res.data || [];
  } catch (err) {
    console.error('[Summary Action] Failed to fetch units:', err);
    return [];
  }
}

export interface SummaryAttachment {
  id: number;
  stock_transfer_id: number;
  file_id: string;
  file_name: string;
  file_size?: number;
  file_type?: string;
  created_by?: number | null;
  date_created?: string | null;
}

/**
 * Server action to fetch attachments for the summary module.
 */
export async function getSummaryAttachments(transferIds: number[]): Promise<SummaryAttachment[]> {
  if (!transferIds || transferIds.length === 0) return [];
  try {
    // 1. Fetch rows from mm_stock_transfer_attachment
    let rows: Record<string, any>[] = [];
    try {
      const res = await fetchItems<Record<string, any>>("items/mm_stock_transfer_attachment", {
        "filter[stock_transfer_id][_in]": transferIds.join(","),
        fields: "id,stock_transfer_id,directus_file_id,created_by,created_at",
        limit: -1,
      });
      rows = res.data || [];
    } catch (fetchErr) {
      // Fallback query in case of field restrictions
      console.warn('[Summary Action] Direct field query fallback:', fetchErr);
      const fallbackRes = await fetchItems<Record<string, any>>("items/mm_stock_transfer_attachment", {
        "filter[stock_transfer_id][_in]": transferIds.join(","),
        limit: -1,
      });
      rows = fallbackRes.data || [];
    }

    if (rows.length === 0) return [];

    // 2. Collect unique Directus file IDs
    const fileIds = Array.from(
      new Set(
        rows
          .map((r) => {
            const raw = typeof r.directus_file_id === "object" && r.directus_file_id !== null
              ? r.directus_file_id.id
              : r.directus_file_id;
            return String(raw || "").trim();
          })
          .filter(Boolean)
      )
    );

    // 3. Fetch file metadata from /files endpoint
    const fileMetaMap = new Map<string, { id: string; filename_download?: string; filesize?: number; type?: string; title?: string }>();
    if (fileIds.length > 0) {
      try {
        const filesRes = await fetchItems<{ id: string; filename_download?: string; filesize?: number; type?: string; title?: string }>("files", {
          "filter[id][_in]": fileIds.join(","),
          fields: "id,filename_download,filesize,type,title",
          limit: -1,
        });
        if (filesRes.data) {
          filesRes.data.forEach((f) => fileMetaMap.set(f.id, f));
        }
      } catch (fileErr) {
        console.warn('[Summary Action] Could not fetch file metadata from /files:', fileErr);
      }
    }

    // 4. Map rows to SummaryAttachment
    return rows.map((r: Record<string, any>) => {
      const fileId = typeof r.directus_file_id === "object" && r.directus_file_id !== null
        ? String(r.directus_file_id.id || "")
        : String(r.directus_file_id || "");
      const meta = fileMetaMap.get(fileId);
      const fileName = meta?.filename_download || meta?.title || (fileId ? `Deposit_Receipt_${fileId.slice(0, 8)}` : `Attachment_${r.id}`);

      return {
        id: Number(r.id),
        stock_transfer_id: Number(r.stock_transfer_id),
        file_id: fileId,
        file_name: fileName,
        file_size: meta?.filesize ? Number(meta.filesize) : undefined,
        file_type: meta?.type || undefined,
        created_by: r.created_by ? Number(r.created_by) : null,
        date_created: r.created_at || r.date_created || null,
      };
    });
  } catch (err) {
    console.error('[Summary Action] Failed to fetch attachments:', err);
    return [];
  }
}
