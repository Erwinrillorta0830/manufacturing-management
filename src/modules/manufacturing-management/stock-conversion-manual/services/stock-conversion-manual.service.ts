import { stockConversionService } from "../../stock-conversion/services/stock-conversion.service";
import type { StockConversionPayload } from "../types/stock-conversion-manual.types";
import { AppError } from "../../stock-conversion/utils/error-handler";

/**
 * Service to handle manual (Non-RFID) stock conversion business logic.
 * Supports multi-lot and multi-batch allocations for both source (OUT) and target (IN) inventory movements,
 * recording each allocated batch as its own separate stock adjustment row.
 */
export const stockConversionManualService = {
  async executeConversion(payload: StockConversionPayload) {
    try {
      return await stockConversionService.executeConversion({
        ...payload,
        rfidTags: [],
        sourceRfidTags: [],
      });
    } catch (error: unknown) {
      if (error instanceof AppError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : "Unknown error during manual conversion";
      throw new AppError("CONVERT_ERROR", `Manual conversion failed: ${message}`, 500);
    }
  }
};
