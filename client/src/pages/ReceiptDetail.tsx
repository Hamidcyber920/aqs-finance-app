import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  ArrowLeft, Edit2, Save, X, RefreshCw, Loader2, Receipt,
  Calendar, DollarSign, Tag, FileText, ExternalLink, Trash2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc";

export default function ReceiptDetailPage() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const id = parseInt(params.id ?? "0");

  const { data: receipt, isLoading } = trpc.receipts.get.useQuery({ id }, { enabled: !!id });
  const { data: categories } = trpc.categories.list.useQuery();

  const [editing, setEditing] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [form, setForm] = useState({
    vendor: "",
    receiptDate: "",
    amount: "",
    tax: "",
    categoryName: "",
    currency: "GBP",
    notes: "",
  });

  useEffect(() => {
    if (receipt) {
      setForm({
        vendor: receipt.vendor ?? "",
        receiptDate: receipt.receiptDate
          ? format(new Date(receipt.receiptDate), "yyyy-MM-dd")
          : "",
        amount: receipt.amount ? String(receipt.amount) : "",
        tax: receipt.tax ? String(receipt.tax) : "",
        categoryName: receipt.categoryName ?? "",
        currency: receipt.currency ?? "GBP",
        notes: receipt.notes ?? "",
      });
    }
  }, [receipt]);

  const updateMutation = trpc.receipts.update.useMutation({
    onSuccess: () => {
      toast.success("Receipt updated");
      utils.receipts.get.invalidate({ id });
      utils.receipts.list.invalidate();
      setEditing(false);
    },
    onError: (err) => toast.error("Update failed", { description: err.message }),
  });

  const processMutation = trpc.receipts.process.useMutation({
    onSuccess: () => {
      toast.success("Receipt re-processed");
      utils.receipts.get.invalidate({ id });
    },
    onError: (err) => toast.error("Processing failed", { description: err.message }),
  });

  const deleteMutation = trpc.receipts.delete.useMutation({
    onSuccess: () => {
      toast.success("Receipt deleted");
      setLocation("/receipts");
    },
    onError: (err) => toast.error("Delete failed", { description: err.message }),
  });

  const handleSave = () => {
    updateMutation.mutate({ id, ...form });
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  if (!receipt) {
    return (
      <div className="max-w-4xl mx-auto text-center py-16">
        <Receipt className="h-12 w-12 mx-auto mb-4 opacity-30" />
        <p className="text-lg font-medium">Receipt not found</p>
        <Button className="mt-4" onClick={() => setLocation("/receipts")}>
          Back to Receipts
        </Button>
      </div>
    );
  }

  const statusColor: Record<string, "default" | "secondary" | "destructive"> = {
    processed: "default",
    failed: "destructive",
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/receipts")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">{receipt.vendor ?? "Unknown Vendor"}</h1>
            <p className="text-sm text-muted-foreground">
              Receipt #{receipt.id} ·{" "}
              {receipt.createdAt ? format(new Date(receipt.createdAt), "d MMM yyyy, HH:mm") : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={statusColor[receipt.status] ?? "secondary"}>{receipt.status}</Badge>
          {receipt.status === "failed" || receipt.status === "pending" ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => processMutation.mutate({ receiptId: id })}
              disabled={processMutation.isPending}
              className="gap-2"
            >
              {processMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Re-process
            </Button>
          ) : null}
          {!editing ? (
            <Button size="sm" onClick={() => setEditing(true)} className="gap-2">
              <Edit2 className="h-4 w-4" />
              Edit
            </Button>
          ) : (
            <>
              <Button size="sm" onClick={handleSave} disabled={updateMutation.isPending} className="gap-2">
                {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
                <X className="h-4 w-4" />
              </Button>
            </>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => setShowDelete(true)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Image */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Receipt Image</CardTitle>
          </CardHeader>
          <CardContent>
            {receipt.imageUrl ? (
              <div className="space-y-3">
                <div className="rounded-lg overflow-hidden border bg-muted/20">
                  {receipt.mimeType === "application/pdf" ? (
                    <div className="h-64 flex flex-col items-center justify-center gap-3 text-muted-foreground">
                      <FileText className="h-16 w-16 opacity-40" />
                      <p className="text-sm">PDF Receipt</p>
                      <Button size="sm" variant="outline" asChild>
                        <a href={receipt.imageUrl} target="_blank" rel="noopener noreferrer" className="gap-2">
                          <ExternalLink className="h-4 w-4" />
                          Open PDF
                        </a>
                      </Button>
                    </div>
                  ) : (
                    <img
                      src={receipt.thumbnailUrl ?? receipt.imageUrl}
                      alt="Receipt"
                      className="w-full object-contain max-h-80"
                    />
                  )}
                </div>
                <Button size="sm" variant="outline" className="w-full gap-2" asChild>
                  <a href={receipt.imageUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" />
                    View Original
                  </a>
                </Button>
              </div>
            ) : (
              <div className="h-48 flex flex-col items-center justify-center text-muted-foreground gap-2">
                <Receipt className="h-12 w-12 opacity-30" />
                <p className="text-sm">No image available</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Extracted Data</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Vendor</Label>
                {editing ? (
                  <Input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} />
                ) : (
                  <p className="font-medium">{receipt.vendor ?? "—"}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Date</Label>
                {editing ? (
                  <Input type="date" value={form.receiptDate} onChange={(e) => setForm({ ...form, receiptDate: e.target.value })} />
                ) : (
                  <p className="font-medium">
                    {receipt.receiptDate ? format(new Date(receipt.receiptDate), "d MMM yyyy") : "—"}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Total Amount</Label>
                {editing ? (
                  <div className="flex gap-2">
                    <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                      <SelectTrigger className="w-20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="GBP">GBP</SelectItem>
                        <SelectItem value="USD">USD</SelectItem>
                        <SelectItem value="EUR">EUR</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      step="0.01"
                      value={form.amount}
                      onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    />
                  </div>
                ) : (
                  <p className="font-semibold text-lg">
                    {receipt.amount
                      ? `${receipt.currency ?? "£"}${parseFloat(String(receipt.amount)).toFixed(2)}`
                      : "—"}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Tax</Label>
                {editing ? (
                  <Input
                    type="number"
                    step="0.01"
                    value={form.tax}
                    onChange={(e) => setForm({ ...form, tax: e.target.value })}
                  />
                ) : (
                  <p className="font-medium">
                    {receipt.tax ? `£${parseFloat(String(receipt.tax)).toFixed(2)}` : "—"}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Category</Label>
              {editing ? (
                <Select value={form.categoryName} onValueChange={(v) => setForm({ ...form, categoryName: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories?.map((c) => (
                      <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Badge variant="secondary" className="text-sm">
                  {receipt.categoryName ?? "Uncategorised"}
                </Badge>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Notes</Label>
              {editing ? (
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={3}
                  placeholder="Add notes..."
                />
              ) : (
                <p className="text-sm text-muted-foreground">{receipt.notes || "No notes"}</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Line items */}
      {receipt.lineItems && (receipt.lineItems as any[]).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Line Items</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {(receipt.lineItems as Array<{ description: string; amount: number }>).map((item, i) => (
                <div key={i} className="flex justify-between py-2 text-sm">
                  <span className="text-foreground">{item.description}</span>
                  <span className="font-medium">£{item.amount.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Raw text */}
      {receipt.rawText && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Raw Extracted Text</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono bg-muted/30 rounded-lg p-4 max-h-48 overflow-y-auto">
              {receipt.rawText}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Delete dialog */}
      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this receipt?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the receipt and all extracted data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate({ id })}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
