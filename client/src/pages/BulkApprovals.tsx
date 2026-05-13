import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { CheckCircle, XCircle, Clock, Users, Mail, AlertTriangle } from "lucide-react";
import { useVoiceContext } from "@/contexts/VoiceContext";

export default function BulkApprovals() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [action, setAction] = useState<"approved" | "rejected" | null>(null);

  const { setEntityContext } = useVoiceContext();
  useEffect(() => {
    setEntityContext("Viewing Bulk Approvals — review and approve outgoing bulk emails to donors");
    return () => setEntityContext(null);
  }, [setEntityContext]);

  const { data: pending, refetch } = (trpc as any).bulkApprovals.list.useQuery({ status: "pending" });
  const { data: history } = (trpc as any).bulkApprovals.list.useQuery({ status: undefined });

  const reviewMut = (trpc as any).bulkApprovals.review.useMutation({
    onSuccess: () => {
      toast.success(action === "approved" ? "Message approved and queued for sending" : "Message rejected");
      refetch();
      setSelectedId(null);
      setReviewNote("");
      setAction(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const selected = pending?.find((p: any) => p.id === selectedId);

  const statusBadge = (status: string) => {
    if (status === "approved") return <Badge className="bg-green-100 text-green-800">Approved</Badge>;
    if (status === "rejected") return <Badge className="bg-red-100 text-red-800">Rejected</Badge>;
    return <Badge className="bg-amber-100 text-amber-800">Pending</Badge>;
  };

  return (
      <>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Bulk Message Approvals</h1>
            <p className="text-muted-foreground text-sm mt-1">Review and approve outgoing bulk emails before they are sent to donors (threshold: &gt;50 recipients)</p>
          </div>
          {pending && pending.length > 0 && (
            <Badge className="bg-amber-100 text-amber-800 text-base px-3 py-1">
              <AlertTriangle className="w-4 h-4 mr-1 inline" />
              {pending.length} awaiting review
            </Badge>
          )}
        </div>

        {/* Pending approvals */}
        <div>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Clock className="w-5 h-5 text-amber-500" /> Pending Review
          </h2>
          {pending?.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <CheckCircle className="w-10 h-10 mx-auto mb-2 text-green-400" />
                <p>No pending bulk message approvals</p>
              </CardContent>
            </Card>
          )}
          <div className="space-y-3">
            {pending?.map((item: any) => (
              <Card key={item.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setSelectedId(item.id)}>
                <CardContent className="py-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4 text-blue-500" />
                        <span className="font-medium">{item.messageSubject || "No subject"}</span>
                        {statusBadge(item.status)}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" /> {item.recipientCount} recipients
                        </span>
                        <span>Requested by: {item.requestedByName || "Unknown"}</span>
                        <span>{new Date(item.createdAt).toLocaleDateString("en-GB")}</span>
                      </div>
                      {item.messagePreview && (
                        <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{item.messagePreview}</p>
                      )}
                    </div>
                    <div className="flex gap-2 ml-4">
                      <Button size="sm" className="bg-green-600 hover:bg-green-700"
                        onClick={e => { e.stopPropagation(); setSelectedId(item.id); setAction("approved"); }}>
                        <CheckCircle className="w-4 h-4 mr-1" /> Approve
                      </Button>
                      <Button size="sm" variant="destructive"
                        onClick={e => { e.stopPropagation(); setSelectedId(item.id); setAction("rejected"); }}>
                        <XCircle className="w-4 h-4 mr-1" /> Reject
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* History */}
        <div>
          <h2 className="text-lg font-semibold mb-3">Recent History</h2>
          <div className="space-y-2">
            {history?.filter((h: any) => h.status !== "pending").slice(0, 10).map((item: any) => (
              <Card key={item.id} className="opacity-80">
                <CardContent className="py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {statusBadge(item.status)}
                      <span className="text-sm font-medium">{item.messageSubject || "No subject"}</span>
                      <span className="text-sm text-muted-foreground">{item.recipientCount} recipients</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {item.reviewedAt ? new Date(item.reviewedAt).toLocaleDateString("en-GB") : new Date(item.createdAt).toLocaleDateString("en-GB")}
                    </span>
                  </div>
                  {item.reviewNotes && <p className="text-xs text-muted-foreground mt-1">Note: {item.reviewNotes}</p>}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>

      {/* Review dialog */}
      <Dialog open={!!selectedId && !!action} onOpenChange={() => { setSelectedId(null); setAction(null); setReviewNote(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{action === "approved" ? "Approve" : "Reject"} Bulk Message</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="bg-muted/30 rounded p-3 space-y-2 text-sm">
                <p><strong>Subject:</strong> {selected.messageSubject || "No subject"}</p>
                <p><strong>Recipients:</strong> {selected.recipientCount}</p>
                <p><strong>Requested by:</strong> {selected.requestedByName}</p>
                {selected.messagePreview && <p><strong>Preview:</strong> {selected.messagePreview}</p>}
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Review Note (optional)</label>
                <Textarea value={reviewNote} onChange={e => setReviewNote(e.target.value)}
                  placeholder={action === "approved" ? "Any conditions or notes..." : "Reason for rejection..."} rows={3} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setSelectedId(null); setAction(null); setReviewNote(""); }}>Cancel</Button>
            <Button
              className={action === "approved" ? "bg-green-600 hover:bg-green-700" : ""}
              variant={action === "rejected" ? "destructive" : "default"}
              disabled={reviewMut.isPending}
              onClick={() => {
                if (!selectedId || !action) return;
                reviewMut.mutate({ id: selectedId, decision: action, reviewNotes: reviewNote || undefined });
              }}>
              Confirm {action === "approved" ? "Approval" : "Rejection"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </>
  );
}
