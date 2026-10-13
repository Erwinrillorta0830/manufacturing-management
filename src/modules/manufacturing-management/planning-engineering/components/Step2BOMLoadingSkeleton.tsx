import { Skeleton } from "@/components/ui/skeleton";

export function Step2BOMLoadingSkeleton() {
    return (
        <div aria-busy="true" className="space-y-4">
            <p role="status" className="text-center text-xs font-medium text-muted-foreground">
                Analyzing BOM and routes...
            </p>

            <div aria-hidden="true" className="space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {Array.from({ length: 3 }).map((_, index) => (
                        <div key={`summary-${index}`} className="space-y-3 rounded-xl border border-border p-3">
                            <Skeleton className="h-3 w-2/3" />
                            <Skeleton className="h-6 w-1/3" />
                            <Skeleton className="h-3 w-1/2" />
                        </div>
                    ))}
                </div>

                <Skeleton className="h-24 w-full rounded-xl" />
                <Skeleton className="h-28 w-full rounded-xl" />

                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <Skeleton className="h-4 w-52" />
                        <Skeleton className="h-6 w-28 rounded-full" />
                    </div>
                    <div className="overflow-hidden rounded-xl border border-border">
                        <table className="w-full text-left text-[11px]">
                            <thead>
                                <tr className="border-b border-border bg-muted">
                                    <th className="w-8 p-2.5" />
                                    <th className="p-2.5">Raw Material / Component</th>
                                    <th className="p-2.5 text-center">Planned / Demand</th>
                                    <th className="p-2.5 text-center">Net Unreserved Stock</th>
                                    <th className="p-2.5 text-center">Shortfall</th>
                                    <th className="p-2.5 text-right">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {Array.from({ length: 5 }).map((_, rowIndex) => (
                                    <tr key={`material-${rowIndex}`} className="border-b border-border last:border-0">
                                        <td className="p-2.5"><Skeleton className="mx-auto h-4 w-4" /></td>
                                        <td className="p-2.5"><Skeleton className="h-4 w-4/5" /></td>
                                        <td className="p-2.5"><Skeleton className="mx-auto h-4 w-16" /></td>
                                        <td className="p-2.5"><Skeleton className="mx-auto h-4 w-20" /></td>
                                        <td className="p-2.5"><Skeleton className="mx-auto h-4 w-14" /></td>
                                        <td className="p-2.5"><Skeleton className="ml-auto h-5 w-20 rounded-full" /></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
