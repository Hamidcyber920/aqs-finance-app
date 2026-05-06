import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Database, Download, RefreshCw, Shield, Clock, HardDrive, FileJson } from "lucide-react";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(ts: Date | string | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function BackupsPage() {
  const { user } = useAuth();
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  const isSenior = user?.role === "superadmin" || user?.role === "trustee";

  const { data: backups = [], isLoading, refetch } = trpc.backup.list.useQuery(undefined, {
    enabled: isSenior,
  });

  const createMutation = trpc.backup.create.useMutation({
    onSuccess: (result) => {
      toast.success(`Backup created: ${result.filename} (${formatBytes(result.sizeBytes)}, ${result.recordCount.toLocaleString()} records)`);
      refetch();
    },
    onError: (err) => toast.error(`Backup failed: ${err.message}`),
  });

  const downloadMutation = trpc.backup.download.useMutation({
    onSuccess: (result) => {
      window.open(result.url, "_blank");
    },
    onError: (err) => toast.error(`Download failed: ${err.message}`),
  });

  if (!isSenior) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
        <Shield className="w-12 h-12 text-muted-foreground" />
        <h2 className="text-xl font-semibold">Access Restricted</h2>
        <p className="text-muted-foreground max-w-sm">
          Only superadmins and trustees can access the backup system.
        </p>
      </div>
    );
  }

  const latestBackup = backups[0];

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Database className="w-6 h-6 text-primary" />
            System Backups
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Daily automated backups run at 02:00 UTC. All data is encrypted and stored in S3.
          </p>
        </div>
        <Button
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending}
          className="gap-2"
        >
          {createMutation.isPending ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Database className="w-4 h-4" />
          )}
          {createMutation.isPending ? "Creating backup…" : "Create Backup Now"}
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Total Backups</p>
            <p className="text-2xl font-bold">{backups.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Latest Backup</p>
            <p className="text-sm font-semibold">
              {latestBackup ? new Date(latestBackup.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "None"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Records (latest)</p>
            <p className="text-2xl font-bold">{latestBackup?.recordCount?.toLocaleString() ?? "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Size (latest)</p>
            <p className="text-sm font-semibold">{latestBackup ? formatBytes(latestBackup.sizeBytes) : "—"}</p>
          </CardContent>
        </Card>
      </div>

      {/* Schedule info */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="pt-4 pb-3 flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <Clock className="w-5 h-5 text-primary shrink-0 mt-0.5 sm:mt-0" />
          <div>
            <p className="font-medium text-sm">Automated Daily Schedule</p>
            <p className="text-xs text-muted-foreground">
              Backups run automatically every day at <strong>02:00 UTC</strong> (03:00 BST / 02:00 GMT).
              The last 30 backups are retained. Each backup captures all 22 database tables as a single JSON file stored in S3.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Backup list */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileJson className="w-4 h-4" />
            Backup History (last 30)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-center text-muted-foreground text-sm">Loading backups…</div>
          ) : backups.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm">
              No backups yet. Click "Create Backup Now" to create the first one.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[540px]">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-2">Date & Time</th>
                    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-2">Filename</th>
                    <th className="text-right text-xs font-medium text-muted-foreground px-4 py-2">Records</th>
                    <th className="text-right text-xs font-medium text-muted-foreground px-4 py-2">Size</th>
                    <th className="text-center text-xs font-medium text-muted-foreground px-4 py-2">Triggered By</th>
                    <th className="text-center text-xs font-medium text-muted-foreground px-4 py-2">Status</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {backups.map((b, idx) => (
                    <tr key={b.id} className={`border-b last:border-0 hover:bg-muted/20 transition-colors ${idx === 0 ? "bg-primary/5" : ""}`}>
                      <td className="px-4 py-3 text-sm whitespace-nowrap">
                        {formatDate(b.createdAt)}
                        {idx === 0 && <span className="ml-2 text-xs text-primary font-medium">Latest</span>}
                      </td>
                      <td className="px-4 py-3 text-xs font-mono text-muted-foreground truncate max-w-[180px]">
                        {b.filename}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-medium">
                        {b.recordCount.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-sm text-right">
                        <span className="flex items-center justify-end gap-1">
                          <HardDrive className="w-3 h-3 text-muted-foreground" />
                          {formatBytes(b.sizeBytes)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant={b.triggeredBy === "scheduled" ? "secondary" : "outline"} className="text-xs">
                          {b.triggeredBy === "scheduled" ? "Auto" : b.triggeredByName ?? "Manual"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant={b.status === "success" ? "default" : "destructive"} className="text-xs">
                          {b.status === "success" ? "✓ OK" : "✗ Failed"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="gap-1 h-7 px-2"
                          disabled={downloadingId === b.id}
                          onClick={async () => {
                            setDownloadingId(b.id);
                            try {
                              const result = await downloadMutation.mutateAsync({ s3Key: b.s3Key });
                              window.open(result.url, "_blank");
                            } finally {
                              setDownloadingId(null);
                            }
                          }}
                        >
                          <Download className="w-3 h-3" />
                          <span className="text-xs">Download</span>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
