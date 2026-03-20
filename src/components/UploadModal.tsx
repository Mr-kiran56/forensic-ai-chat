import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, X, FileText, Check, Loader2, AlertCircle, Sparkles } from "lucide-react";
import { uploadFile, processData, setState } from "@/data/mockData";

interface UploadModalProps {
  open: boolean;
  onClose: () => void;
}

type FileType = "cdr" | "tower" | "ipdr";

interface FileSlot {
  endpoint: FileType;
  label: string;
  description: string;
  color: string;
  accentColor: string;
  icon: string;
  file: File | null;
  status: "idle" | "uploading" | "done" | "error";
  rows?: number;
  error?: string;
}

const INITIAL_SLOTS: FileSlot[] = [
  {
    endpoint: "cdr",
    label: "CDR Data",
    description: "Call Detail Records (.xlsx)",
    color: "hsl(187 80% 50%)",
    accentColor: "hsl(187 80% 50% / 0.12)",
    icon: "📞",
    file: null,
    status: "idle",
  },
  {
    endpoint: "tower",
    label: "Tower Dump",
    description: "Cell Tower Logs (.xlsx)",
    color: "hsl(270 60% 60%)",
    accentColor: "hsl(270 60% 60% / 0.12)",
    icon: "🗼",
    file: null,
    status: "idle",
  },
  {
    endpoint: "ipdr",
    label: "IPDR Logs",
    description: "Internet Protocol Records (.xlsx)",
    color: "hsl(200 80% 55%)",
    accentColor: "hsl(200 80% 55% / 0.12)",
    icon: "🌐",
    file: null,
    status: "idle",
  },
];

export function UploadModal({ open, onClose }: UploadModalProps) {
  const [slots, setSlots] = useState<FileSlot[]>(INITIAL_SLOTS);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [analyzeSuccess, setAnalyzeSuccess] = useState(false);

  const updateSlot = (endpoint: FileType, patch: Partial<FileSlot>) => {
    setSlots(prev => prev.map(s => s.endpoint === endpoint ? { ...s, ...patch } : s));
  };

  const handleFilePick = (endpoint: FileType) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".xlsx,.xls";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      updateSlot(endpoint, { file, status: "uploading", error: undefined });
      try {
        const result = await uploadFile(endpoint, file);
        updateSlot(endpoint, { status: "done", rows: result.rows_loaded });
      } catch (err) {
        updateSlot(endpoint, { status: "error", error: String(err) });
      }
    };
    input.click();
  };

  const handleDrop = useCallback((endpoint: FileType, e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    // trigger same upload path
    const fakeEvent = { target: { files: [file] } } as unknown as Event;
    const input = document.createElement("input");
    const synth = Object.assign(input, { files: [file] });
    // just call the upload directly
    updateSlot(endpoint, { file, status: "uploading", error: undefined });
    uploadFile(endpoint, file)
      .then(result => updateSlot(endpoint, { status: "done", rows: result.rows_loaded }))
      .catch(err => updateSlot(endpoint, { status: "error", error: String(err) }));
  }, []);

  const allDone = slots.filter(s => s.status === "done").length > 0;
  const cdrDone = slots.find(s => s.endpoint === "cdr")?.status === "done";

  const handleAnalyze = async () => {
    if (!cdrDone) return;
    setAnalyzing(true);
    setAnalyzeError(null);
    try {
      await processData();
      setAnalyzeSuccess(true);
      setTimeout(() => {
        onClose();
        setAnalyzeSuccess(false);
        setSlots(INITIAL_SLOTS);
      }, 1200);
    } catch (err) {
      setAnalyzeError(String(err));
    } finally {
      setAnalyzing(false);
    }
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          transition={{ type: "spring", damping: 24, stiffness: 320 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                <Upload className="h-3.5 w-3.5 text-primary" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-foreground">Upload Forensic Files</h2>
                <p className="text-xs text-muted-foreground">CDR · Tower Dump · IPDR — Excel format</p>
              </div>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-secondary">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* File Slots */}
          <div className="p-6 space-y-3">
            {slots.map((slot) => (
              <motion.div
                key={slot.endpoint}
                layout
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => handleDrop(slot.endpoint, e)}
                onClick={() => slot.status !== "uploading" && handleFilePick(slot.endpoint)}
                style={{
                  background: slot.status === "done" ? slot.accentColor : "transparent",
                  borderColor: slot.status === "done" ? slot.color + "60" : "hsl(var(--border))",
                }}
                className="flex items-center gap-4 border rounded-xl px-4 py-3.5 cursor-pointer transition-all hover:border-primary/30 hover:bg-secondary/30 group"
              >
                {/* Icon */}
                <div
                  style={{ background: slot.status === "done" ? slot.color + "20" : "hsl(var(--secondary))" }}
                  className="w-10 h-10 rounded-lg flex items-center justify-center text-lg shrink-0 transition-colors"
                >
                  {slot.icon}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{slot.label}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {slot.status === "done"
                      ? `✓ ${slot.rows?.toLocaleString()} rows loaded`
                      : slot.status === "error"
                      ? `⚠ ${slot.error?.slice(0, 40)}`
                      : slot.file
                      ? slot.file.name
                      : slot.description}
                  </p>
                </div>

                {/* Status */}
                <div className="shrink-0">
                  {slot.status === "idle" && (
                    <span className="text-xs text-muted-foreground border border-border rounded-md px-2 py-1 group-hover:border-primary/40 group-hover:text-primary transition-colors">
                      Browse
                    </span>
                  )}
                  {slot.status === "uploading" && (
                    <Loader2 className="h-4 w-4 text-primary animate-spin" />
                  )}
                  {slot.status === "done" && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      style={{ color: slot.color }}
                    >
                      <Check className="h-4 w-4" />
                    </motion.div>
                  )}
                  {slot.status === "error" && (
                    <AlertCircle className="h-4 w-4 text-destructive" />
                  )}
                </div>
              </motion.div>
            ))}
          </div>

          {/* Rules reminder */}
          <div className="px-6 pb-4">
            <div className="bg-secondary/40 rounded-lg p-3 text-xs text-muted-foreground leading-relaxed">
              <span className="text-foreground font-medium">9 forensic rules active: </span>
              Late-night calls · Long duration · Weak signal · Dark web · Fraud sites · VPN usage · High data · IMEI swap · Call frequency
            </div>
          </div>

          {/* Analyze button */}
          <div className="px-6 pb-6">
            {analyzeError && (
              <p className="text-xs text-destructive mb-3 text-center">{analyzeError}</p>
            )}
            <button
              onClick={handleAnalyze}
              disabled={!cdrDone || analyzing || analyzeSuccess}
              className="w-full py-3 rounded-xl font-medium text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: analyzeSuccess
                  ? "hsl(140 60% 45%)"
                  : "hsl(var(--primary))",
                color: "hsl(var(--primary-foreground))",
              }}
            >
              {analyzeSuccess ? (
                <>
                  <Check className="h-4 w-4" />
                  Analysis Complete!
                </>
              ) : analyzing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Merging & Analyzing…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Analyze Files
                  {!cdrDone && <span className="opacity-60 ml-1">(CDR required)</span>}
                </>
              )}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}