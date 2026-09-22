"use client";

import React, { useState, useMemo } from "react";
import { Check, ChevronsUpDown, X, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface Operator {
    user_id?: number;
    id?: number;
    user_fname?: string;
    first_name?: string;
    user_lname?: string;
    last_name?: string;
    user_position?: string;
    role?: string;
}

interface OperatorSelectProps {
    operators: Operator[];
    assignedIds: number[];
    onToggleOperator: (opId: number) => void;
    placeholder?: string;
}

export function OperatorSelect({
    operators,
    assignedIds,
    onToggleOperator,
    placeholder = "Assign operators...",
}: OperatorSelectProps) {
    const [open, setOpen] = useState(false);

    // The dropdown list is portaled outside modal dialogs, so the dialog's
    // scroll lock would cancel wheel events on it. Stopping propagation with
    // a native target-phase listener keeps native list scrolling intact.
    const guardListWheel = React.useCallback((node: HTMLDivElement | null) => {
        if (!node) return undefined;
        const stopWheelPropagation = (event: WheelEvent) => event.stopPropagation();
        node.addEventListener("wheel", stopWheelPropagation);
        return () => node.removeEventListener("wheel", stopWheelPropagation);
    }, []);

    // Map operator IDs to their full operator details
    const assignedOperators = useMemo(() => {
        return operators.filter((op) => {
            const opId = Number(op.user_id || op.id);
            return assignedIds.includes(opId);
        });
    }, [operators, assignedIds]);

    return (
        <div className="space-y-2">
            <div className="flex flex-wrap gap-2 items-center">
                <Popover modal={false} open={open} onOpenChange={setOpen}>
                    <PopoverTrigger asChild>
                        <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={open}
                            size="sm"
                            className="h-9 justify-between text-xs border-input hover:bg-accent text-foreground w-[220px]"
                        >
                            <div className="flex items-center gap-2">
                                <UserPlus className="h-3.5 w-3.5 text-muted-foreground" />
                                <span>{placeholder}</span>
                            </div>
                            <div className="flex items-center gap-1">
                                {assignedIds.length > 0 && (
                                    <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-bold bg-primary/10 text-primary border-primary/20">
                                        {assignedIds.length}
                                    </Badge>
                                )}
                                <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
                            </div>
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[300px] p-0" align="start">
                        <Command>
                            <CommandInput placeholder="Search operators..." className="h-9 text-xs" />
                            <CommandList ref={guardListWheel} className="max-h-[220px]">
                                <CommandEmpty className="text-xs py-3 text-center text-muted-foreground">No operators found.</CommandEmpty>
                                <CommandGroup>
                                    {operators.map((op) => {
                                        const opId = Number(op.user_id || op.id);
                                        const isSelected = assignedIds.includes(opId);
                                        const fullName = `${op.user_fname || op.first_name || ""} ${op.user_lname || op.last_name || ""}`.trim() || `Operator #${opId}`;
                                        const position = op.user_position || op.role || "Operator";
                                        const initials = `${op.user_fname?.[0] || ""}${op.user_lname?.[0] || ""}`.toUpperCase();

                                        return (
                                            <CommandItem
                                                key={opId}
                                                value={fullName}
                                                onSelect={() => onToggleOperator(opId)}
                                                className="flex items-center justify-between py-2 px-2.5 cursor-pointer text-xs"
                                            >
                                                <div className="flex items-center gap-2.5 min-w-0">
                                                    <div className={cn(
                                                        "h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-black shrink-0",
                                                        isSelected ? "bg-primary text-white" : "bg-muted text-muted-foreground"
                                                    )}>
                                                        {initials || "OP"}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="font-semibold text-foreground truncate">{fullName}</div>
                                                        <div className="text-[9px] text-muted-foreground truncate">{position}</div>
                                                    </div>
                                                </div>
                                                <div className={cn(
                                                    "h-4 w-4 rounded-md border flex items-center justify-center shrink-0 transition-all",
                                                    isSelected ? "bg-primary border-primary text-white" : "border-input bg-background"
                                                )}>
                                                    {isSelected && <Check className="h-2.5 w-2.5 stroke-[3]" />}
                                                </div>
                                            </CommandItem>
                                        );
                                    })}
                                </CommandGroup>
                            </CommandList>
                        </Command>
                    </PopoverContent>
                </Popover>
            </div>

            {/* List of assigned operators as nice tags below the trigger */}
            {assignedOperators.length > 0 && (
                <div className="flex flex-wrap gap-1.5 p-2 border border-dashed border-border/80 bg-muted/20 rounded-xl max-h-[120px] overflow-y-auto">
                    {assignedOperators.map((op) => {
                        const opId = Number(op.user_id || op.id);
                        const fullName = `${op.user_fname || op.first_name || ""} ${op.user_lname || op.last_name || ""}`.trim() || `Operator #${opId}`;
                        const initials = `${op.user_fname?.[0] || ""}${op.user_lname?.[0] || ""}`.toUpperCase();

                        return (
                            <Badge
                                key={opId}
                                variant="secondary"
                                className="flex items-center gap-1.5 pl-1 pr-2 py-0.5 text-[10px] bg-card hover:bg-muted text-foreground border shadow-sm transition-all duration-200"
                            >
                                <div className="h-4.5 w-4.5 rounded-full bg-primary text-white flex items-center justify-center text-[8px] font-bold font-mono">
                                    {initials || "OP"}
                                </div>
                                <span className="font-semibold truncate max-w-[120px]">{fullName}</span>
                                <button
                                    type="button"
                                    onClick={() => onToggleOperator(opId)}
                                    className="text-muted-foreground hover:text-foreground rounded-full hover:bg-muted p-0.5 transition-colors shrink-0"
                                >
                                    <X className="h-2.5 w-2.5" />
                                </button>
                            </Badge>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
