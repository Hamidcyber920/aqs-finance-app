import { useRef, useEffect, useState, useCallback } from "react";
import SignaturePadLib from "signature_pad";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PenLine, Upload, Trash2, Check } from "lucide-react";

interface SignaturePadProps {
  /** Called with a base64 PNG data-URL when the user confirms the signature */
  onSave: (dataUrl: string) => void;
  /** Optional existing signature URL to display */
  existingUrl?: string | null;
  label?: string;
  disabled?: boolean;
}

export function SignaturePad({ onSave, existingUrl, label = "Signature", disabled = false }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePadLib | null>(null);
  const [tab, setTab] = useState<"draw" | "upload">("draw");
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isEmpty, setIsEmpty] = useState(true);

  // Initialise signature pad on canvas mount
  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;

    // Scale canvas for retina displays
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.scale(ratio, ratio);

    padRef.current = new SignaturePadLib(canvas, {
      backgroundColor: "rgb(255, 255, 255)",
      penColor: "#1a1a1a",
      minWidth: 1,
      maxWidth: 3,
    });

    padRef.current.addEventListener("endStroke", () => {
      setIsEmpty(padRef.current?.isEmpty() ?? true);
      setSaved(false);
    });

    return () => {
      padRef.current?.off();
    };
  }, [tab]); // re-init when switching to draw tab

  const handleClear = useCallback(() => {
    padRef.current?.clear();
    setIsEmpty(true);
    setSaved(false);
  }, []);

  const handleSaveDraw = useCallback(() => {
    if (!padRef.current || padRef.current.isEmpty()) return;
    const dataUrl = padRef.current.toDataURL("image/png");
    onSave(dataUrl);
    setSaved(true);
  }, [onSave]);

  const handleUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      setUploadPreview(result);
      setSaved(false);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleSaveUpload = useCallback(() => {
    if (!uploadPreview) return;
    onSave(uploadPreview);
    setSaved(true);
  }, [uploadPreview, onSave]);

  if (disabled && existingUrl) {
    return (
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <div className="border rounded-lg p-2 bg-white">
          <img src={existingUrl} alt="Signature" className="h-16 object-contain" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      {existingUrl && !saved && (
        <div className="border rounded-lg p-2 bg-white mb-2">
          <p className="text-xs text-muted-foreground mb-1">Current signature:</p>
          <img src={existingUrl} alt="Current signature" className="h-12 object-contain" />
        </div>
      )}
      <Tabs value={tab} onValueChange={(v) => { setTab(v as "draw" | "upload"); setSaved(false); setUploadPreview(null); }}>
        <TabsList className="w-full">
          <TabsTrigger value="draw" className="flex-1 gap-1.5">
            <PenLine className="h-3.5 w-3.5" /> Draw
          </TabsTrigger>
          <TabsTrigger value="upload" className="flex-1 gap-1.5">
            <Upload className="h-3.5 w-3.5" /> Upload
          </TabsTrigger>
        </TabsList>

        <TabsContent value="draw" className="mt-2 space-y-2">
          <div className="relative border-2 border-dashed rounded-lg overflow-hidden bg-white" style={{ height: 120 }}>
            <canvas
              ref={canvasRef}
              className="w-full h-full touch-none cursor-crosshair"
              style={{ touchAction: "none" }}
            />
            {isEmpty && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <p className="text-xs text-muted-foreground">Sign here with your finger or mouse</p>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={handleClear} className="gap-1.5">
              <Trash2 className="h-3.5 w-3.5" /> Clear
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSaveDraw}
              disabled={isEmpty || saved}
              className="gap-1.5 flex-1"
            >
              {saved ? <><Check className="h-3.5 w-3.5" /> Saved</> : "Save Signature"}
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="upload" className="mt-2 space-y-2">
          <label className="flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-4 cursor-pointer hover:bg-muted/50 transition-colors bg-white" style={{ minHeight: 100 }}>
            <Upload className="h-6 w-6 text-muted-foreground mb-2" />
            <span className="text-xs text-muted-foreground text-center">
              Click to upload a signature image<br />(PNG, JPG, or SVG)
            </span>
            <input type="file" accept="image/*" className="hidden" onChange={handleUpload} />
          </label>
          {uploadPreview && (
            <div className="border rounded-lg p-2 bg-white">
              <img src={uploadPreview} alt="Signature preview" className="h-16 object-contain mx-auto" />
            </div>
          )}
          <Button
            type="button"
            size="sm"
            onClick={handleSaveUpload}
            disabled={!uploadPreview || saved}
            className="gap-1.5 w-full"
          >
            {saved ? <><Check className="h-3.5 w-3.5" /> Saved</> : "Use This Signature"}
          </Button>
        </TabsContent>
      </Tabs>
    </div>
  );
}
