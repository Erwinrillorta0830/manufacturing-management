import type { ReactNode } from "react";
import MmPageShell from "../_components/mm-page-shell";

export default function IncomingShipmentsPageShell({
    children,
    detailLabel
}: {
    children: ReactNode;
    detailLabel?: string;
}) {
    return (
        <MmPageShell
            crumbs={detailLabel
                ? [
                    { label: "Manufacturing", visibility: "md" },
                    { label: "Procurement & Inbound", href: "/mm/incoming-shipments", visibility: "sm" },
                    { label: detailLabel, pageClassName: "max-w-[56vw] truncate sm:max-w-[60vw] md:max-w-none" }
                ]
                : [
                    { label: "Manufacturing", visibility: "md" },
                    { label: "Incoming Purchase Shipments" }
                ]}
        >
            {children}
        </MmPageShell>
    );
}
