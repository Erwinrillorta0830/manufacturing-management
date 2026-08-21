// src/modules/financial-management/line-discount/components/LineDiscountDialog.tsx
"use client";

import * as React from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import type { LineDiscountRow, LineDiscountUpsert } from "../type";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";

import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

const schema = z.object({
  line_discount: z.string().trim().min(1, "Code is required."),
  percentage: z.union([z.string(), z.number()])
    .refine((val) => val !== "" && val !== null && val !== undefined, "Percentage is required.")
    .transform((val) => Number(val))
    .pipe(
      z.number({ message: "Percentage is required." })
        .min(0, "Must be at least 0.00")
        .max(99.99, "Must be at most 99.99")
    ),
  description: z.string().trim().nullable().optional(),
});

type FormValues = z.infer<typeof schema>;

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;

  mode: "create" | "edit";
  initial?: LineDiscountRow | null;

  onSubmit: (payload: LineDiscountUpsert) => Promise<void>;
};

export default function LineDiscountDialog({
  open,
  onOpenChange,
  mode,
  initial,
  onSubmit,
}: Props) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema) as import("react-hook-form").Resolver<FormValues>,
    defaultValues: {
      line_discount: initial?.line_discount ?? "",
      percentage:
        initial?.percentage !== undefined && initial?.percentage !== null
          ? Number(initial.percentage)
          : (undefined as unknown as number),
      description: initial?.description ?? "",
    },
  });

  React.useEffect(() => {
    form.reset({
      line_discount: initial?.line_discount ?? "",
      percentage:
        initial?.percentage !== undefined && initial?.percentage !== null
          ? Number(initial.percentage)
          : (undefined as unknown as number),
      description: initial?.description ?? "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial, open]);

  const [saving, setSaving] = React.useState(false);

  async function handleSubmit(values: FormValues) {
    try {
      setSaving(true);

      await onSubmit({
        line_discount: values.line_discount.trim(),
        percentage: Number(values.percentage),
        description: values.description?.trim() ? values.description.trim() : null,
      });

      onOpenChange(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function handleValidationError(errors: import("react-hook-form").FieldErrors<FormValues>) {
    const firstError = Object.values(errors)[0];
    if (firstError?.message) {
      toast.error(String(firstError.message));
    }
  }


  const title = mode === "create" ? "New Line Discount" : "Edit Line Discount";
  const submitLabel = mode === "create" ? "Create Line Discount" : "Save Changes";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-xl">{title}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Register single line discounts used in sequential bundles.
          </p>
        </DialogHeader>

        <Separator />

        <div className="space-y-4">
          <div className="text-xs font-medium tracking-wide text-muted-foreground">
            DISCOUNT DETAILS
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit as import("react-hook-form").SubmitHandler<FormValues>, handleValidationError)} className="space-y-6">
              {/* ✅ Aligned grid: reserve helper-line space on Code */}
              <div className="grid grid-cols-1 gap-x-6 gap-y-5 md:grid-cols-2">
                {/* Code */}
                <FormField
                  control={form.control}
                  name="line_discount"
                  render={({ field }) => (
                    <FormItem className="space-y-2">
                      <FormLabel className="leading-none">
                        Code <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input className="h-10" placeholder="e.g. L1" {...field} />
                      </FormControl>

                      {/* ✅ Placeholder helper text so both columns align */}
                      <FormDescription className="invisible leading-none">
                        Enter a value from 0.00 to 99.99.
                      </FormDescription>

                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Percentage */}
                <FormField
                  control={form.control}
                  name="percentage"
                  render={({ field }) => (
                    <FormItem className="space-y-2">
                      <FormLabel className="leading-none">
                        Percentage <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          className="h-10"
                          placeholder="e.g. 10.00"
                          inputMode="decimal"
                          value={String(field.value ?? "")}
                          onChange={(e) => field.onChange(e.target.value)}
                        />
                      </FormControl>

                      <FormDescription className="leading-none">
                        Enter a value from 0.00 to 99.99.
                      </FormDescription>

                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Description spans full width */}
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem className="space-y-2 md:col-span-2">
                      <FormLabel className="leading-none">Description</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Optional notes..."
                          rows={3}
                          className="resize-none"
                          value={String(field.value ?? "")}
                          onChange={(e) => field.onChange(e.target.value)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {submitLabel}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
