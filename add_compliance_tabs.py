with open('client/src/pages/ComplianceCockpit.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Expand the TabsList from 3 to 5 columns
content = content.replace(
    '<TabsList className="grid w-full grid-cols-3 max-w-lg">',
    '<TabsList className="grid w-full grid-cols-5 max-w-3xl">'
)

# 2. Add two new tab triggers after the Policies trigger
old_policies_trigger = '''            <TabsTrigger value="policies">
              <FileText className="h-3.5 w-3.5 mr-1.5" />
              Policies
              {overduePolices > 0 && <span className="ml-1.5 bg-amber-500 text-white text-[10px] rounded-full px-1.5 py-0.5 font-bold">{overduePolices}</span>}
            </TabsTrigger>
          </TabsList>'''

new_policies_trigger = '''            <TabsTrigger value="policies">
              <FileText className="h-3.5 w-3.5 mr-1.5" />
              Policies
              {overduePolices > 0 && <span className="ml-1.5 bg-amber-500 text-white text-[10px] rounded-full px-1.5 py-0.5 font-bold">{overduePolices}</span>}
            </TabsTrigger>
            <TabsTrigger value="incidents">
              <AlertTriangle className="h-3.5 w-3.5 mr-1.5" />
              Incidents
              {incidents.filter((i: any) => i.status !== 'closed').length > 0 && <span className="ml-1.5 bg-red-500 text-white text-[10px] rounded-full px-1.5 py-0.5 font-bold">{incidents.filter((i: any) => i.status !== 'closed').length}</span>}
            </TabsTrigger>
            <TabsTrigger value="annual">
              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
              Annual Return
            </TabsTrigger>
          </TabsList>'''

content = content.replace(old_policies_trigger, new_policies_trigger)

# 3. Add queries for incidents and annual returns (after the policies query)
old_queries = '  const { data: policies = [], isLoading: policiesLoading, refetch: refetchPolicies } = (trpc as any).compliance.listPolicies.useQuery();'
new_queries = '''  const { data: policies = [], isLoading: policiesLoading, refetch: refetchPolicies } = (trpc as any).compliance.listPolicies.useQuery();
  const { data: incidents = [], isLoading: incidentsLoading, refetch: refetchIncidents } = (trpc as any).compliance.listIncidents.useQuery();
  const { data: annualReturns = [], isLoading: annualReturnsLoading, refetch: refetchAnnualReturns } = (trpc as any).compliance.listAnnualReturns.useQuery();
  const [incidentDialog, setIncidentDialog] = useState<{ open: boolean; item?: any }>({ open: false });
  const [annualReturnDialog, setAnnualReturnDialog] = useState<{ open: boolean; item?: any }>({ open: false });'''

content = content.replace(old_queries, new_queries)

# 4. Add the new TabsContent sections before the closing </Tabs>
old_tabs_close = '''        </Tabs>
      </div>
      {/* Action Dialog */}'''

new_tabs_content = '''          {/* ── Serious Incidents ── */}
          <TabsContent value="incidents" className="mt-4">
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-base">Serious Incident Register</CardTitle>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => refetchIncidents()}><RefreshCw className="h-3.5 w-3.5" /></Button>
                  {isAdmin && <Button size="sm" onClick={() => setIncidentDialog({ open: true })}><Plus className="h-3.5 w-3.5 mr-1" />Report Incident</Button>}
                </div>
              </CardHeader>
              <CardContent>
                {incidentsLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : incidents.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <ShieldCheck className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No serious incidents recorded</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-border text-muted-foreground text-xs">
                        <th className="text-left py-2 pr-3">Date</th>
                        <th className="text-left py-2 pr-3">Title</th>
                        <th className="text-left py-2 pr-3">Category</th>
                        <th className="text-left py-2 pr-3">Severity</th>
                        <th className="text-left py-2 pr-3">Status</th>
                        <th className="text-left py-2 pr-3">CC Ref</th>
                        {isAdmin && <th className="text-right py-2">Actions</th>}
                      </tr></thead>
                      <tbody>
                        {incidents.map((inc: any) => (
                          <tr key={inc.id} className="border-b border-border/50 hover:bg-muted/30">
                            <td className="py-2 pr-3 text-xs text-muted-foreground">{fmtDate(inc.incidentDate)}</td>
                            <td className="py-2 pr-3 font-medium max-w-xs truncate">{inc.title}</td>
                            <td className="py-2 pr-3 capitalize text-xs">{inc.category?.replace(/_/g, ' ')}</td>
                            <td className="py-2 pr-3">{priorityBadge(inc.severity)}</td>
                            <td className="py-2 pr-3">{statusBadge(inc.status)}</td>
                            <td className="py-2 pr-3 text-xs text-muted-foreground">{inc.charityCommissionRef || '—'}</td>
                            {isAdmin && <td className="py-2 text-right"><Button variant="ghost" size="sm" onClick={() => setIncidentDialog({ open: true, item: inc })}><Pencil className="h-3.5 w-3.5" /></Button></td>}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Annual Return ── */}
          <TabsContent value="annual" className="mt-4">
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-base">Annual Return Tracker</CardTitle>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => refetchAnnualReturns()}><RefreshCw className="h-3.5 w-3.5" /></Button>
                  {isAdmin && <Button size="sm" onClick={() => setAnnualReturnDialog({ open: true })}><Plus className="h-3.5 w-3.5 mr-1" />Add Return</Button>}
                </div>
              </CardHeader>
              <CardContent>
                {annualReturnsLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : annualReturns.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No annual returns recorded yet</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-border text-muted-foreground text-xs">
                        <th className="text-left py-2 pr-3">Year</th>
                        <th className="text-left py-2 pr-3">Year End</th>
                        <th className="text-left py-2 pr-3">Deadline</th>
                        <th className="text-left py-2 pr-3">Status</th>
                        <th className="text-left py-2 pr-3">Income</th>
                        <th className="text-left py-2 pr-3">Expenditure</th>
                        <th className="text-left py-2 pr-3">CC Ref</th>
                        {isAdmin && <th className="text-right py-2">Actions</th>}
                      </tr></thead>
                      <tbody>
                        {annualReturns.map((ar: any) => {
                          const deadlineDays = daysUntil(ar.submissionDeadline);
                          return (
                            <tr key={ar.id} className="border-b border-border/50 hover:bg-muted/30">
                              <td className="py-2 pr-3 font-medium">{ar.financialYear}</td>
                              <td className="py-2 pr-3 text-xs text-muted-foreground">{fmtDate(ar.yearEndDate)}</td>
                              <td className="py-2 pr-3 text-xs">
                                {fmtDate(ar.submissionDeadline)}
                                {deadlineDays !== null && deadlineDays <= 30 && ar.status !== 'submitted' && (
                                  <span className={`ml-1 text-[10px] font-bold ${deadlineDays < 0 ? 'text-red-400' : 'text-amber-400'}`}>
                                    {deadlineDays < 0 ? `${Math.abs(deadlineDays)}d overdue` : `${deadlineDays}d left`}
                                  </span>
                                )}
                              </td>
                              <td className="py-2 pr-3">{statusBadge(ar.status)}</td>
                              <td className="py-2 pr-3 text-xs">{ar.totalIncome ? `£${parseFloat(ar.totalIncome).toLocaleString('en-GB', { minimumFractionDigits: 0 })}` : '—'}</td>
                              <td className="py-2 pr-3 text-xs">{ar.totalExpenditure ? `£${parseFloat(ar.totalExpenditure).toLocaleString('en-GB', { minimumFractionDigits: 0 })}` : '—'}</td>
                              <td className="py-2 pr-3 text-xs text-muted-foreground">{ar.charityCommissionRef || '—'}</td>
                              {isAdmin && <td className="py-2 text-right"><Button variant="ghost" size="sm" onClick={() => setAnnualReturnDialog({ open: true, item: ar })}><Pencil className="h-3.5 w-3.5" /></Button></td>}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
      {/* Action Dialog */}'''

content = content.replace(old_tabs_close, new_tabs_content)

# 5. Add Incident Dialog and Annual Return Dialog before the closing DashboardLayout
old_close = '''    </DashboardLayout>
  );
}'''

new_close = '''      {/* Incident Dialog */}
      <Dialog open={incidentDialog.open} onOpenChange={o => !o && setIncidentDialog({ open: false })}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{incidentDialog.item ? "Edit Incident" : "Report Serious Incident"}</DialogTitle>
          </DialogHeader>
          <IncidentForm
            initial={incidentDialog.item}
            onClose={() => setIncidentDialog({ open: false })}
            onSaved={() => { setIncidentDialog({ open: false }); refetchIncidents(); }}
          />
        </DialogContent>
      </Dialog>
      {/* Annual Return Dialog */}
      <Dialog open={annualReturnDialog.open} onOpenChange={o => !o && setAnnualReturnDialog({ open: false })}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{annualReturnDialog.item ? "Edit Annual Return" : "Add Annual Return"}</DialogTitle>
          </DialogHeader>
          <AnnualReturnForm
            initial={annualReturnDialog.item}
            onClose={() => setAnnualReturnDialog({ open: false })}
            onSaved={() => { setAnnualReturnDialog({ open: false }); refetchAnnualReturns(); }}
          />
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}'''

content = content.replace(old_close, new_close)

# 6. Add IncidentForm and AnnualReturnForm components before the main export
incident_form = '''
// ─── Incident Form ────────────────────────────────────────────────────────────
function IncidentForm({ initial, onClose, onSaved }: { initial?: any; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    incidentDate: initial?.incidentDate ? new Date(initial.incidentDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    title: initial?.title ?? "",
    description: initial?.description ?? "",
    category: initial?.category ?? "other",
    severity: initial?.severity ?? "medium",
    status: initial?.status ?? "draft",
    charityCommissionRef: initial?.charityCommissionRef ?? "",
    reportedToCC: initial?.reportedToCC ?? false,
    reportedToCCDate: initial?.reportedToCCDate ? new Date(initial.reportedToCCDate).toISOString().split('T')[0] : "",
    actionsTaken: initial?.actionsTaken ?? "",
    outcome: initial?.outcome ?? "",
  });
  const utils = (trpc as any).useUtils();
  const upsert = (trpc as any).compliance.upsertIncident.useMutation({
    onSuccess: () => { utils.compliance.listIncidents.invalidate(); toast.success(initial ? "Incident updated" : "Incident reported"); onSaved(); },
    onError: (e: any) => toast.error(e.message),
  });
  const f = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Incident Date</Label><Input type="date" value={form.incidentDate} onChange={e => f('incidentDate', e.target.value)} /></div>
        <div><Label>Severity</Label>
          <Select value={form.severity} onValueChange={v => f('severity', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {['critical','high','medium','low'].map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div><Label>Title *</Label><Input value={form.title} onChange={e => f('title', e.target.value)} placeholder="Brief description of incident" /></div>
      <div><Label>Category</Label>
        <Select value={form.category} onValueChange={v => f('category', v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {['financial_crime','safeguarding','data_breach','fraud','terrorism','money_laundering','governance','other'].map(c => <SelectItem key={c} value={c} className="capitalize">{c.replace(/_/g,' ')}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div><Label>Description *</Label><Textarea value={form.description} onChange={e => f('description', e.target.value)} rows={3} placeholder="Full description of what happened" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Status</Label>
          <Select value={form.status} onValueChange={v => f('status', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {['draft','reported_to_cc','under_investigation','closed'].map(s => <SelectItem key={s} value={s} className="capitalize">{s.replace(/_/g,' ')}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div><Label>CC Reference</Label><Input value={form.charityCommissionRef} onChange={e => f('charityCommissionRef', e.target.value)} placeholder="CC ref number" /></div>
      </div>
      <div><Label>Actions Taken</Label><Textarea value={form.actionsTaken} onChange={e => f('actionsTaken', e.target.value)} rows={2} /></div>
      <div><Label>Outcome</Label><Textarea value={form.outcome} onChange={e => f('outcome', e.target.value)} rows={2} /></div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={() => upsert.mutate({ ...form, id: initial?.id })} disabled={!form.title || !form.description || upsert.isPending}>
          {upsert.isPending ? "Saving…" : initial ? "Update" : "Report"}
        </Button>
      </DialogFooter>
    </div>
  );
}

// ─── Annual Return Form ───────────────────────────────────────────────────────
function AnnualReturnForm({ initial, onClose, onSaved }: { initial?: any; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    financialYear: initial?.financialYear ?? "",
    yearEndDate: initial?.yearEndDate ? new Date(initial.yearEndDate).toISOString().split('T')[0] : "",
    submissionDeadline: initial?.submissionDeadline ? new Date(initial.submissionDeadline).toISOString().split('T')[0] : "",
    status: initial?.status ?? "not_started",
    totalIncome: initial?.totalIncome ?? "",
    totalExpenditure: initial?.totalExpenditure ?? "",
    charityCommissionRef: initial?.charityCommissionRef ?? "",
    notes: initial?.notes ?? "",
  });
  const utils = (trpc as any).useUtils();
  const upsert = (trpc as any).compliance.upsertAnnualReturn.useMutation({
    onSuccess: () => { utils.compliance.listAnnualReturns.invalidate(); toast.success(initial ? "Annual return updated" : "Annual return added"); onSaved(); },
    onError: (e: any) => toast.error(e.message),
  });
  const f = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Financial Year *</Label><Input value={form.financialYear} onChange={e => f('financialYear', e.target.value)} placeholder="e.g. 2024-25" /></div>
        <div><Label>Status</Label>
          <Select value={form.status} onValueChange={v => f('status', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {['not_started','in_progress','submitted','overdue'].map(s => <SelectItem key={s} value={s} className="capitalize">{s.replace(/_/g,' ')}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Year End Date *</Label><Input type="date" value={form.yearEndDate} onChange={e => f('yearEndDate', e.target.value)} /></div>
        <div><Label>Submission Deadline *</Label><Input type="date" value={form.submissionDeadline} onChange={e => f('submissionDeadline', e.target.value)} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Total Income (£)</Label><Input type="number" value={form.totalIncome} onChange={e => f('totalIncome', e.target.value)} placeholder="0.00" /></div>
        <div><Label>Total Expenditure (£)</Label><Input type="number" value={form.totalExpenditure} onChange={e => f('totalExpenditure', e.target.value)} placeholder="0.00" /></div>
      </div>
      <div><Label>CC Reference</Label><Input value={form.charityCommissionRef} onChange={e => f('charityCommissionRef', e.target.value)} placeholder="Charity Commission reference" /></div>
      <div><Label>Notes</Label><Textarea value={form.notes} onChange={e => f('notes', e.target.value)} rows={2} /></div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={() => upsert.mutate({ ...form, id: initial?.id })} disabled={!form.financialYear || !form.yearEndDate || !form.submissionDeadline || upsert.isPending}>
          {upsert.isPending ? "Saving…" : initial ? "Update" : "Add"}
        </Button>
      </DialogFooter>
    </div>
  );
}

'''

# Insert before the main export
main_export_marker = '// ─── Main Page ────────────────────────────────────────────────────────────────'
content = content.replace(main_export_marker, incident_form + main_export_marker)

with open('client/src/pages/ComplianceCockpit.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("SUCCESS: Added Serious Incidents and Annual Return tabs to ComplianceCockpit.tsx")
