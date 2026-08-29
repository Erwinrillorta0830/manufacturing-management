import React, { useState, useRef, useEffect } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Customer } from "../types";

interface PriceType {
    price_type_id: string | number;
    price_type_name: string;
}

interface QuotationHeaderFormProps {
    quoteNumber: string;
    setQuoteNumber: (val: string) => void;
    customerSearchText: string;
    selectedCustomerId: string;
    customers: Customer[];
    setCustomers?: React.Dispatch<React.SetStateAction<Customer[]>>;
    handleSearchCustomers: (search: string) => void;
    selectCustomer: (id: string, nameCode: string) => void;
    priceTypes: PriceType[];
    selectedPriceTypeId: string;
    setSelectedPriceTypeId: (val: string) => void;
    remarks: string;
    setRemarks: (val: string) => void;
    projectName: string;
    setProjectName: (val: string) => void;
    showValidationErrors?: boolean;
    selectedProjectId?: number | null;
}

export function QuotationHeaderForm({
    quoteNumber,
    setQuoteNumber,
    customerSearchText,
    selectedCustomerId,
    customers,
    setCustomers,
    handleSearchCustomers,
    selectCustomer,
    priceTypes,
    selectedPriceTypeId,
    setSelectedPriceTypeId,
    remarks,
    setRemarks,
    projectName,
    setProjectName,
    showValidationErrors = false,
    selectedProjectId
}: QuotationHeaderFormProps) {
    const [isFocused, setIsFocused] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const inputBorderClass = (val: string) => {
        if (showValidationErrors && !val.trim()) {
            return "border-rose-500 ring-1 ring-rose-500 focus:border-rose-500 focus:ring-rose-500";
        }
        return "border-slate-200 dark:border-slate-800 focus:border-primary focus:ring-primary";
    };


    // Close search dropdown on click outside for the customer selection input
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsFocused(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    // Filtered list for the Customer Client autocomplete selection
    const displayList = customers.slice(0, 10);


    return (
        <div className="space-y-5 rounded-xl border bg-card p-5 shadow-sm">
            <h4 className="text-sm font-bold text-foreground border-b pb-2">Quotation Header</h4>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Quote Number */}
                <div>
                    <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">Quote Number (Unique)</label>
                    <input
                        type="text"
                        value={quoteNumber}
                        onChange={e => setQuoteNumber(e.target.value)}
                        className={`w-full rounded border px-3 py-2 text-xs bg-background text-foreground outline-none focus:ring-1 ${inputBorderClass(quoteNumber)}`}
                    />
                </div>

                {/* Project Name / Code */}
                <div>
                    <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">Project Name / Code</label>
                    <input
                        type="text"
                        value={projectName}
                        onChange={e => setProjectName(e.target.value)}
                        placeholder="e.g. Project Vertex Alpha, Hotel Phase 1"
                        disabled={!!selectedProjectId}
                        className={`w-full rounded border px-3 py-2 text-xs bg-background text-foreground outline-none focus:ring-1 ${inputBorderClass(projectName)} disabled:opacity-80 disabled:bg-muted/40`}
                    />
                </div>

                {/* Customer Selection Search dropdown */}
                <div className="relative" ref={containerRef}>
                    <div className="flex justify-between items-center mb-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase block">Customer Client</label>
                    </div>
                    
                    <div className="relative">
                        <input
                            type="text"
                            placeholder="Type to search active customers..."
                            value={customerSearchText}
                            disabled={!!selectedProjectId}
                            onFocus={() => {
                                // Ensure that if there's no selected value, we open it
                                setIsFocused(true);
                                if (customers.length === 0) {
                                    handleSearchCustomers("");
                                }
                            }}
                            onChange={(e) => {
                                setIsFocused(true);
                                handleSearchCustomers(e.target.value);
                            }}
                            className={`w-full rounded border pl-3 pr-8 py-2 text-xs bg-background text-foreground outline-none focus:ring-1 ${inputBorderClass(selectedCustomerId)} disabled:opacity-80 disabled:bg-muted/40`}
                        />
                        {selectedCustomerId && !selectedProjectId && (
                            <button
                                type="button"
                                onClick={() => {
                                    selectCustomer("", "");
                                    handleSearchCustomers("");
                                }}
                                className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        )}
                        
                        {/* Dropdown list */}
                        {isFocused && !selectedCustomerId && (
                            <div className="absolute left-0 right-0 top-full mt-1 max-h-[200px] overflow-y-auto border bg-card rounded-md shadow-lg z-50 divide-y">
                                {displayList.map((c) => (
                                    <button
                                        key={c.id}
                                        type="button"
                                        onClick={() => {
                                            selectCustomer(String(c.id), `${c.customer_name} (${c.customer_code})`);
                                            setIsFocused(false);
                                        }}
                                        className="w-full text-left px-3 py-2 text-xs hover:bg-muted transition-colors font-medium text-foreground block"
                                    >
                                        {c.customer_name} ({c.customer_code})
                                    </button>
                                ))}
                                {displayList.length === 0 && (
                                    <div className="px-3 py-2 text-xs text-muted-foreground text-center">
                                        No active customers found.
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Price Type selection */}
                <div>
                    <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">Base Price Type Template</label>
                    <select
                        value={selectedPriceTypeId}
                        onChange={e => setSelectedPriceTypeId(e.target.value)}
                        className={`w-full rounded border px-3 py-2 text-xs bg-background text-foreground outline-none focus:ring-1 ${inputBorderClass(selectedPriceTypeId)}`}
                    >
                        <option value="">-- No Price Type Template --</option>
                        {priceTypes.map(pt => (
                            <option key={pt.price_type_id} value={pt.price_type_id}>
                                Price Type {pt.price_type_name}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Notes/Remarks */}
                <div className="md:col-span-2">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">Notes / Remarks</label>
                    <textarea
                        rows={2}
                        value={remarks}
                        onChange={e => setRemarks(e.target.value)}
                        placeholder="Add special instructions, terms, or customer agreement details here..."
                        className="w-full rounded border px-3 py-2 text-xs bg-background text-foreground outline-none focus:ring-1 focus:ring-primary"
                    />
                </div>
            </div>
        </div>
    );
}
