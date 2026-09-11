import type { ReactNode } from "react";
import MmPageShell from "../_components/mm-page-shell";

export default function WarehouseReceivingPageShell({ children }: { children: ReactNode }) {
    return (
        <MmPageShell
            crumbs={[
                { label: "Manufacturing", visibility: "md" },
                { label: "Procurement & Inbound", href: "/mm/incoming-shipments", visibility: "sm" },
                { label: "Warehouse Receiving" }
            ]}
        >
            {children}
        </MmPageShell>
    );
}
