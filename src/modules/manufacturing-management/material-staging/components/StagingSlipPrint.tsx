"use client";

import { StagingJobOrder } from "../types";
import { displayJobOrderStatus } from "../../job-order-status";
import { stagingStateInfo } from "../../shared/job-order-journey";

/**
 * Printable staging slip. Rendered with `hidden print:block` while the
 * interactive workspace carries `print:hidden`, so "Print Staging Slip"
 * produces only this sheet.
 */
export function StagingSlipPrint({ jobOrder }: { jobOrder: StagingJobOrder | null }) {
    if (!jobOrder) return null;

    return (
        <div className="hidden print:block bg-white p-6 text-black">
            <div className="mb-4 border-b-2 border-black pb-2">
                <h1 className="text-xl font-black uppercase">Material Staging Slip</h1>
                <p className="text-xs">Manufacturing Management — Shop Floor Staging</p>
            </div>

            <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs mb-4">
                <div>
                    <span className="font-bold">Job Order:</span>{" "}
                    <span className="font-mono">{jobOrder.job_order_no}</span>
                </div>
                <div>
                    <span className="font-bold">Status:</span> {displayJobOrderStatus(jobOrder.status)}
                </div>
                <div>
                    <span className="font-bold">Product:</span> {jobOrder.product_name}
                </div>
                <div>
                    <span className="font-bold">Target Qty:</span> {jobOrder.target_quantity.toLocaleString()}
                </div>
                <div>
                    <span className="font-bold">Branch:</span> {jobOrder.branch_name}
                </div>
                <div>
                    <span className="font-bold">Work Center:</span> {jobOrder.primary_work_center_name}
                </div>
                <div>
                    <span className="font-bold">Target Bin:</span>{" "}
                    <span className="font-mono">{jobOrder.suggested_staging_bin || "No active destination"}</span>
                </div>
                <div>
                    <span className="font-bold">Shift:</span> {jobOrder.shift_option || "Shift 1"}
                </div>
                <div>
                    <span className="font-bold">Staging Progress:</span> {jobOrder.staging_percentage}% (
                    {jobOrder.staged_materials_count}/{jobOrder.total_materials_count} components)
                </div>
                <div>
                    <span className="font-bold">Printed:</span> {new Date().toLocaleString()}
                </div>
            </div>

            <table className="w-full border-collapse text-[11px]">
                <thead>
                    <tr className="border-b border-black text-left">
                        <th className="py-1">Component</th>
                        <th className="py-1 text-right">Required</th>
                        <th className="py-1 text-right">Staged</th>
                        <th className="py-1 text-right">Remaining</th>
                        <th className="py-1">Bin</th>
                        <th className="py-1">Reservation</th>
                        <th className="py-1">Lot / Batch</th>
                    </tr>
                </thead>
                <tbody>
                    {jobOrder.materials.map((material) => (
                        <tr key={material.jo_material_id} className="border-b border-gray-300 align-top">
                            <td className="py-1 font-semibold">
                                {material.product_name}
                                <br />
                                <span className="font-mono text-[9px]">{material.product_code}</span>
                            </td>
                            <td className="py-1 text-right font-mono">
                                {material.required_quantity} {material.uom}
                            </td>
                            <td className="py-1 text-right font-mono">
                                {material.staged_quantity} {material.uom}
                            </td>
                            <td className="py-1 text-right font-mono">
                                {Math.max(0, material.required_quantity - material.staged_quantity)} {material.uom}
                            </td>
                            <td className="py-1 font-mono">{material.staging_bin}</td>
                            <td className="py-1">
                                {stagingStateInfo(material.reservation_status)?.label || material.reservation_status}
                            </td>
                            <td className="py-1 font-mono">
                                {material.allocations.map((allocation) => allocation.batch_no).join(", ") || "—"}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <div className="mt-12 flex justify-between text-[11px]">
                <div>Picked / Staged By: ____________________</div>
                <div>Verified By: ____________________</div>
                <div>Received on Floor By: ____________________</div>
            </div>
        </div>
    );
}
