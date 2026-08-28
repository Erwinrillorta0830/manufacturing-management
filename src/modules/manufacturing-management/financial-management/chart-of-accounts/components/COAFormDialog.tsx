// src/modules/financial-management/chart-of-accounts/components/COAFormDialog.tsx
"use client";

import * as React from "react";
import { toast } from "sonner";

import type {
  AccountTypeRow,
  BalanceTypeRow,
  BSISTypeRow,
  COARow,
  FindingRow,
  PaymentMethodRow,
} from "../types";

import {
  listGeneralFindings,
  listPaymentMethods,
  createFinding,
  createPaymentMethod,
} from "../providers/fetchProvider";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Mode = "create" | "edit";

function toStr(v: unknown) {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function toNum(v: string) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function readIsPaymentFromRow(row?: COARow | null) {
  if (!row) return false;

  const n = (row as Record<string, unknown>).is_payment;
  if (n === 1 || n === "1" || n === true) return true;
  if (n === 0 || n === "0" || n === false) return false;

  const buf = (row as Record<string, unknown>).isPayment as { data: number[] } | undefined;
  const b = buf?.data?.[0];
  if (b === 1) return true;
  if (b === 0) return false;

  return false;
}

export default function COAFormDialog(props: {
  open: boolean;
  onOpenChange: (v: boolean) => void;

  mode: Mode;
  row?: COARow | null;

  accountTypes: AccountTypeRow[];
  balanceTypes: BalanceTypeRow[];
  bsisTypes: BSISTypeRow[];
  lookupsLoading: boolean;

  addedByLabel?: string;

  onCreate: (payload: {
    account_title: string;
    bsis_code: number;
    account_type: number;
    balance_type: number;
    gl_code?: string | null;
    description?: string | null;
    is_payment?: 0 | 1;
    isPayment?: 0 | 1;
    added_by?: number | null;
  }) => Promise<void> | void;

  onUpdate: (
    id: number,
    payload: {
      account_title: string;
      bsis_code: number;
      account_type: number;
      balance_type: number;
      gl_code?: string | null;
      description?: string | null;
      is_payment?: 0 | 1;
      isPayment?: 0 | 1;
      added_by?: number | null;
    },
  ) => Promise<void> | void;
}) {
  const {
    open,
    onOpenChange,
    mode,
    row,
    accountTypes,
    balanceTypes,
    bsisTypes,
    lookupsLoading,
    addedByLabel = "Loading...",
    onCreate,
    onUpdate,
  } = props;

  const [accountTitle, setAccountTitle] = React.useState("");
  const [bsisCode, setBsisCode] = React.useState<string>("");
  const [accountType, setAccountType] = React.useState<string>("");
  const [balanceType, setBalanceType] = React.useState<string>("");
  const [glCode, setGlCode] = React.useState("");
  const [description, setDescription] = React.useState("");

  const [isPayment, setIsPayment] = React.useState(false);

  // Edit-only extras
  const [findingsLoading, setFindingsLoading] = React.useState(false);
  const [methodsLoading, setMethodsLoading] = React.useState(false);

  const [findings, setFindings] = React.useState<FindingRow[]>([]);
  const [methods, setMethods] = React.useState<PaymentMethodRow[]>([]);

  const [newFinding, setNewFinding] = React.useState("");
  const [newMethodName, setNewMethodName] = React.useState("");
  const [newMethodDesc, setNewMethodDesc] = React.useState("");

  const loadExtras = React.useCallback(async (coaId: number) => {
    try {
      setFindingsLoading(true);
      setMethodsLoading(true);

      const [fAll, mAll] = await Promise.all([listGeneralFindings(), listPaymentMethods()]);

      setFindings(fAll.filter((x) => Number(x.coa_id) === Number(coaId)));
      setMethods(mAll.filter((x) => Number(x.coa_id) === Number(coaId)));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load extra details");
      setFindings([]);
      setMethods([]);
    } finally {
      setFindingsLoading(false);
      setMethodsLoading(false);
    }
  }, []);

  async function addFinding(coaId: number) {
    const name = newFinding.trim();
    if (!name) return;

    try {
      setFindingsLoading(true);

      const created = await createFinding({ finding_name: name, coa_id: coaId });
      const rowCreated = (created as Record<string, unknown>)?.data as FindingRow | undefined;

      if (rowCreated) setFindings((prev) => [rowCreated, ...prev]);
      else await loadExtras(coaId);

      setNewFinding("");
      toast.success("Finding remark added");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to add finding remark");
    } finally {
      setFindingsLoading(false);
    }
  }

  async function addPaymentMethodFn(coaId: number) {
    const methodName = newMethodName.trim();
    if (!methodName) return;

    try {
      setMethodsLoading(true);

      const created = await createPaymentMethod({
        method_name: methodName,
        description: newMethodDesc.trim() ? newMethodDesc.trim() : null,
        isActive: 1,
        coa_id: coaId,
      });

      const rowCreated = (created as Record<string, unknown>)?.data as PaymentMethodRow | undefined;

      if (rowCreated) setMethods((prev) => [rowCreated, ...prev]);
      else await loadExtras(coaId);

      setNewMethodName("");
      setNewMethodDesc("");
      toast.success("Payment method added");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to add payment method");
    } finally {
      setMethodsLoading(false);
    }
  }

  React.useEffect(() => {
    if (!open) return;

    if (mode === "edit" && row) {
      setAccountTitle(toStr(row.account_title));
      setBsisCode(row.bsis_code ? String(row.bsis_code) : "");
      setAccountType(row.account_type ? String(row.account_type) : "");
      setBalanceType(row.balance_type ? String(row.balance_type) : "");
      setGlCode(toStr(row.gl_code));
      setDescription(toStr(row.description));
      setIsPayment(readIsPaymentFromRow(row));

      if (row?.coa_id) loadExtras(row.coa_id);
    } else {
      setAccountTitle("");
      setBsisCode("");
      setAccountType("");
      setBalanceType("");
      setGlCode("");
      setDescription("");
      setIsPayment(false);

      setFindings([]);
      setMethods([]);
      setNewFinding("");
      setNewMethodName("");
      setNewMethodDesc("");
    }
  }, [open, mode, row, loadExtras]);

  function validate() {
    if (!accountTitle.trim()) return "Account Title is required";
    if (!bsisCode) return "BS/IS Type is required";
    if (!accountType) return "Account Type is required";
    if (!balanceType) return "Balance Type is required";
    return null;
  }

  async function submit() {
    const msg = validate();
    if (msg) {
      toast.error(msg);
      return;
    }

    const payFlag: 0 | 1 = isPayment ? 1 : 0;

    const payload = {
      account_title: accountTitle.trim(),
      bsis_code: toNum(bsisCode),
      account_type: toNum(accountType),
      balance_type: toNum(balanceType),
      gl_code: glCode.trim() ? glCode.trim() : null,
      description: description.trim() ? description.trim() : null,
      is_payment: payFlag,
      isPayment: payFlag,
    };

    if (mode === "create") {
      await onCreate(payload);
    } else if (mode === "edit" && row?.coa_id) {
      await onUpdate(row.coa_id, payload);
    }
  }

  const title = mode === "create" ? "Add New Account" : "Edit Account";
  const primaryText = mode === "create" ? "Create" : "Save Changes";

  const isEdit = mode === "edit";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={isEdit ? "max-w-5xl" : "max-w-xl"}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {isEdit ? (
          <>
            {/* LEFT = Account Fields, RIGHT = Extras */}
            <div className="grid grid-cols-1 gap-x-10 gap-y-6 md:grid-cols-2">
              {/* LEFT: account fields */}
              <div className="min-w-0 space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Account Title <span className="text-destructive">*</span>
                  </label>
                  <Input value={accountTitle} onChange={(e) => setAccountTitle(e.target.value)} />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    BS/IS Type <span className="text-destructive">*</span>
                  </label>
                  <Select value={bsisCode} onValueChange={setBsisCode} disabled={lookupsLoading}>
                    <SelectTrigger className="w-full">
                      <div className="truncate text-left">
                        <SelectValue placeholder="Select a BS/IS type" />
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      {bsisTypes.map((x) => (
                        <SelectItem key={x.id} value={String(x.id)}>
                          <span className="truncate">{x.bsis_code}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Account Type <span className="text-destructive">*</span>
                  </label>
                  <Select value={accountType} onValueChange={setAccountType} disabled={lookupsLoading}>
                    <SelectTrigger className="w-full">
                      <div className="truncate text-left">
                        <SelectValue placeholder="Select an account type" />
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      {accountTypes.map((x) => (
                        <SelectItem key={x.id} value={String(x.id)}>
                          <span className="truncate">{x.account_name}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Balance Type <span className="text-destructive">*</span>
                  </label>
                  <Select value={balanceType} onValueChange={setBalanceType} disabled={lookupsLoading}>
                    <SelectTrigger className="w-full">
                      <div className="truncate text-left">
                        <SelectValue placeholder="Select a balance type" />
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      {balanceTypes.map((x) => (
                        <SelectItem key={x.id} value={String(x.id)}>
                          <span className="truncate">{x.balance_name}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">GL Code</label>
                  <Input value={glCode} onChange={(e) => setGlCode(e.target.value)} />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Description</label>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="min-h-[110px]"
                  />
                </div>
              </div>

              {/* RIGHT: extras */}
              <div className="min-w-0 space-y-4 border-l pl-2 md:pl-6">
                <div className="flex items-center gap-2">
                  <Checkbox checked={isPayment} onCheckedChange={(v) => setIsPayment(v === true)} id="is-payment" />
                  <label
                    htmlFor="is-payment"
                    className="text-sm font-medium leading-none cursor-pointer select-none"
                  >
                    Is Payment
                  </label>
                </div>

                {/* Finding Remarks */}
                {row?.coa_id ? (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Finding Remarks</label>

                    <div className="flex gap-2">
                      <Input
                        value={newFinding}
                        onChange={(e) => setNewFinding(e.target.value)}
                        placeholder="Enter finding remark..."
                        disabled={findingsLoading}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="cursor-pointer"
                        disabled={findingsLoading || !newFinding.trim()}
                        onClick={() => addFinding(row.coa_id)}
                      >
                        Add
                      </Button>
                    </div>

                    {/* ✅ NO X BUTTON */}
                    <div className="flex flex-wrap gap-2 pt-1">
                      {findings.map((f, idx) => (
                        <Badge
                          key={`${Number(f.id ?? 0)}-${Number(f.coa_id ?? 0)}-${f.finding_name ?? ""}-${idx}`}
                          variant="secondary"
                        >
                          {f.finding_name}
                        </Badge>
                      ))}
                      {!findingsLoading && findings.length === 0 ? (
                        <div className="text-xs text-muted-foreground">No finding remarks.</div>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {/* Payment Methods */}
                {row?.coa_id ? (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Payment Methods</label>

                    <div className="grid gap-2">
                      <div className="flex gap-2">
                        <Input
                          value={newMethodName}
                          onChange={(e) => setNewMethodName(e.target.value)}
                          placeholder="Method name (e.g., Cash, GCash)..."
                          disabled={methodsLoading}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          className="cursor-pointer"
                          disabled={methodsLoading || !newMethodName.trim()}
                          onClick={() => addPaymentMethodFn(row.coa_id)}
                        >
                          Add
                        </Button>
                      </div>

                      <Textarea
                        value={newMethodDesc}
                        onChange={(e) => setNewMethodDesc(e.target.value)}
                        placeholder="Description (optional)"
                        className="min-h-[80px]"
                        disabled={methodsLoading}
                      />
                    </div>

                    {/* ✅ NO X BUTTON */}
                    <div className="flex flex-wrap gap-2 pt-1">
                      {methods.map((m, idx) => (
                        <Badge
                          key={`${Number(m.method_id ?? 0)}-${Number(m.coa_id ?? 0)}-${m.method_name ?? ""}-${idx}`}
                          variant="secondary"
                        >
                          {m.method_name}
                        </Badge>
                      ))}
                      {!methodsLoading && methods.length === 0 ? (
                        <div className="text-xs text-muted-foreground">No payment methods.</div>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                <div className="space-y-2">
                  <label className="text-sm font-medium">Added By</label>
                  <Input value={addedByLabel} disabled />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="outline" className="cursor-pointer" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button className="cursor-pointer" onClick={submit}>
                {primaryText}
              </Button>
            </div>
          </>
        ) : (
          // CREATE MODE (kept as-is)
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Account Title <span className="text-destructive">*</span>
              </label>
              <Input value={accountTitle} onChange={(e) => setAccountTitle(e.target.value)} />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                BS/IS Type <span className="text-destructive">*</span>
              </label>
              <Select value={bsisCode} onValueChange={setBsisCode} disabled={lookupsLoading}>
                <SelectTrigger className="w-full">
                  <div className="truncate text-left">
                    <SelectValue placeholder="Select a BS/IS type" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {bsisTypes.map((x) => (
                    <SelectItem key={x.id} value={String(x.id)}>
                      <span className="truncate">{x.bsis_code}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                Account Type <span className="text-destructive">*</span>
              </label>
              <Select value={accountType} onValueChange={setAccountType} disabled={lookupsLoading}>
                <SelectTrigger className="w-full">
                  <div className="truncate text-left">
                    <SelectValue placeholder="Select an account type" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {accountTypes.map((x) => (
                    <SelectItem key={x.id} value={String(x.id)}>
                      <span className="truncate">{x.account_name}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                Balance Type <span className="text-destructive">*</span>
              </label>
              <Select value={balanceType} onValueChange={setBalanceType} disabled={lookupsLoading}>
                <SelectTrigger className="w-full">
                  <div className="truncate text-left">
                    <SelectValue placeholder="Select a balance type" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {balanceTypes.map((x) => (
                    <SelectItem key={x.id} value={String(x.id)}>
                      <span className="truncate">{x.balance_name}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">GL Code</label>
              <Input value={glCode} onChange={(e) => setGlCode(e.target.value)} />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="min-h-[110px]"
              />
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                checked={isPayment}
                onCheckedChange={(v) => setIsPayment(v === true)}
                id="is-payment-create"
              />
              <label
                htmlFor="is-payment-create"
                className="text-sm font-medium leading-none cursor-pointer select-none"
              >
                Is Payment
              </label>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Added By</label>
              <Input value={addedByLabel} disabled />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="outline" className="cursor-pointer" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button className="cursor-pointer" onClick={submit}>
                {primaryText}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
