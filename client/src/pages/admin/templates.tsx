import { useState } from "react";
import { useLocation } from "wouter";
import { format } from "date-fns";
import {
  ArrowLeft,
  FileSpreadsheet,
  Loader2,
  Trash2,
  Upload as UploadIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { ProposalNav } from "@/components/proposal/proposal-nav";
import { useTemplateInfo } from "./hooks";

// XLSM template upload page. The actuary's workbook is injected with
// census data during proposal generation, then LibreOffice converts it
// to PDF. This is the only place the template is uploaded or replaced;
// admins reach it from the Generate Proposal dialog on the cockpit.
export default function AdminTemplatesPage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const { data: info, isLoading } = useTemplateInfo();
  const [uploading, setUploading] = useState(false);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".xlsm")) {
      toast({
        title: "Invalid file",
        description: "Template must be an .xlsm file.",
        variant: "destructive",
      });
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("template", file);
      const res = await fetch("/api/admin/proposal/upload-template", {
        method: "POST",
        body: form,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? "Upload failed");
      }
      const data = await res.json();
      toast({
        title: "Template uploaded",
        description: `${data.fileName}, ${data.sheetNames?.length ?? "?"} sheets`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/proposal/template-info"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/proposal/sheets"] });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete() {
    try {
      const res = await fetch("/api/admin/proposal/template", {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to remove template");
      toast({ title: "Template removed" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/proposal/template-info"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/proposal/sheets"] });
    } catch (err: any) {
      toast({ title: "Remove failed", description: err.message, variant: "destructive" });
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <ProposalNav />
      <div className="mx-auto max-w-2xl px-6 py-8">
        <button
          type="button"
          onClick={() => navigate("/admin")}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to admin
        </button>
        <h1 className="mt-3 text-2xl font-bold tracking-tight">Proposal Template</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload the actuary's .xlsm workbook. Census data is injected into the selected sheet,
          then LibreOffice converts the workbook to PDF.
        </p>

        <Card className="mt-5 p-5">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">XLSM template</h2>
          </div>

          <div className="mt-4">
            {isLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : info?.uploaded ? (
              <div className="flex items-center justify-between rounded-md border bg-muted/30 p-4">
                <div className="flex items-center gap-3">
                  <FileSpreadsheet className="h-5 w-5 text-green-700 dark:text-green-400" />
                  <div>
                    <div className="text-sm font-semibold">{info.fileName}</div>
                    <div className="text-xs text-muted-foreground">
                      {info.fileSize ? `${(info.fileSize / 1024).toFixed(1)} KB` : ""}
                      {info.uploadedAt && (
                        <>
                          {info.fileSize ? " · " : ""}
                          Uploaded {format(new Date(info.uploadedAt), "MMM d, yyyy")}
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <label>
                    <input
                      type="file"
                      accept=".xlsm"
                      className="hidden"
                      onChange={handleUpload}
                      disabled={uploading}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={uploading}
                      asChild
                    >
                      <span>
                        {uploading ? (
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <UploadIcon className="mr-1.5 h-3.5 w-3.5" />
                        )}
                        Replace
                      </span>
                    </Button>
                  </label>
                  <Button variant="ghost" size="sm" onClick={handleDelete}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
            ) : (
              <label
                className="flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed border-border/80 bg-background px-6 py-10 text-center hover:border-primary/40"
              >
                <input
                  type="file"
                  accept=".xlsm"
                  className="hidden"
                  onChange={handleUpload}
                  disabled={uploading}
                />
                {uploading ? (
                  <>
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <div className="mt-3 font-semibold">Uploading…</div>
                  </>
                ) : (
                  <>
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                      <UploadIcon className="h-6 w-6 text-primary" />
                    </div>
                    <div className="mt-3 text-base font-semibold">Upload .xlsm template</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Click to browse · up to 50 MB
                    </div>
                  </>
                )}
              </label>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
