import { useState } from "react";
import { useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ArrowLeft, User, Heart, FileText, MessageSquare, Activity, BookOpen } from "lucide-react";
import { Link } from "wouter";

const TABS = [
  { id: "overview", label: "Overview", icon: User },
  { id: "donations", label: "Donations", icon: Heart },
  { id: "pledges", label: "Pledges", icon: FileText },
  { id: "comms", label: "Communications", icon: MessageSquare },
  { id: "notes", label: "Notes", icon: BookOpen },
  { id: "audit", label: "Audit", icon: Activity },
];

const RFM_COLORS: Record<string, string> = {
  Champions: "bg-purple-100 text-purple-800",
  "Loyal Customers": "bg-blue-100 text-blue-800",
  "Potential Loyalists": "bg-cyan-100 text-cyan-800",
  "At Risk": "bg-amber-100 text-amber-800",
  "Cannot Lose Them": "bg-red-100 text-red-800",
  Hibernating: "bg-gray-100 text-gray-800",
  "New Customers": "bg-green-100 text-green-800",
};

export default function DonorProfile() {
  const [, params] = useRoute("/donors/:id");
  const donorId = params ? parseInt(params.id) : null;
  const [activeTab, setActiveTab] = useState("overview");
  const [noteText, setNoteText] = useState("");

  const { data: donor } = (trpc as any).donors.get.useQuery(
    { id: donorId! },
    { enabled: !!donorId }
  );

  const { data: donations } = (trpc as any).fundraising.getDonationsByDonor.useQuery(
    { donorId: donorId! },
    { enabled: !!donorId && activeTab === "donations" }
  );

  const { data: pledges } = (trpc as any).pledges.list.useQuery(
    { donorId: donorId! },
    { enabled: !!donorId && activeTab === "pledges" }
  );

  const { data: emails } = (trpc as any).commsInbox.listEmails.useQuery(
    { search: donor?.email, limit: 20 },
    { enabled: !!donor?.email && activeTab === "comms" }
  );

  const { data: notes, refetch: refetchNotes } = (trpc as any).donorPipeline.listNotes.useQuery(
    { donorId: donorId! },
    { enabled: !!donorId && activeTab === "notes" }
  );

  const { data: auditData } = (trpc as any).auditTrail.list.useQuery(
    { entity: "donor", search: donor?.fullName || donor?.name, pageSize: 50 },
    { enabled: !!donor && activeTab === "audit" }
  );

  const addNoteMut = (trpc as any).donorPipeline.addNote.useMutation({
    onSuccess: () => { toast.success("Note added"); refetchNotes(); setNoteText(""); },
    onError: (e: any) => toast.error(e.message),
  });

  if (!donorId) return null;

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link href="/donors">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-1" /> Back to Donors
            </Button>
          </Link>
          {donor && (
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold">{donor.fullName || donor.name}</h1>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    {donor.email && <span>{donor.email}</span>}
                    {donor.phone && <span>· {donor.phone}</span>}
                    {donor.rfmSegment && (
                      <Badge className={RFM_COLORS[donor.rfmSegment] ?? "bg-gray-100 text-gray-800"}>
                        {donor.rfmSegment}
                      </Badge>
                    )}
                    {donor.isGiftAidEligible && (
                      <Badge className="bg-green-100 text-green-800">Gift Aid</Badge>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b overflow-x-auto">
          {TABS.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        {activeTab === "overview" && donor && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-sm">Contact Details</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {donor.email && <p><span className="text-muted-foreground">Email:</span> {donor.email}</p>}
                {donor.phone && <p><span className="text-muted-foreground">Phone:</span> {donor.phone}</p>}
                {donor.address && <p><span className="text-muted-foreground">Address:</span> {donor.address}</p>}
                {donor.postcode && <p><span className="text-muted-foreground">Postcode:</span> {donor.postcode}</p>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Donation Summary</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {donor.totalDonated !== undefined && <p><span className="text-muted-foreground">Total donated:</span> <strong>£{Number(donor.totalDonated || 0).toLocaleString()}</strong></p>}
                {donor.donationCount !== undefined && <p><span className="text-muted-foreground">Donations:</span> {donor.donationCount}</p>}
                {donor.lastDonationDate && <p><span className="text-muted-foreground">Last donation:</span> {new Date(donor.lastDonationDate).toLocaleDateString("en-GB")}</p>}
                {donor.rfmScore !== undefined && <p><span className="text-muted-foreground">RFM Score:</span> {donor.rfmScore}</p>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Compliance</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p><span className="text-muted-foreground">Gift Aid:</span> {donor.isGiftAidEligible ? "Eligible" : "Not eligible"}</p>
                {donor.giftAidDeclarationDate && <p><span className="text-muted-foreground">Declaration:</span> {new Date(donor.giftAidDeclarationDate).toLocaleDateString("en-GB")}</p>}
                {donor.lawfulBasis && <p><span className="text-muted-foreground">Lawful basis:</span> {donor.lawfulBasis}</p>}
                {donor.consentGiven !== undefined && <p><span className="text-muted-foreground">Consent:</span> {donor.consentGiven ? "Given" : "Not given"}</p>}
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === "donations" && (
          <Card>
            <CardHeader><CardTitle>Donation History</CardTitle></CardHeader>
            <CardContent>
              {!donations?.length ? (
                <p className="text-muted-foreground text-sm py-4 text-center">No donations recorded</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-left py-2 pr-4">Date</th>
                      <th className="text-left py-2 pr-4">Amount</th>
                      <th className="text-left py-2 pr-4">Campaign</th>
                      <th className="text-left py-2">Gift Aid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {donations.map((d: any) => (
                      <tr key={d.id} className="border-b hover:bg-muted/20">
                        <td className="py-2 pr-4">{d.donationDate ? new Date(d.donationDate).toLocaleDateString("en-GB") : "—"}</td>
                        <td className="py-2 pr-4 font-semibold">£{Number(d.amount).toLocaleString()}</td>
                        <td className="py-2 pr-4 text-muted-foreground">{d.campaignName || "—"}</td>
                        <td className="py-2">{d.isGiftAid ? <Badge className="bg-green-100 text-green-800">Yes</Badge> : "No"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        )}

        {activeTab === "pledges" && (
          <Card>
            <CardHeader><CardTitle>Pledges</CardTitle></CardHeader>
            <CardContent>
              {!pledges?.length ? (
                <p className="text-muted-foreground text-sm py-4 text-center">No pledges recorded</p>
              ) : (
                <div className="space-y-3">
                  {pledges.map((p: any) => (
                    <div key={p.id} className="border rounded p-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium">£{Number(p.totalAmount).toLocaleString()}</p>
                          <p className="text-sm text-muted-foreground">{p.description || "No description"}</p>
                        </div>
                        <Badge className={p.status === "fulfilled" ? "bg-green-100 text-green-800" : p.status === "overdue" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}>
                          {p.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Paid: £{Number(p.paidAmount || 0).toLocaleString()} · Due: {p.dueDate ? new Date(p.dueDate).toLocaleDateString("en-GB") : "—"}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {activeTab === "comms" && (
          <Card>
            <CardHeader><CardTitle>Communications</CardTitle></CardHeader>
            <CardContent>
              {!emails?.emails?.length ? (
                <p className="text-muted-foreground text-sm py-4 text-center">No emails found for this donor</p>
              ) : (
                <div className="space-y-2">
                  {emails.emails.map((e: any) => (
                    <div key={e.id} className="border rounded p-3 text-sm">
                      <div className="flex justify-between items-start">
                        <span className="font-medium">{e.subject || "(No subject)"}</span>
                        <span className="text-xs text-muted-foreground">{e.receivedAt ? new Date(e.receivedAt).toLocaleDateString("en-GB") : ""}</span>
                      </div>
                      <p className="text-muted-foreground text-xs mt-1">{e.fromEmail}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {activeTab === "notes" && (
          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle>Add Note</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Textarea value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Add a note about this donor..." rows={3} />
                <Button disabled={!noteText || addNoteMut.isPending}
                  onClick={() => addNoteMut.mutate({ donorId: donorId!, note: noteText })}>
                  Add Note
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Notes History</CardTitle></CardHeader>
              <CardContent>
                {!notes?.length ? (
                  <p className="text-muted-foreground text-sm py-4 text-center">No notes yet</p>
                ) : (
                  <div className="space-y-3">
                    {notes.map((n: any) => (
                      <div key={n.id} className="border rounded p-3 text-sm">
                        <p>{n.note || n.content}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {n.authorName || "Staff"} · {new Date(n.createdAt).toLocaleDateString("en-GB")}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === "audit" && (
          <Card>
            <CardHeader><CardTitle>Audit Trail</CardTitle></CardHeader>
            <CardContent>
              {!auditData?.rows?.length ? (
                <p className="text-muted-foreground text-sm py-4 text-center">No audit events for this donor</p>
              ) : (
                <div className="space-y-2">
                  {auditData.rows.map((log: any) => (
                    <div key={log.id} className="border rounded p-3 text-sm flex items-start gap-3">
                      <Activity className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div>
                        <p className="font-medium">{log.action} {log.entity}</p>
                        {log.meta && <p className="text-muted-foreground text-xs">{typeof log.meta === "string" ? log.meta : JSON.stringify(log.meta)}</p>}
                        <p className="text-xs text-muted-foreground mt-1">
                          {log.userName || "System"} · {new Date(log.createdAt).toLocaleString("en-GB")}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
