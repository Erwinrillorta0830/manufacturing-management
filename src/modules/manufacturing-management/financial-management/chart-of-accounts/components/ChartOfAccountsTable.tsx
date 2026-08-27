// src/modules/financial-management/chart-of-accounts/components/ChartOfAccountsTable.tsx
"use client";

import * as React from "react";
import type { COARow, AccountTypeRow, BalanceTypeRow, UserRow } from "../types";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

function formatMDY(iso: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  const mm = String(d.getMonth() + 1);
  const dd = String(d.getDate());
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

function byIdLabel<T extends { id: number }>(
  list: T[],
  id: number | null | undefined,
  getLabel: (x: T) => string
) {
  if (!id) return "-";
  const found = list.find((x) => x.id === id);
  return found ? getLabel(found) : String(id);
}

export default function ChartOfAccountsTable(props: {
  rows: COARow[];
  loading: boolean;
  accountTypes: AccountTypeRow[];
  balanceTypes: BalanceTypeRow[];
  users: UserRow[];
  onEdit: (row: COARow) => void;
}) {
  const { rows, loading, accountTypes, balanceTypes, users, onEdit } = props;

  return (
    <div className="w-full overflow-hidden rounded-md border bg-background">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[340px]">Account Title</TableHead>
            <TableHead className="w-[110px]">GL Code</TableHead>
            <TableHead className="w-[260px]">Account Type</TableHead>
            <TableHead className="w-[150px]">Balance Type</TableHead>
            <TableHead className="w-[160px]">Added By</TableHead>
            <TableHead className="w-[140px]">Date Added</TableHead>
            <TableHead className="w-[110px] text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {loading ? (
            Array.from({ length: 10 }).map((_, i) => (
              <TableRow key={`sk-${i}`}>
                <TableCell><Skeleton className="h-4 w-[260px]" /></TableCell>
                <TableCell><Skeleton className="h-4 w-10" /></TableCell>
                <TableCell><Skeleton className="h-4 w-[200px]" /></TableCell>
                <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                <TableCell><Skeleton className="h-4 w-[120px]" /></TableCell>
                <TableCell><Skeleton className="h-4 w-[90px]" /></TableCell>
                <TableCell className="text-right">
                  <Skeleton className="ml-auto h-8 w-14" />
                </TableCell>
              </TableRow>
            ))
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                No accounts found.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((r) => (
              <TableRow key={r.coa_id} className="hover:bg-muted/30">
                <TableCell className="font-medium">{r.account_title}</TableCell>
                <TableCell>{r.gl_code || "-"}</TableCell>
                <TableCell className="uppercase">
                  {byIdLabel(accountTypes, r.account_type, (x) => x.account_name)}
                </TableCell>
                <TableCell className="uppercase">
                  {byIdLabel(balanceTypes, r.balance_type, (x) => x.balance_name)}
                </TableCell>
                <TableCell>
                  {(() => {
                    const addedBy = r.added_by;
                    if (!addedBy) return "-";
                    
                    const idStr = String(addedBy);
                    const u = users.find((x) => 
                      String(x.user_id) === idStr || 
                      String(x.id) === idStr
                    );

                    if (!u) return "-";

                    const fname = u.user_fname || u.first_name || u.firstname || "";
                    const lname = u.user_lname || u.last_name || u.lastname || "";
                    
                    const fullName = [fname, lname].filter(Boolean).join(" ");
                    return fullName || "-";
                  })()}
                </TableCell>
                <TableCell>{formatMDY(r.date_added)}</TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    className="cursor-pointer"
                    onClick={() => onEdit(r)}
                  >
                    Edit
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
