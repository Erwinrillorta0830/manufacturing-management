import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const sourceRoot = fileURLToPath(new URL("../../../../", import.meta.url));
registerHooks({
    resolve(specifier, context, nextResolve) {
        if (specifier === "../finished-goods/versions/versions-helper") {
            return {
                url: "data:text/javascript,export%20function%20selectPreferredActiveVersion()%20%7B%20return%20null%3B%20%7D",
                shortCircuit: true
            };
        }
        const isAlias = specifier.startsWith("@/");
        const isExtensionlessRelative = specifier.startsWith(".") && !/\.(?:mjs|cjs|js|tsx?|jsx?)$/.test(specifier);
        if (!isAlias && !isExtensionlessRelative) return nextResolve(specifier, context);

        const basePath = isAlias
            ? path.resolve(sourceRoot, specifier.slice(2))
            : fileURLToPath(new URL(specifier, context.parentURL));
        const target = [basePath, ...[".ts", ".tsx", ".js", ".jsx"].map((extension) => `${basePath}${extension}`)]
            .find((candidate) => existsSync(candidate));
        return nextResolve(pathToFileURL(target || basePath).href, context);
    }
});

const { findLinkedJobOrders } = await import("./_read.ts");

const rowsByCollection = {
    manufacturing_job_order_allocations: [
        { sales_order_detail_id: 900, job_order_id: 101, allocated_quantity: 30, status: "ACTIVE" },
        { sales_order_detail_id: 900, job_order_id: 101, allocated_quantity: 20, status: "ACTIVE" },
        { sales_order_detail_id: 900, job_order_id: 102, allocated_quantity: 25, status: "Cancelled" },
        { sales_order_detail_id: 900, job_order_id: 103, allocated_quantity: 99, status: "ACTIVE" }
    ],
    manufacturing_job_orders: [
        { job_order_id: 101, job_order_no: "JO-412600", status: "In Production" },
        { job_order_id: 102, job_order_no: "JO-412619", status: "Cancelled" },
        { job_order_id: 103, job_order_no: "JO-412620", status: "Cancelled" }
    ],
    manufacturing_job_order_status_history: [
        { job_order_id: 102, workflow_action: "terminate-production", new_status: "Cancelled" }
    ],
    manufacturing_job_order_yield_ledger: [
        { ledger_id: 1001, job_order_id: 101, yield_quantity: 40, rejected_quantity: 5, scrap_quantity: 2 },
        { ledger_id: 1002, job_order_id: 101, yield_quantity: 7, rejected_quantity: 3, scrap_quantity: 0 },
        { ledger_id: 2001, job_order_id: 102, yield_quantity: 20, rejected_quantity: 10, scrap_quantity: 5 },
        { ledger_id: 3001, job_order_id: 103, yield_quantity: 80, rejected_quantity: 0, scrap_quantity: 0 }
    ],
    manufacturing_job_order_routes: [
        { jo_route_id: 201, job_order_id: 101 },
        { jo_route_id: 202, job_order_id: 102 },
        { jo_route_id: 203, job_order_id: 103 }
    ],
    manufacturing_daily_qa_inspections: [
        { job_order_id: 101, ledger_id: 1001, jo_route_id: 201, sensory_status: "Passed", lab_status: "Passed", action_taken: "Released" },
        { job_order_id: 102, ledger_id: 2001, jo_route_id: 202, sensory_status: "Passed", lab_status: "Passed", action_taken: "Released" },
        { job_order_id: 103, ledger_id: 3001, jo_route_id: 203, sensory_status: "Passed", lab_status: "Passed", action_taken: "Released" }
    ]
};

const read = async (collection, params) => {
    const rows = rowsByCollection[collection] || [];
    const filteredJobOrderIds = params.get("filter[job_order_id][_in]")
        ?.split(",")
        .map(Number);
    return {
        data: filteredJobOrderIds
            ? rows.filter((row) => filteredJobOrderIds.includes(Number(row.job_order_id)))
            : rows
    };
};

const linkedByDetail = await findLinkedJobOrders(read, [{ detail_id: 900 }]);
assert.deepEqual(linkedByDetail.get(900), [
    {
        jobOrderId: 101,
        jobOrderNo: "JO-412600",
        status: "In Production",
        allocatedQuantity: 50,
        producedQuantity: 45,
        isTerminated: false
    },
    {
        jobOrderId: 102,
        jobOrderNo: "JO-412619",
        status: "Cancelled",
        allocatedQuantity: 25,
        producedQuantity: 30,
        isTerminated: true
    }
]);

console.log("Linked Job Order production summaries passed.");
