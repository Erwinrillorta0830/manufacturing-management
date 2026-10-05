import { toast } from "sonner";
import type {
  LotTransfer,
  LotTransferFilter,
  LotTransferFormValues,
  // LotTransferStatus,
  LotTransferStatusHistory,
  LotTransferMovementHistory,
} from "../types";

const BASE_API = "/api/manufacturing/inventory-warehousing/adjustments/lot-transfer";

async function handleResponse<T>(res: Response, defaultError: string): Promise<T> {
  let errorMsg = defaultError;
  try {
    const json = await res.json();
    if (res.ok) {
      return json.data !== undefined ? json.data : (json as T);
    }
    errorMsg = json.error || json.message || `${defaultError} (${res.status})`;
  } catch {
    errorMsg = `${defaultError} (${res.status})`;
  }

  toast.error(errorMsg, {
    action: {
      label: "Dismiss",
      onClick: () => {},
    },
  });
  throw new Error(errorMsg);
}

export const lotTransferService = {
  /**
   * List lot transfers with filters and pagination
   */
  async listTransfers(filter: LotTransferFilter = {}): Promise<{
    data: LotTransfer[];
    totalCount: number;
  }> {
    const params = new URLSearchParams();
    if (filter.status) {
      if (Array.isArray(filter.status)) {
        params.set("status", filter.status.join(","));
      } else {
        params.set("status", filter.status);
      }
    }
    if (filter.branchId) params.set("branchId", String(filter.branchId));
    if (filter.dateFrom) params.set("dateFrom", filter.dateFrom);
    if (filter.dateTo) params.set("dateTo", filter.dateTo);
    if (filter.search) params.set("search", filter.search);
    if (filter.sourceLotId) params.set("sourceLotId", String(filter.sourceLotId));
    if (filter.targetLotId) params.set("targetLotId", String(filter.targetLotId));
    if (filter.limit) params.set("limit", String(filter.limit));
    if (filter.offset) params.set("offset", String(filter.offset));

    const res = await fetch(`${BASE_API}?${params.toString()}`, {
      cache: "no-store",
    });

    if (!res.ok) {
      let errorMsg = "Failed to load lot transfers";
      try {
        const json = await res.json();
        errorMsg = json.error || json.message || `${errorMsg} (${res.status})`;
      } catch {
        errorMsg = `${errorMsg} (${res.status})`;
      }
      toast.error(errorMsg, {
        action: {
          label: "Dismiss",
          onClick: () => {},
        },
      });
      throw new Error(errorMsg);
    }

    const json = await res.json();
    const rows: LotTransfer[] = Array.isArray(json.data)
      ? json.data
      : Array.isArray(json)
      ? json
      : [];
    const count = Number(json.totalCount ?? json.total ?? rows.length);

    return {
      data: rows,
      totalCount: count,
    };
  },

  /**
   * Fetch single lot transfer with lines and details
   */
  async getTransferById(id: number): Promise<LotTransfer> {
    const res = await fetch(`${BASE_API}/${id}`, {
      cache: "no-store",
    });

    return handleResponse<LotTransfer>(res, `Failed to load lot transfer #${id}`);
  },

  /**
   * Fetch status history for a transfer
   */
  async getStatusHistory(id: number): Promise<LotTransferStatusHistory[]> {
    const res = await fetch(`${BASE_API}/${id}/status-history`, {
      cache: "no-store",
    });

    return handleResponse<LotTransferStatusHistory[]>(res, "Failed to load status history");
  },

  /**
   * Fetch movements for a transfer
   */
  async getMovements(id: number): Promise<LotTransferMovementHistory[]> {
    const res = await fetch(`${BASE_API}/${id}/movements`, {
      cache: "no-store",
    });

    return handleResponse<LotTransferMovementHistory[]>(res, "Failed to load inventory movements");
  },

  /**
   * Create a new lot transfer
   */
  async createTransfer(
    values: LotTransferFormValues,
    status: "Draft" | "Submitted" = "Draft"
  ): Promise<LotTransfer> {
    const payload = {
      branchId: values.branchId,
      transferDate: values.transferDate,
      sourceLotId: values.sourceLotId,
      targetLotId: values.targetLotId,
      reason: values.reason,
      status,
      lines: values.lines.map((l) => ({
        productId: l.productId,
        sourceInventoryLotId: l.sourceInventoryLotId,
        sourceBatchNo: l.sourceBatchNo,
        targetBatchNo: l.targetBatchNo,
        quantity: l.quantity,
        lineRemarks: l.lineRemarks,
        sourceManufacturingDate: l.sourceManufacturingDate,
        sourceExpiryDate: l.sourceExpiryDate,
        sourceUnitCost: l.sourceUnitCost,
      })),
    };

    const res = await fetch(BASE_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = await handleResponse<LotTransfer>(res, "Failed to create lot transfer");
    toast.success(
      status === "Submitted"
        ? `Lot transfer ${result.requestNo} created and submitted!`
        : `Lot transfer ${result.requestNo} saved as draft!`
    );
    return result;
  },

  /**
   * Submit draft transfer for QA approval
   */
  async submitTransfer(id: number): Promise<LotTransfer> {
    const res = await fetch(`${BASE_API}/${id}/submit`, {
      method: "POST",
    });

    const result = await handleResponse<LotTransfer>(res, "Failed to submit lot transfer");
    toast.success(`Lot transfer ${result.requestNo} submitted for QA approval!`);
    return result;
  },

  /**
   * Approve submitted transfer
   */
  async approveTransfer(id: number, remarks?: string): Promise<LotTransfer> {
    const res = await fetch(`${BASE_API}/${id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ remarks }),
    });

    const result = await handleResponse<LotTransfer>(res, "Failed to approve lot transfer");
    toast.success(`Lot transfer ${result.requestNo} approved by QA! Ready for posting.`);
    return result;
  },

  /**
   * Reject submitted transfer
   */
  async rejectTransfer(id: number, reason: string): Promise<LotTransfer> {
    const res = await fetch(`${BASE_API}/${id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });

    const result = await handleResponse<LotTransfer>(res, "Failed to reject lot transfer");
    toast.success(`Lot transfer ${result.requestNo} rejected.`);
    return result;
  },

  /**
   * Post approved transfer to inventory
   */
  async postTransfer(id: number): Promise<LotTransfer> {
    const res = await fetch(`${BASE_API}/${id}/post`, {
      method: "POST",
    });

    const result = await handleResponse<LotTransfer>(res, "Failed to post lot transfer movements");
    toast.success(`Lot transfer ${result.requestNo} movements posted successfully!`);
    return result;
  },

  /**
   * Cancel transfer
   */
  async cancelTransfer(id: number, reason: string): Promise<LotTransfer> {
    const res = await fetch(`${BASE_API}/${id}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });

    const result = await handleResponse<LotTransfer>(res, "Failed to cancel lot transfer");
    toast.success(`Lot transfer ${result.requestNo} cancelled.`);
    return result;
  },

  /**
   * Fetch available product types (Raw Materials, Finished Goods, Packaging)
   */
  async fetchProductTypes(): Promise<import("../types").ProductTypeOption[]> {
    try {
      const res = await fetch(`${BASE_API}/product-types`, {
        cache: "no-store",
      });
      if (!res.ok) {
        return [
          { id: 388, name: "Finished Goods", typeName: "Finished Goods" },
          { id: 389, name: "Raw Materials", typeName: "Raw Materials" },
          { id: 390, name: "Packaging Items", typeName: "Packaging Items" },
        ];
      }
      const data = await res.json();
      return Array.isArray(data) ? data : data.data || [];
    } catch (err) {
      console.warn("[LotTransfer] Failed to load product types:", err);
      return [
        { id: 388, name: "Finished Goods", typeName: "Finished Goods" },
        { id: 389, name: "Raw Materials", typeName: "Raw Materials" },
        { id: 390, name: "Packaging Items", typeName: "Packaging Items" },
      ];
    }
  },
};
