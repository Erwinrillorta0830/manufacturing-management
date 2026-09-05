"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import { useChartOfAccounts } from "./hooks/useChartOfAccounts";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import { Separator } from "@/components/ui/separator";
import ChartOfAccountsFilters from "./components/ChartOfAccountsFilters";
import ChartOfAccountsTable from "./components/ChartOfAccountsTable";
import COAFormDialog from "./components/COAFormDialog";

export default function ChartOfAccountsModule(props: {
  currentUser?: { id: number | null; name: string };
}) {
  const coa = useChartOfAccounts({ currentUser: props.currentUser });







  return (
    <div className="space-y-4">
      {/* ✅ Title moved down & aligned with Add Account button */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">
            Chart of Account Management
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage your chart of accounts
          </p>
        </div>

        <Button className="cursor-pointer" onClick={coa.openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Add Account
        </Button>
      </div>

      {/* ✅ Removed the small "Chart of Accounts" label/title */}

      {/* Filters Card */}
      <Card className="border-muted/60 bg-muted/20">
        <CardContent className="pt-6">
          <ChartOfAccountsFilters
            glCode={coa.glCode}
            setGlCode={coa.setGlCode}
            accountTitle={coa.accountTitle}
            setAccountTitle={coa.setAccountTitle}
            accountType={coa.accountType}
            setAccountType={coa.setAccountType}
            balanceType={coa.balanceType}
            setBalanceType={coa.setBalanceType}
            accountTypes={coa.accountTypes}
            balanceTypes={coa.balanceTypes}
            accountTitlesLookup={coa.accountTitlesLookup}
            applyFilters={coa.applyFilters}
            clearFilters={coa.clearFilters}
          />
        </CardContent>
      </Card>

      <Card className="border-muted/60 bg-muted/20">
        <CardContent className="space-y-3 pt-6">

          {/* Table */}
          <ChartOfAccountsTable
            rows={coa.rows}
            loading={coa.loading}
            accountTypes={coa.accountTypes}
            balanceTypes={coa.balanceTypes}
            users={coa.users}
            onEdit={(row) => coa.openEdit(row)}
          />

          <Separator />

          {/* Footer: "Showing X of Y" + pagination */}
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-muted-foreground">
              Showing{" "}
              <span className="font-medium text-foreground">
                {coa.rows.length}
              </span>{" "}
              of{" "}
              <span className="font-medium text-foreground">{coa.total}</span>{" "}
              items
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                className="cursor-pointer"
                disabled={!coa.canPrev}
                onClick={() => coa.setPage(coa.page - 1)}
              >
                Previous
              </Button>

              <div className="text-sm">
                Page <span className="font-medium">{coa.page}</span> of{" "}
                <span className="font-medium">{coa.pageCount}</span>
              </div>

              <Button
                variant="outline"
                className="cursor-pointer"
                disabled={!coa.canNext}
                onClick={() => coa.setPage(coa.page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Create dialog */}
      <COAFormDialog
        open={coa.createOpen}
        onOpenChange={coa.setCreateOpen}
        mode="create"
        accountTypes={coa.accountTypes}
        balanceTypes={coa.balanceTypes}
        bsisTypes={coa.bsisTypes}
        lookupsLoading={coa.lookupsLoading}
        onCreate={coa.create}
        onUpdate={async () => { }}
      />

      {/* Edit dialog */}
      <COAFormDialog
        open={coa.editState.open}
        onOpenChange={(v) => (v ? null : coa.closeEdit())}
        mode="edit"
        row={coa.editState.row || undefined}
        accountTypes={coa.accountTypes}
        balanceTypes={coa.balanceTypes}
        bsisTypes={coa.bsisTypes}
        lookupsLoading={coa.lookupsLoading}
        onCreate={async () => { }}
        onUpdate={async (id, payload) => {
          await coa.update(id, payload);
        }}
      />

      {/* Delete confirm (kept; trigger location is up to you) */}

    </div>
  );
}
