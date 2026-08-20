"use client";

import * as React from "react";
import { z } from "zod";
import { toast } from "sonner";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type Resolver } from "react-hook-form";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";

import type { DiscountTypeRow, LineDiscountRow } from "../type";
import { computeTotals, discountTypeUpsertSchema } from "../type";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

import { formatPercentExact } from "../utils/percent";

type FormValues = z.infer<typeof discountTypeUpsertSchema>;

function pctLabel(v: string | number) {
  const s = formatPercentExact(String(v ?? "0"), { trimTrailingZeros: true });
  return `${s}%`;
}

export default function DiscountTypeDialog({
  open,
  onOpenChange,
  editing,
  lineDiscounts,
  onSave,
  onDelete,
  mode = "edit",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: DiscountTypeRow | null;
  lineDiscounts: LineDiscountRow[];
  onSave?: (payload: FormValues) => Promise<void> | void;
  onDelete?: (id: number) => Promise<void> | void;

  /**
   * ✅ mode="view" => View-only (no Save/Reset/Delete, no changes allowed)
   * mode="create" => Create
   * mode="edit" => Edit
   */
  mode?: "view" | "create" | "edit";
}) {
  const readOnly = mode === "view";

  const form = useForm<FormValues>({
    resolver: zodResolver(discountTypeUpsertSchema) as unknown as Resolver<FormValues, unknown, FormValues>,
    mode: "onChange",
    defaultValues: {
      discount_type: "",
      id: undefined,
      line_ids: [],
    },
  });

  const [selected, setSelected] = React.useState<number[]>([]);

  React.useEffect(() => {
    if (!open) return;

    if (editing) {
      const ids = (editing.applied_lines ?? []).map((x) => Number(x.line_id));
      setSelected(ids);
      form.reset({
        id: editing.id,
        discount_type: editing.discount_type,
        line_ids: ids,
      });
    } else {
      setSelected([]);
      form.reset({
        discount_type: "",
        line_ids: [],
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  const selectedLines = React.useMemo(() => {
    const map = new Map<number, LineDiscountRow>();
    for (const l of lineDiscounts) map.set(Number(l.id), l);

    return selected.map((id) => {
      const row = map.get(Number(id));
      return {
        id: Number(id),
        code: row?.line_discount ?? `L${id}`,
        percentage: String(row?.percentage ?? "0"),
      };
    });
  }, [selected, lineDiscounts]);

  const totals = React.useMemo(() => {
    const perc = selectedLines.map((x) => x.percentage);
    return computeTotals(perc);
  }, [selectedLines]);

  const totalPercentExact = React.useMemo(() => {
    return formatPercentExact(totals.percent, { trimTrailingZeros: true });
  }, [totals.percent]);

  function addLine(lineId: number) {
    if (readOnly) return;
    setSelected((prev) => {
      const next = [...prev, lineId]; // duplicates allowed
      form.setValue("line_ids", next, { shouldDirty: true });
      return next;
    });
  }

  function removeAt(idx: number) {
    if (readOnly) return;
    setSelected((prev) => {
      const next = prev.slice();
      next.splice(idx, 1);
      form.setValue("line_ids", next, { shouldDirty: true });
      return next;
    });
  }

  function move(idx: number, dir: -1 | 1) {
    if (readOnly) return;
    setSelected((prev) => {
      const next = prev.slice();
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      const tmp = next[idx];
      next[idx] = next[j];
      next[j] = tmp;
      form.setValue("line_ids", next, { shouldDirty: true });
      return next;
    });
  }

  async function submit(v: FormValues) {
    if (readOnly) return;
    try {
      const payload: FormValues = { ...v, line_ids: selected };
      await onSave?.(payload);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  }

  function handleValidationError(errors: import("react-hook-form").FieldErrors<FormValues>) {
    const firstError = Object.values(errors)[0];
    if (firstError?.message) {
      toast.error(String(firstError.message));
    }
  }


  const title =
    mode === "view" ? "View Discount Type" : editing ? "Edit Discount Type" : "Add Discount Type";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(submit, handleValidationError)} className="space-y-4">
            <FormField
              control={form.control}
              name="discount_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Discount Type <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., No Discount, Promo A"
                      {...field}
                      disabled={readOnly}
                      readOnly={readOnly}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 md:grid-cols-2">
              {/* LEFT: available */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">Available Line Discounts</div>
                  <div className="text-xs text-muted-foreground">
                    Click to add <Badge variant="secondary">Enter</Badge>
                  </div>
                </div>

                <div className="rounded-lg border bg-muted/20">
                  <ScrollArea className="h-[240px] p-2">
                    <div className="space-y-2">
                      {lineDiscounts.map((l) => (
                        <div
                          key={l.id}
                          className="flex items-center justify-between rounded-md border bg-background px-3 py-2"
                        >
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="gap-2">
                              {l.line_discount} ({pctLabel(l.percentage)})
                            </Badge>
                          </div>

                          {/* ✅ In VIEW mode: no adding */}
                          {!readOnly && (
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              onClick={() => addLine(Number(l.id))}
                              className="h-8 w-8"
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                      {lineDiscounts.length === 0 && (
                        <div className="p-3 text-sm text-muted-foreground">
                          No line discounts found.
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </div>
              </div>

              {/* RIGHT: selected */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">Selected (Order matters)</div>
                  <div className="text-xs text-muted-foreground">Use ▲/▼ to reorder</div>
                </div>

                <div className="rounded-lg border bg-muted/20">
                  <ScrollArea className="h-[240px] p-2">
                    <div className="space-y-2">
                      {selectedLines.length === 0 ? (
                        <div className="p-3 text-sm text-muted-foreground">
                          No selected discounts.
                        </div>
                      ) : (
                        selectedLines.map((x, idx) => (
                          <div
                            key={`${x.id}-${idx}`}
                            className="flex items-center justify-between rounded-md border bg-background px-3 py-2"
                          >
                            <Badge variant="secondary" className="gap-2">
                              {x.code} ({pctLabel(x.percentage)})
                            </Badge>

                            {/* ✅ In VIEW mode: no reorder/remove */}
                            {!readOnly && (
                              <div className="flex items-center gap-2">
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="secondary"
                                  className="h-8 w-8"
                                  onClick={() => move(idx, -1)}
                                  disabled={idx === 0}
                                >
                                  <ArrowUp className="h-4 w-4" />
                                </Button>
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="secondary"
                                  className="h-8 w-8"
                                  onClick={() => move(idx, 1)}
                                  disabled={idx === selectedLines.length - 1}
                                >
                                  <ArrowDown className="h-4 w-4" />
                                </Button>
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="destructive"
                                  className="h-8 w-8"
                                  onClick={() => removeAt(idx)}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Badge variant="secondary" className="gap-2">
                % Total Percent: <span>{totalPercentExact} %</span>
              </Badge>
              <span className="text-xs text-muted-foreground">
                (Computed as sequential discounts, not sum)
              </span>
            </div>

            <Separator />

            {/* ✅ VIEW mode: no Save/Reset/Delete at all */}
            {readOnly ? (
              <div className="flex justify-end">
                <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
                  Close
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Button type="submit" className="w-48">
                    Save
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-48"
                    onClick={() => {
                      if (editing) {
                        const ids = (editing.applied_lines ?? []).map((x) => Number(x.line_id));
                        setSelected(ids);
                        form.reset({
                          id: editing.id,
                          discount_type: editing.discount_type,
                          line_ids: ids,
                        });
                      } else {
                        setSelected([]);
                        form.reset({ discount_type: "", line_ids: [] });
                      }
                    }}
                  >
                    Reset
                  </Button>
                </div>

                {editing?.id && onDelete ? (
                  <Button type="button" variant="destructive" onClick={() => onDelete(editing.id)}>
                    Delete
                  </Button>
                ) : (
                  <div />
                )}
              </div>
            )}
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
