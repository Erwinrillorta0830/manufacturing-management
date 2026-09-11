import type { ReactNode } from "react";
import MmPageShell from "../_components/mm-page-shell";

export default function QAReceivingPageShell({
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
                    { label: "Quality Assurance (QA) Receiving", href: "/mm/qa-receiving", visibility: "sm" },
                    { label: detailLabel, pageClassName: "max-w-[56vw] truncate sm:max-w-[60vw] md:max-w-none" }
                ]
                : [
                    { label: "Manufacturing", visibility: "md" },
                    { label: "Quality Assurance (QA) Receiving" }
                ]}
        >
            {children}
        </MmPageShell>
    );
}
