import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, X, FileText, Check, Loader2 } from "lucide-react";

interface UploadModalProps {
  open: boolean;
  onClose: () => void;
}

interface FileEntry {
  name: string;
  type: string;
  status: "uploading" | "done";
}

export function UploadModal({ open, onClose }: UploadModalProps) {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [analyzing, setAnalyzing] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    addFiles(Array.from(e.dataTransfer.files));
  }, []);

  const addFiles = (newFiles: File[]) => {
    const entries: FileEntry[] = newFiles.map((f) => ({
      name: f.name,
      type: f.name.includes("cdr") ? "CDR" : f.name.includes("tower") ? "Tower" : "IPDR",
      status: "uploading" as const,
    }));
    setFiles((prev) => [...prev, ...entries]);

    entries.forEach((entry, i) => {
      setTimeout(() => {
        setFiles((prev) => prev.map((f) => f.name === entry.name ? { ...f, status: "done" } : f));
      }, 800 + i * 400);
    });
  };

  const handleAnalyze = () => {
    setAnalyzing(true);
    setTimeout(() => {
      setAnalyzing(false);
      onClose();
    }, 2000);
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
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md bg-card border border-border rounded-2xl p-6 shadow-2xl"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">Upload Files</h2>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Drop zone */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
            onClick={() => {
              const input = document.createElement("input");
              input.type = "file";
              input.multiple = true;
              input.onchange = (e) => {
                const target = e.target as HTMLInputElement;
                if (target.files) addFiles(Array.from(target.files));
              };
              input.click();
            }}
          >
            <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              Drop CDR, Tower, or IPDR files here
            </p>
            <p className="text-xs text-muted-foreground/60 mt-1">or click to browse</p>
          </div>

          {/* File list */}
          {files.length > 0 && (
            <div className="mt-4 space-y-2">
              {files.map((file) => (
                <div key={file.name} className="flex items-center gap-3 px-3 py-2 bg-secondary/50 rounded-lg">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{file.type}</p>
                  </div>
                  {file.status === "uploading" ? (
                    <Loader2 className="h-4 w-4 text-primary animate-spin" />
                  ) : (
                    <Check className="h-4 w-4 text-risk-low" />
                  )}
                </div>
              ))}
            </div>
          )}

          {files.length > 0 && files.every((f) => f.status === "done") && (
            <button
              onClick={handleAnalyze}
              disabled={analyzing}
              className="w-full mt-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 disabled:opacity-60 transition-all flex items-center justify-center gap-2"
            >
              {analyzing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analyzing data...
                </>
              ) : (
                "Analyze Files"
              )}
            </button>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
