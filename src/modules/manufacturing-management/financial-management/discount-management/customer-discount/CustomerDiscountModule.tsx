"use client";

import { useState, useMemo } from "react";
import { useCustomerDiscount } from "./hooks/useCustomerDiscount";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { 
  Search, 
  FilterX, 
  Users,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ManageDiscountModal } from "./components/ManageDiscountModal";
import { Customer } from "./types";

export default function CustomerDiscountModule({ userName, userId }: { userName: string; userId: number | null }) {
  const {
    loading,
    error,
    data,
    selectedCustomer,
    setSelectedCustomer,
    customerDiscounts,
    loadingDiscounts,
    loadCustomerDiscounts,
    handleAddDiscount,
    handleDeleteDiscount,
  } = useCustomerDiscount(userId);

  const [search, setSearch] = useState("");
  const [storeTypeFilter, setStoreTypeFilter] = useState("all");
  const [classificationFilter, setClassificationFilter] = useState("all");
  const [paymentTermFilter, setPaymentTermFilter] = useState("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);

  const filteredCustomers = useMemo(() => {
    if (!data) return [];
    return data.customers.filter((c) => {
      const matchesSearch = 
        c.customer_name.toLowerCase().includes(search.toLowerCase()) ||
        c.customer_code.toLowerCase().includes(search.toLowerCase());
      
      const sType = typeof c.store_type === 'object' ? String(c.store_type?.id) : String(c.store_type);
      const classId = typeof c.classification === 'object' ? String(c.classification?.id) : String(c.classification);
      const pTerm = typeof c.payment_term === 'object' ? String(c.payment_term?.id) : String(c.payment_term);

      if (search && !matchesSearch) return false;
      if (storeTypeFilter !== "all" && sType !== storeTypeFilter) return false;
      if (classificationFilter !== "all" && classId !== classificationFilter) return false;
      if (paymentTermFilter !== "all" && pTerm !== paymentTermFilter) return false;
      
      return true;
    });
  }, [data, search, storeTypeFilter, classificationFilter, paymentTermFilter]);

  const clearFilters = () => {
    setSearch("");
    setStoreTypeFilter("all");
    setClassificationFilter("all");
    setPaymentTermFilter("all");
    setCurrentPage(1);
  };

  const paginatedCustomers = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredCustomers.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredCustomers, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredCustomers.length / itemsPerPage);

  const handleManageDiscount = (customer: Customer) => {
    setSelectedCustomer(customer);
    loadCustomerDiscounts(customer.customer_code);
    setIsModalOpen(true);
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center border-2 border-dashed rounded-xl bg-destructive/5 border-destructive/20">
        <div className="p-4 rounded-full bg-destructive/10 mb-4">
          <FilterX className="h-8 w-8 text-destructive" />
        </div>
        <h2 className="text-xl font-bold text-destructive mb-2">Failed to Load Data</h2>
        <p className="text-muted-foreground mb-6 max-w-md">{error}</p>
        <Button onClick={() => window.location.reload()}>Retry Connection</Button>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 bg-background animate-in fade-in duration-500">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Users className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-extrabold tracking-tight">Customer Discount</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Manage customer-specific discounts across suppliers and categories.
          </p>
        </div>
        <div className="flex items-center gap-2">
        </div>
      </div>

      {/* Filter Section */}
      <div className="bg-card border rounded-xl p-4 shadow-sm space-y-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative w-full md:w-[280px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search name or code..."
              className="pl-9 h-10 text-sm bg-muted/30 focus-visible:ring-primary"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <SearchableSelect
            value={storeTypeFilter}
            onValueChange={setStoreTypeFilter}
            placeholder="Store Type"
            options={[
              { value: "all", label: "All Store Types" },
              ...(data?.storeTypes.map((s) => ({ value: String(s.id), label: s.store_type })) || []),
            ]}
            className="w-full md:w-[180px]"
          />

          <SearchableSelect
            value={classificationFilter}
            onValueChange={setClassificationFilter}
            placeholder="Classification"
            options={[
              { value: "all", label: "All Classifications" },
              ...(data?.classifications.map((c) => ({ value: String(c.id), label: c.classification_name })) || []),
            ]}
            className="w-full md:w-[180px]"
          />

          <SearchableSelect
            value={paymentTermFilter}
            onValueChange={setPaymentTermFilter}
            placeholder="Payment Term"
            options={[
              { value: "all", label: "All Payment Terms" },
              ...(data?.paymentTerms.map((p) => ({ value: String(p.id), label: p.payment_name })) || []),
            ]}
            className="w-full md:w-[180px]"
          />

          {(search || storeTypeFilter !== "all" || classificationFilter !== "all" || paymentTermFilter !== "all") && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground hover:text-foreground h-10 gap-2">
              <FilterX className="h-4 w-4" /> Clear Filters
            </Button>
          )}
        </div>
      </div>

      {/* Table Section */}
      <div className="border rounded-xl shadow-sm overflow-hidden bg-card">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[120px] text-xs font-bold uppercase py-4">Code</TableHead>
              <TableHead className="text-xs font-bold uppercase py-4">Customer Name</TableHead>
              <TableHead className="text-xs font-bold uppercase py-4">Store Type</TableHead>
              <TableHead className="text-xs font-bold uppercase py-4">Classification</TableHead>
              <TableHead className="text-xs font-bold uppercase py-4">Payment Term</TableHead>
              <TableHead className="text-xs font-bold uppercase py-4 text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-8 w-24 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : paginatedCustomers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-64 text-center">
                   <div className="flex flex-col items-center justify-center text-muted-foreground">
                      <Users className="h-12 w-12 opacity-20 mb-2" />
                      <p>No customers found matching your criteria.</p>
                   </div>
                </TableCell>
              </TableRow>
            ) : (
              paginatedCustomers.map((customer) => {
                const sType = typeof customer.store_type === 'object' ? customer.store_type?.store_type : data?.storeTypes.find(s => s.id === customer.store_type)?.store_type;
                const classif = typeof customer.classification === 'object' ? customer.classification?.classification_name : data?.classifications.find(c => c.id === customer.classification)?.classification_name;
                const pTerm = typeof customer.payment_term === 'object' ? customer.payment_term?.payment_name : data?.paymentTerms.find(p => p.id === customer.payment_term)?.payment_name;

                return (
                  <TableRow key={customer.id} className="group hover:bg-muted/30 transition-colors">
                    <TableCell className="font-mono text-xs font-semibold text-muted-foreground">{customer.customer_code}</TableCell>
                    <TableCell className="font-bold">{customer.customer_name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-normal text-[11px] bg-background">
                        {sType || "—"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{classif || "—"}</TableCell>
                    <TableCell className="text-xs">{pTerm || "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button 
                        size="sm" 
                        variant="ghost"
                        onClick={() => handleManageDiscount(customer)}
                        className="h-8 gap-2 text-primary hover:text-primary hover:bg-primary/10 px-3 font-semibold"
                      >
                        Manage Discount <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>

        {totalPages > 0 && (
          <div className="flex flex-col md:flex-row items-center justify-between p-4 border-t bg-muted/20 gap-4">
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <span>Showing</span>
              <Select
                value={String(itemsPerPage)}
                onValueChange={(val) => {
                  setItemsPerPage(Number(val));
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="h-8 w-[70px]">
                  <SelectValue placeholder={itemsPerPage} />
                </SelectTrigger>
                <SelectContent side="top">
                  {[10, 20, 50, 100].map((size) => (
                    <SelectItem key={size} value={String(size)}>
                      {size}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span>row(s) on this page • {filteredCustomers.length} total</span>
            </div>
            
            <div className="flex items-center gap-6">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="font-semibold"
              >
                Prev
              </Button>
              
              <div className="text-sm font-medium">
                Page {currentPage} of {totalPages}
              </div>

              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="font-semibold"
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      {selectedCustomer && (
        <ManageDiscountModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          customer={selectedCustomer}
          discounts={customerDiscounts}
          loading={loadingDiscounts}
          suppliers={data?.suppliers || []}
          categories={data?.categories || []}
          discountTypes={data?.discountTypes || []}
          storeTypes={data?.storeTypes || []}
          classifications={data?.classifications || []}
          onAdd={handleAddDiscount}
          onDelete={handleDeleteDiscount}
          userName={userName}
        />
      )}
    </div>
  );
}
