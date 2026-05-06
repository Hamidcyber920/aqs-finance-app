import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { Search, Filter, Receipt, Trash2, Eye, ChevronLeft, ChevronRight, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";

const PAGE_SIZE = 20;

const STATUS_COLORS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  processed: "default",
  processing: "secondary",
  pending: "secondary",
  failed: "destructive",
};

export default function ReceiptsPage() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  const [vendor, setVendor] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(0);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const filters = useMemo(() => ({
    vendor: vendor || undefined,
    categoryName: category !== "all" ? category : undefined,
    status: status !== "all" ? status : undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  }), [vendor, category, status, dateFrom, dateTo, page]);

  const { data, isLoading, refetch } = trpc.receipts.list.useQuery(filters);
  const { data: categories } = trpc.categories.list.useQuery();

  const deleteMutation = trpc.receipts.delete.useMutation({
    onSuccess: () => {
      toast.success("Receipt deleted");
      utils.receipts.list.invalidate();
      setDeleteId(null);
    },
    onError: (err) => toast.error("Delete failed", { description: err.message }),
  });

  const totalPages = Math.ceil((data?.total ?? 0) / PAGE_SIZE);

  const setMarchFilter = () => {
    setDateFrom("2026-03-01");
    setDateTo("2026-03-31");
    setPage(0);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">All Receipts</h1>
          <p className="text-muted-foreground mt-1">
            {data ? `${data.total} receipt${data.total !== 1 ? "s" : ""} found` : "Loading..."}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={setMarchFilter}>
            March 2026
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className="gap-2"
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filters
          </Button>
        </div>
      </div>

      {/* Search & Filters */}
      <Card>
        <CardContent className="pt-4 pb-4 space-y-3">
          <div className="flex gap-3 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by vendor..."
                value={vendor}
                onChange={(e) => { setVendor(e.target.value); setPage(0); }}
                className="pl-9"
              />
            </div>
            <Select value={category} onValueChange={(v) => { setCategory(v); setPage(0); }}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories?.map((c) => (
                  <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={(v) => { setStatus(v); setPage(0); }}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="processed">Processed</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {showFilters && (
            <div className="flex gap-3 flex-wrap pt-1 border-t">
              <div className="flex items-center gap-2">
                <label className="text-sm text-muted-foreground whitespace-nowrap">From:</label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => { setDateFrom(e.target.value); setPage(0); }}
                  className="w-40"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-muted-foreground whitespace-nowrap">To:</label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => { setDateTo(e.target.value); setPage(0); }}
                  className="w-40"
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setVendor(""); setCategory("all"); setStatus("all");
                  setDateFrom(""); setDateTo(""); setPage(0);
                }}
              >
                Clear all
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : !data?.rows.length ? (
            <div className="py-16 text-center text-muted-foreground">
              <Receipt className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p className="font-medium">No receipts found</p>
              <p className="text-sm mt-1">Try adjusting your filters or add a new receipt.</p>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="grid grid-cols-[1fr_120px_100px_100px_80px_80px] gap-4 px-4 py-3 border-b bg-muted/30 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                <span>Vendor</span>
                <span>Date</span>
                <span>Amount</span>
                <span>Category</span>
                <span>Status</span>
                <span className="text-right">Actions</span>
              </div>

              {data.rows.map((r) => (
                <div
                  key={r.id}
                  className="grid grid-cols-[1fr_120px_100px_100px_80px_80px] gap-4 px-4 py-3 border-b last:border-0 hover:bg-muted/20 transition-colors items-center"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{r.vendor ?? "Unknown Vendor"}</p>
                    <p className="text-xs text-muted-foreground truncate">{r.originalFilename ?? ""}</p>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {r.receiptDate ? format(new Date(r.receiptDate), "d MMM yyyy") : "—"}
                  </span>
                  <span className="text-sm font-medium">
                    {r.amount ? `£${parseFloat(String(r.amount)).toFixed(2)}` : "—"}
                  </span>
                  <span className="text-xs text-muted-foreground truncate">
                    {r.categoryName ?? "—"}
                  </span>
                  <Badge variant={STATUS_COLORS[r.status] ?? "secondary"} className="text-xs w-fit">
                    {r.status}
                  </Badge>
                  <div className="flex gap-1 justify-end">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => setLocation(`/receipts/${r.id}`)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => setDeleteId(r.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page + 1} of {totalPages} · {data?.total} total
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline" size="sm"
              disabled={page === 0}
              onClick={() => setPage(p => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline" size="sm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage(p => p + 1)}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Delete dialog */}
      <DeleteConfirmDialog
        open={deleteId !== null}
        onOpenChange={(v) => { if (!v) setDeleteId(null); }}
        itemLabel="this receipt and all extracted data"
        onConfirm={() => deleteId !== null && deleteMutation.mutate({ id: deleteId })}
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
