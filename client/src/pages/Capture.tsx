import { useCallback, useRef, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Camera, Upload, X, CheckCircle, Loader2, RefreshCw, ImageIcon, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { uploadReceiptFile } from "@/lib/uploadReceipt";

type UploadState = "idle" | "uploading" | "processing" | "done" | "error";

export default function CapturePage() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  // Camera state
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Upload state
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [processedReceiptId, setProcessedReceiptId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processMutation = trpc.receipts.process.useMutation({
    onSuccess: (data) => {
      setUploadState("done");
      setProcessedReceiptId(data.data?.id ?? null);
      toast.success("Receipt processed successfully!", {
        description: `Vendor: ${data.data?.vendor ?? "Unknown"} — £${data.data?.amount ?? 0}`,
      });
      utils.receipts.list.invalidate();
    },
    onError: (err) => {
      setUploadState("error");
      toast.error("Processing failed", { description: err.message });
    },
  });

  // ── Camera ────────────────────────────────────────────────────────────────

  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraActive(true);
        setCapturedImage(null);
      }
    } catch (err) {
      setCameraError("Camera access denied or not available. Please use file upload instead.");
    }
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      setCapturedBlob(blob);
      setCapturedImage(canvas.toDataURL("image/jpeg", 0.9));
      stopCamera();
    }, "image/jpeg", 0.9);
  };

  const retakePhoto = () => {
    setCapturedImage(null);
    setCapturedBlob(null);
    startCamera();
  };

  const processCapture = async () => {
    if (!capturedBlob) return;
    const file = new File([capturedBlob], `receipt-${Date.now()}.jpg`, { type: "image/jpeg" });
    await processFile(file);
  };

  // ── File Upload ───────────────────────────────────────────────────────────

  const processFile = async (file: File) => {
    setSelectedFile(file);
    if (file.type.startsWith("image/")) {
      setPreviewUrl(URL.createObjectURL(file));
    } else {
      setPreviewUrl(null);
    }
    setUploadState("uploading");
    setUploadProgress(20);

    try {
      const { receiptId } = await uploadReceiptFile(file, utils);
      setUploadProgress(60);
      setUploadState("processing");
      await processMutation.mutateAsync({ receiptId });
      setUploadProgress(100);
    } catch (err) {
      setUploadState("error");
      toast.error("Upload failed", { description: (err as Error).message });
    }
  };

  const handleFileSelect = (file: File) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!allowed.includes(file.type)) {
      toast.error("Unsupported file type", { description: "Please upload JPG, PNG, WebP, or PDF files." });
      return;
    }
    if (file.size > 16 * 1024 * 1024) {
      toast.error("File too large", { description: "Maximum file size is 16MB." });
      return;
    }
    processFile(file);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, []);

  const resetUpload = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setUploadState("idle");
    setUploadProgress(0);
    setProcessedReceiptId(null);
    setCapturedImage(null);
    setCapturedBlob(null);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Capture Receipt</h1>
        <p className="text-muted-foreground mt-1">
          Take a photo or upload a receipt file to automatically extract and categorize expenses.
        </p>
      </div>

      {/* Success state */}
      {uploadState === "done" && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                <CheckCircle className="h-6 w-6 text-green-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-green-800">Receipt processed successfully</p>
                <p className="text-sm text-green-600 mt-0.5">
                  The data has been extracted and categorized automatically.
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                {processedReceiptId && (
                  <Button size="sm" onClick={() => setLocation(`/receipts/${processedReceiptId}`)}>
                    View Receipt
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={resetUpload}>
                  <RefreshCw className="h-4 w-4 mr-1" />
                  New Receipt
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Processing progress */}
      {(uploadState === "uploading" || uploadState === "processing") && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <div>
                <p className="font-medium">
                  {uploadState === "uploading" ? "Uploading receipt..." : "AI is extracting data..."}
                </p>
                <p className="text-sm text-muted-foreground">
                  {uploadState === "processing"
                    ? "Analysing vendor, amounts, and categorising expense..."
                    : "Securely uploading to cloud storage..."}
                </p>
              </div>
            </div>
            <Progress value={uploadProgress} className="h-2" />
          </CardContent>
        </Card>
      )}

      {uploadState === "idle" && (
        <Tabs defaultValue="camera">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="camera" className="gap-2">
              <Camera className="h-4 w-4" />
              Camera
            </TabsTrigger>
            <TabsTrigger value="upload" className="gap-2">
              <Upload className="h-4 w-4" />
              Upload File
            </TabsTrigger>
          </TabsList>

          {/* Camera Tab */}
          <TabsContent value="camera" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Camera Capture</CardTitle>
                <CardDescription>
                  Use your device camera to take a photo of a receipt.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {cameraError && (
                  <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
                    {cameraError}
                  </div>
                )}

                {/* Camera preview */}
                <div className="relative rounded-xl overflow-hidden bg-black aspect-[4/3] w-full">
                  <video
                    ref={videoRef}
                    className={`w-full h-full object-cover ${cameraActive ? "block" : "hidden"}`}
                    playsInline
                    muted
                  />
                  <canvas ref={canvasRef} className="hidden" />

                  {capturedImage && (
                    <img
                      src={capturedImage}
                      alt="Captured receipt"
                      className="w-full h-full object-contain"
                    />
                  )}

                  {!cameraActive && !capturedImage && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-white/60">
                      <Camera className="h-16 w-16" />
                      <p className="text-sm">Camera preview will appear here</p>
                    </div>
                  )}

                  {cameraActive && (
                    <div className="absolute inset-0 pointer-events-none">
                      <div className="absolute inset-8 border-2 border-white/40 rounded-lg" />
                      <div className="absolute top-10 left-10 w-6 h-6 border-t-2 border-l-2 border-white rounded-tl-sm" />
                      <div className="absolute top-10 right-10 w-6 h-6 border-t-2 border-r-2 border-white rounded-tr-sm" />
                      <div className="absolute bottom-10 left-10 w-6 h-6 border-b-2 border-l-2 border-white rounded-bl-sm" />
                      <div className="absolute bottom-10 right-10 w-6 h-6 border-b-2 border-r-2 border-white rounded-br-sm" />
                    </div>
                  )}
                </div>

                <div className="flex gap-3 justify-center">
                  {!cameraActive && !capturedImage && (
                    <Button onClick={startCamera} className="gap-2" size="lg">
                      <Camera className="h-5 w-5" />
                      Start Camera
                    </Button>
                  )}
                  {cameraActive && (
                    <>
                      <Button onClick={capturePhoto} size="lg" className="gap-2">
                        <Camera className="h-5 w-5" />
                        Capture
                      </Button>
                      <Button onClick={stopCamera} variant="outline" size="lg">
                        Cancel
                      </Button>
                    </>
                  )}
                  {capturedImage && (
                    <>
                      <Button onClick={processCapture} size="lg" className="gap-2">
                        <CheckCircle className="h-5 w-5" />
                        Process Receipt
                      </Button>
                      <Button onClick={retakePhoto} variant="outline" size="lg" className="gap-2">
                        <RefreshCw className="h-4 w-4" />
                        Retake
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Upload Tab */}
          <TabsContent value="upload" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Upload Receipt File</CardTitle>
                <CardDescription>
                  Drag and drop a receipt image or PDF, or click to browse.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`
                    border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all
                    ${dragOver
                      ? "border-primary bg-primary/5 scale-[1.01]"
                      : "border-border hover:border-primary/50 hover:bg-muted/30"
                    }
                  `}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileSelect(file);
                    }}
                  />
                  <div className="flex flex-col items-center gap-4">
                    <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center">
                      <Upload className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">
                        {dragOver ? "Drop your receipt here" : "Drop receipt here or click to browse"}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Supports JPG, PNG, WebP, and PDF — up to 16MB
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Badge variant="secondary" className="gap-1">
                        <ImageIcon className="h-3 w-3" /> Images
                      </Badge>
                      <Badge variant="secondary" className="gap-1">
                        <FileText className="h-3 w-3" /> PDF
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* Tips */}
      {uploadState === "idle" && (
        <Card className="bg-muted/30 border-dashed">
          <CardContent className="pt-4 pb-4">
            <p className="text-sm font-medium text-foreground mb-2">Tips for best results</p>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• Ensure the entire receipt is visible and well-lit</li>
              <li>• Avoid shadows or glare on the receipt</li>
              <li>• Keep the receipt flat and unfolded</li>
              <li>• Higher resolution images produce more accurate results</li>
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
