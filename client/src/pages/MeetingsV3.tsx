import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Calendar, Plus, Sparkles, FileText, CheckSquare, ChevronRight, UserPlus } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    scheduled: "bg-blue-100 text-blue-800",
    in_progress: "bg-yellow-100 text-yellow-800",
    completed: "bg-green-100 text-green-800",
    cancelled: "bg-red-100 text-red-800",
    pending: "bg-gray-100 text-gray-700",
    active: "bg-green-100 text-green-800",
    offboarded: "bg-orange-100 text-orange-800",
    in_progress_stage: "bg-yellow-100 text-yellow-800",
    blocked: "bg-red-100 text-red-800",
  };
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${map[status] ?? "bg-gray-100 text-gray-700"}`}>{status.replace(/_/g, " ")}</span>;
}

const MEETING_TYPES = [
  { value: "trustee_board", label: "Trustee Board" },
  { value: "finance_committee", label: "Finance Committee" },
  { value: "safeguarding_committee", label: "Safeguarding Committee" },
  { value: "building_committee", label: "Building Committee" },
  { value: "agm", label: "AGM" },
  { value: "extraordinary", label: "Extraordinary" },
  { value: "staff", label: "Staff Meeting" },
] as const;

const EMPTY_MEETING = {
  title: "",
  meetingType: "trustee_board" as const,
  scheduledAt: "",
  location: "",
  notes: "",
  quorumRequired: 3,
};

const EMPTY_PIPELINE = {
  userId: 0,
  pipelineType: "onboarding" as "onboarding" | "offboarding",
};

export default function MeetingsV3Page() {
  useAuth();
  useEffect(() => {
  }, [tab]);

  const utils = trpc.useUtils();

  const [tab, setTab] = useState("meetings");
  const [showMeetingDialog, setShowMeetingDialog] = useState(false);
  const [showPipelineDialog, setShowPipelineDialog] = useState(false);
  const [showMinutesDialog, setShowMinutesDialog] = useState(false);
  const [showAgendaDialog, setShowAgendaDialog] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState<any>(null);
  const [meetingForm, setMeetingForm] = useState({ ...EMPTY_MEETING });
  const [pipelineForm, setPipelineForm] = useState({ ...EMPTY_PIPELINE });
  const [minutesText, setMinutesText] = useState("");
  const [aiAgendaItems, setAiAgendaItems] = useState<Array<{ itemNumber: number; title: string; description: string; durationMinutes: number }>>([]);
  const [aiSummary, setAiSummary] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const [transcribeResult, setTranscribeResult] = useState<{ transcriptText: string; extractedDecisions: number } | null>(null);

  const meetings = trpc.meetingsV3.listMeetings.useQuery({ limit: 50 });
  const activePipelines = trpc.meetingsV3.listActivePipelines.useQuery({});
  const meetingDetail = trpc.meetingsV3.getMeeting.useQuery(
    { id: selectedMeeting?.id ?? 0 },
    { enabled: !!selectedMeeting?.id }
  );

  const createMeeting = trpc.meetingsV3.createMeeting.useMutation({
    onSuccess: () => {
      toast.success("Meeting scheduled");
      setShowMeetingDialog(false);
      setMeetingForm({ ...EMPTY_MEETING });
      utils.meetingsV3.listMeetings.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const generateAgenda = trpc.meetingsV3.generateAgenda.useMutation({
    onSuccess: (d) => { setAiAgendaItems(d.items); setShowAgendaDialog(true); },
    onError: (e) => toast.error(e.message),
  });

  const updateMeeting = trpc.meetingsV3.updateMeeting.useMutation({
    onSuccess: () => {
      toast.success("Minutes saved");
      setShowMinutesDialog(false);
      utils.meetingsV3.getMeeting.invalidate();
      utils.meetingsV3.listMeetings.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const extractDecisions = trpc.meetingsV3.extractDecisionsFromMinutes.useMutation({
    onSuccess: (d: any) => {
      setAiSummary(d.summary ?? "");
      toast.success(`${d.decisionsCreated ?? 0} decisions extracted`);
      utils.meetingsV3.getMeeting.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMeetingStatus = trpc.meetingsV3.updateMeeting.useMutation({
    onSuccess: () => { toast.success("Status updated"); utils.meetingsV3.listMeetings.invalidate(); utils.meetingsV3.getMeeting.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const initPipeline = trpc.meetingsV3.initPipeline.useMutation({
    onSuccess: (d: any) => {
      toast.success(`Pipeline created with ${d.stages} stages`);
      setShowPipelineDialog(false);
      utils.meetingsV3.listActivePipelines.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const transcribeAndExtract = trpc.meetingsV3.transcribeAndExtract.useMutation({
    onSuccess: (d) => {
      setTranscribeResult({ transcriptText: d.transcriptText, extractedDecisions: d.extractedDecisions });
      toast.success(`Transcribed! ${d.extractedDecisions} decisions extracted automatically.`);
      utils.meetingsV3.listMeetings.invalidate();
      utils.meetingsV3.getMeeting.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleAudioTranscribe = async () => {
    if (!audioFile || !selectedMeeting) return;
    setIsUploadingAudio(true);
    try {
      const fd = new FormData();
      fd.append("file", audioFile);
      const res = await fetch("/api/upload", { method: "POST", body: fd, credentials: "include" });
      if (!res.ok) throw new Error("Upload failed");
      const { url } = await res.json() as { url: string };
      transcribeAndExtract.mutate({ meetingId: selectedMeeting.id, audioUrl: url });
    } catch (e: any) {
      toast.error(e.message ?? "Audio upload failed");
    } finally {
      setIsUploadingAudio(false);
    }
  };

  const updatePipelineStage = trpc.meetingsV3.updatePipelineStage.useMutation({
    onSuccess: () => { toast.success("Stage updated"); utils.meetingsV3.listActivePipelines.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const handleOpenMinutes = (meeting: any) => {
    setSelectedMeeting(meeting);
    setMinutesText(meeting.minutesText ?? "");
    setShowMinutesDialog(true);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Meeting & Onboarding Suite</h1>
          <p className="text-sm text-gray-500 mt-1">Trustee meetings, AI agenda, minutes, decisions extraction, onboarding pipeline</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowPipelineDialog(true)}>
            <UserPlus className="h-4 w-4 mr-1" />Init Pipeline
          </Button>
          <Button size="sm" onClick={() => setShowMeetingDialog(true)}>
            <Plus className="h-4 w-4 mr-1" />Schedule Meeting
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="meetings">Meetings</TabsTrigger>
          <TabsTrigger value="onboarding">Onboarding / Offboarding</TabsTrigger>
        </TabsList>

        {/* ── Meetings Tab ── */}
        <TabsContent value="meetings" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Meeting list */}
            <div className="lg:col-span-1 space-y-3">
              <h3 className="text-sm font-semibold text-gray-700">All Meetings</h3>
              {meetings.isLoading ? (
                <div className="text-center text-gray-400 py-4">Loading...</div>
              ) : (meetings.data ?? []).length === 0 ? (
                <div className="text-center text-gray-400 py-4">No meetings scheduled.</div>
              ) : (meetings.data ?? []).map((m: any) => (
                <Card
                  key={m.id}
                  className={`cursor-pointer hover:shadow-md transition-shadow ${selectedMeeting?.id === m.id ? "ring-2 ring-indigo-500" : ""}`}
                  onClick={() => setSelectedMeeting(m)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{m.title}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{new Date(m.scheduledAt).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</p>
                        <p className="text-xs text-gray-400">{m.location ?? "No location"}</p>
                      </div>
                      <StatusBadge status={m.status} />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Meeting detail */}
            <div className="lg:col-span-2">
              {!selectedMeeting ? (
                <div className="flex items-center justify-center h-64 text-gray-400">
                  <div className="text-center">
                    <Calendar className="h-10 w-10 mx-auto mb-2 opacity-30" />
                    <p>Select a meeting to view details</p>
                  </div>
                </div>
              ) : (
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-base">{selectedMeeting.title}</CardTitle>
                        <p className="text-sm text-gray-500 mt-1">
                          {new Date(selectedMeeting.scheduledAt).toLocaleString("en-GB")} · {selectedMeeting.location ?? "No location"}
                        </p>
                      </div>
                      <StatusBadge status={selectedMeeting.status} />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Action buttons */}
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => generateAgenda.mutate({ meetingId: selectedMeeting.id, meetingType: selectedMeeting.meetingType })} disabled={generateAgenda.isPending}>
                        <Sparkles className="h-3.5 w-3.5 mr-1" />{generateAgenda.isPending ? "Generating..." : "AI Agenda"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleOpenMinutes(selectedMeeting)}>
                        <FileText className="h-3.5 w-3.5 mr-1" />Minutes
                      </Button>
                      {/* Audio transcription upload */}
                      <label className="cursor-pointer">
                        <input
                          type="file"
                          accept="audio/*"
                          className="hidden"
                          onChange={(e) => { setAudioFile(e.target.files?.[0] ?? null); setTranscribeResult(null); }}
                        />
                        <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border text-xs font-medium bg-white hover:bg-gray-50 cursor-pointer">
                          🎤 {audioFile ? audioFile.name.slice(0, 20) : "Upload Audio"}
                        </span>
                      </label>
                      {audioFile && (
                        <Button size="sm" variant="outline" onClick={handleAudioTranscribe} disabled={isUploadingAudio || transcribeAndExtract.isPending}>
                          <Sparkles className="h-3.5 w-3.5 mr-1" />
                          {isUploadingAudio ? "Uploading..." : transcribeAndExtract.isPending ? "Transcribing..." : "Transcribe & Extract"}
                        </Button>
                      )}
                      {selectedMeeting.transcriptText && (
                        <Button size="sm" variant="outline" onClick={() => extractDecisions.mutate({ meetingId: selectedMeeting.id, minutesText: selectedMeeting.transcriptText })} disabled={extractDecisions.isPending}>
                          <CheckSquare className="h-3.5 w-3.5 mr-1" />{extractDecisions.isPending ? "Extracting..." : "Extract Decisions"}
                        </Button>
                      )}
                      {selectedMeeting.status === "scheduled" && (
                        <Button size="sm" variant="outline" onClick={() => updateMeetingStatus.mutate({ id: selectedMeeting.id, status: "in_progress" })}>
                          Start Meeting
                        </Button>
                      )}
                      {selectedMeeting.status === "in_progress" && (
                        <Button size="sm" onClick={() => updateMeetingStatus.mutate({ id: selectedMeeting.id, status: "completed" })}>
                          Complete Meeting
                        </Button>
                      )}
                    </div>

                    {/* Quorum status */}
                    <div className="flex items-center gap-3 p-3 rounded-lg border bg-gray-50">
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-gray-600">Quorum</p>
                        <p className="text-sm">
                          Required: <strong>{(meetingDetail.data?.meeting ?? selectedMeeting).quorumRequired ?? 3} trustees</strong>
                          {(meetingDetail.data?.meeting ?? selectedMeeting).quorumMet
                            ? <span className="ml-2 text-green-600 font-medium">✓ Met</span>
                            : <span className="ml-2 text-red-500 font-medium">✗ Not confirmed</span>}
                        </p>
                      </div>
                      {selectedMeeting.status === "completed" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className={(meetingDetail.data?.meeting ?? selectedMeeting).quorumMet ? "border-red-300 text-red-600" : "border-green-300 text-green-600"}
                          onClick={() => updateMeetingStatus.mutate({ id: selectedMeeting.id, quorumMet: !(meetingDetail.data?.meeting ?? selectedMeeting).quorumMet })}
                          disabled={updateMeetingStatus.isPending}
                        >
                          {(meetingDetail.data?.meeting ?? selectedMeeting).quorumMet ? "Mark Quorum Not Met" : "Mark Quorum Met"}
                        </Button>
                      )}
                    </div>

                    {/* AI summary */}
                    {aiSummary && (
                      <div className="bg-indigo-50 rounded-lg p-4">
                        <p className="text-xs font-semibold text-indigo-700 mb-2 flex items-center gap-1"><Sparkles className="h-3 w-3" />AI Summary</p>
                        <p className="text-sm text-indigo-900 whitespace-pre-wrap">{aiSummary}</p>
                      </div>
                    )}

                    {/* Agenda items from getMeeting */}
                    {meetingDetail.data?.agenda && meetingDetail.data.agenda.length > 0 && (
                      <div>
                        <p className="text-sm font-semibold text-gray-700 mb-2">Agenda</p>
                        <ol className="space-y-1">
                          {meetingDetail.data.agenda.map((item: any, i: number) => (
                            <li key={item.id} className="flex items-start gap-2 text-sm">
                              <span className="text-gray-400 font-mono text-xs mt-0.5 w-5">{i + 1}.</span>
                              <span>{item.title}</span>
                              {item.presenter && <span className="text-gray-400 text-xs">({item.presenter})</span>}
                              {item.durationMinutes && <span className="text-gray-400 text-xs ml-auto">{item.durationMinutes}min</span>}
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}

                    {/* Audio transcription result */}
                    {transcribeResult && (
                      <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                        <p className="text-xs font-semibold text-indigo-700 mb-2 flex items-center gap-1">
                          <Sparkles className="h-3 w-3" />Transcription Complete
                        </p>
                        <p className="text-sm text-indigo-900">{transcribeResult.extractedDecisions} decisions extracted automatically.</p>
                        <p className="text-xs text-gray-600 mt-2 whitespace-pre-wrap max-h-32 overflow-y-auto">{transcribeResult.transcriptText.slice(0, 500)}{transcribeResult.transcriptText.length > 500 ? "..." : ""}</p>
                      </div>
                    )}

                    {/* Minutes preview */}
                    {selectedMeeting.transcriptText && (
                      <div>
                        <p className="text-sm font-semibold text-gray-700 mb-2">Minutes / Transcript</p>
                        <div className="bg-gray-50 rounded p-3 text-sm text-gray-700 max-h-40 overflow-y-auto whitespace-pre-wrap">
                          {selectedMeeting.transcriptText}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ── Onboarding/Offboarding Tab ── */}
        <TabsContent value="onboarding" className="space-y-4 mt-4">
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="p-3 text-left">Person</th>
                    <th className="p-3 text-left">Type</th>
                    <th className="p-3 text-left">Stage</th>
                    <th className="p-3 text-left">Status</th>
                    <th className="p-3 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {activePipelines.isLoading ? (
                    <tr><td colSpan={5} className="p-6 text-center text-gray-400">Loading...</td></tr>
                  ) : (activePipelines.data ?? []).length === 0 ? (
                    <tr><td colSpan={5} className="p-6 text-center text-gray-400">No active pipelines. Click "Init Pipeline" to start one.</td></tr>
                  ) : (activePipelines.data ?? []).map((group: any) => (
                    group.stages?.map((stage: any) => (
                      <tr key={stage.id} className="border-b hover:bg-gray-50">
                        <td className="p-3 font-medium">{group.userName ?? `User #${group.userId}`}</td>
                        <td className="p-3 capitalize">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${stage.pipelineType === "onboarding" ? "bg-green-100 text-green-800" : "bg-orange-100 text-orange-800"}`}>
                            {stage.pipelineType}
                          </span>
                        </td>
                        <td className="p-3 text-gray-600">{stage.stage?.replace(/_/g, " ")}</td>
                        <td className="p-3"><StatusBadge status={stage.status} /></td>
                        <td className="p-3">
                          {stage.status !== "completed" && (
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => updatePipelineStage.mutate({ id: stage.id, status: "completed" })} disabled={updatePipelineStage.isPending}>
                              <ChevronRight className="h-3 w-3 mr-1" />Complete
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Schedule Meeting Dialog */}
      <Dialog open={showMeetingDialog} onOpenChange={setShowMeetingDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Schedule Meeting</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Title *</Label>
              <Input value={meetingForm.title} onChange={e => setMeetingForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Q2 Trustee Board Meeting" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Meeting Type</Label>
                <Select value={meetingForm.meetingType} onValueChange={(v) => setMeetingForm(f => ({ ...f, meetingType: v as any }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{MEETING_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Date & Time *</Label>
                <Input type="datetime-local" value={meetingForm.scheduledAt} onChange={e => setMeetingForm(f => ({ ...f, scheduledAt: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Location</Label>
                <Input value={meetingForm.location} onChange={e => setMeetingForm(f => ({ ...f, location: e.target.value }))} placeholder="e.g. Hibba House, Room 1 / Zoom" />
              </div>
              <div>
                <Label>Quorum Required (trustees)</Label>
                <Input type="number" min={1} max={20} value={meetingForm.quorumRequired} onChange={e => setMeetingForm(f => ({ ...f, quorumRequired: parseInt(e.target.value) || 3 }))} />
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <textarea className="w-full border rounded p-3 text-sm h-20 resize-none" value={meetingForm.notes} onChange={e => setMeetingForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMeetingDialog(false)}>Cancel</Button>
            <Button onClick={() => createMeeting.mutate(meetingForm)} disabled={createMeeting.isPending || !meetingForm.title || !meetingForm.scheduledAt}>
              {createMeeting.isPending ? "Saving..." : "Schedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Minutes Dialog */}
      <Dialog open={showMinutesDialog} onOpenChange={setShowMinutesDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Meeting Minutes — {selectedMeeting?.title}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-gray-500">Record the meeting minutes below. After saving, use "Extract Decisions" to automatically create action items.</p>
            <textarea
              className="w-full border rounded p-3 text-sm h-64 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={minutesText}
              onChange={e => setMinutesText(e.target.value)}
              placeholder="Meeting called to order at 19:00...&#10;&#10;Attendees: Dr. Abdul Hamid, Galib Khan...&#10;&#10;DECISION: ...&#10;&#10;ACTION: [Name] to [task] by [date]..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMinutesDialog(false)}>Cancel</Button>
            <Button onClick={() => { updateMeeting.mutate({ id: selectedMeeting.id, transcriptText: minutesText }); setSelectedMeeting((m: any) => m ? { ...m, transcriptText: minutesText } : m); }} disabled={updateMeeting.isPending || !minutesText}>
              {updateMeeting.isPending ? "Saving..." : "Save Minutes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Agenda Dialog */}
      <Dialog open={showAgendaDialog} onOpenChange={setShowAgendaDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-indigo-500" />AI-Generated Agenda</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {aiAgendaItems.map((item, i) => (
              <div key={i} className="flex items-start gap-3 p-3 bg-indigo-50 rounded">
                <span className="text-indigo-500 font-bold text-sm w-5">{item.itemNumber}.</span>
                <div>
                  <p className="text-sm font-medium text-indigo-900">{item.title}</p>
                  {item.description && <p className="text-xs text-indigo-700 mt-0.5">{item.description}</p>}
                  {item.durationMinutes && <p className="text-xs text-indigo-500 mt-0.5">{item.durationMinutes} min</p>}
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button onClick={() => setShowAgendaDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Init Pipeline Dialog */}
      <Dialog open={showPipelineDialog} onOpenChange={setShowPipelineDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Initialise Onboarding Pipeline</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>User ID</Label>
              <Input type="number" value={pipelineForm.userId || ""} onChange={e => setPipelineForm(f => ({ ...f, userId: Number(e.target.value) }))} placeholder="Enter user ID" />
            </div>
            <div>
              <Label>Pipeline Type</Label>
              <Select value={pipelineForm.pipelineType} onValueChange={(v) => setPipelineForm(f => ({ ...f, pipelineType: v as any }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="onboarding">Onboarding</SelectItem>
                  <SelectItem value="offboarding">Offboarding</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPipelineDialog(false)}>Cancel</Button>
            <Button onClick={() => initPipeline.mutate(pipelineForm)} disabled={initPipeline.isPending || !pipelineForm.userId}>
              {initPipeline.isPending ? "Creating..." : "Create Pipeline"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
