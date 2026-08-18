import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, FileText, Loader2, Settings2, Trash2, UploadCloud } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

function formatBytes(size: number) {
  if (size < 1024 * 1024) return `${Math.ceil(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Admin() {
  const { user, loading } = useAuth();
  const utils = trpc.useUtils();
  const inputRef = useRef<HTMLInputElement>(null);
  const [prompt, setPrompt] = useState("");
  const [isReadingFile, setIsReadingFile] = useState(false);
  const isAdmin = user?.role === "admin";
  const documents = trpc.admin.documents.useQuery(undefined, { enabled: isAdmin });
  const configuration = trpc.admin.aiConfiguration.useQuery(undefined, { enabled: isAdmin });

  useEffect(() => {
    if (configuration.data) setPrompt(configuration.data.systemPrompt);
  }, [configuration.data]);

  const upload = trpc.admin.uploadDocument.useMutation({
    onSuccess: () => {
      utils.admin.documents.invalidate();
      toast.success("Documento enviado e indexado.");
    },
    onError: error => toast.error(error.message),
  });
  const remove = trpc.admin.removeDocument.useMutation({
    onSuccess: () => {
      utils.admin.documents.invalidate();
      toast.success("Documento removido do contexto.");
    },
    onError: error => toast.error(error.message),
  });
  const savePrompt = trpc.admin.saveAiConfiguration.useMutation({
    onSuccess: data => {
      setPrompt(data.systemPrompt);
      toast.success("Instrução-base atualizada.");
    },
    onError: error => toast.error(error.message),
  });

  const uploadFile = (file?: File) => {
    if (!file) return;
    if (file.type !== "application/pdf" || !file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Escolha um arquivo PDF.");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      toast.error("O PDF deve ter no máximo 15 MB.");
      return;
    }
    setIsReadingFile(true);
    const reader = new FileReader();
    reader.onload = () => {
      setIsReadingFile(false);
      upload.mutate({ fileName: file.name, mimeType: file.type, base64Content: String(reader.result) });
    };
    reader.onerror = () => {
      setIsReadingFile(false);
      toast.error("Não foi possível ler o arquivo selecionado.");
    };
    reader.readAsDataURL(file);
  };

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-6xl space-y-7 px-1 py-3">
        <header className="relative overflow-hidden rounded-[1.7rem] bg-primary px-7 py-8 text-primary-foreground shadow-[0_24px_70px_-32px_oklch(0.25_0.07_201_/_0.72)] md:px-10">
          <div className="liberty-grid absolute inset-0 opacity-50" />
          <div className="absolute -right-12 -top-16 size-56 rounded-full border border-white/20 bg-white/5" />
          <div className="relative">
            <p className="mb-3 text-[0.64rem] font-bold uppercase tracking-[0.24em] text-[#e9bc88]">Administração segura</p>
            <h1 className="font-editorial text-3xl leading-tight md:text-4xl">Contexto que mantém a resposta no rumo certo.</h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-white/74">Gerencie os documentos e a instrução-base que orientam a LibertyAI. Os PDFs são prioritários e links externos podem complementar respostas com identificação clara.</p>
          </div>
        </header>

        {loading ? null : !isAdmin ? (
          <Card className="border-dashed bg-card/80 py-10 text-center"><CardContent><p className="font-semibold">Acesso administrativo necessário</p><p className="mt-2 text-sm text-muted-foreground">Entre com a conta definida como administradora para gerenciar o contexto.</p></CardContent></Card>
        ) : (
          <div className="grid gap-7 lg:grid-cols-[1.18fr_0.82fr]">
            <section className="space-y-7">
              <Card className="rounded-[1.35rem] border-border/70 shadow-sm">
                <CardHeader className="flex-row items-start justify-between gap-5">
                  <div><CardTitle className="flex items-center gap-2 text-xl"><FileText className="size-5 text-[#a85945]" />Documentos de contexto</CardTitle><CardDescription className="mt-2">Envie PDFs de até 15 MB. O texto é extraído e segmentado automaticamente.</CardDescription></div>
                  <Button onClick={() => inputRef.current?.click()} disabled={isReadingFile || upload.isPending} className="rounded-xl bg-[#a85945] text-white hover:bg-[#8f4737]">
                    {isReadingFile || upload.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <UploadCloud className="mr-2 size-4" />} Enviar PDF
                  </Button>
                  <input ref={inputRef} type="file" accept="application/pdf" className="hidden" onChange={event => uploadFile(event.target.files?.[0])} />
                </CardHeader>
                <CardContent>
                  {upload.isPending && <div className="mb-5 space-y-2 rounded-xl bg-[#f4eadb] p-4"><div className="flex items-center justify-between text-sm"><span>Extraindo e indexando o documento…</span><Loader2 className="size-4 animate-spin text-primary" /></div><Progress value={72} /></div>}
                  <div className="space-y-3">
                    {documents.isLoading ? <p className="py-6 text-sm text-muted-foreground">Carregando documentos…</p> : documents.data?.length ? documents.data.map(document => (
                      <div key={document.id} className="group flex items-center justify-between gap-4 rounded-2xl border border-border/80 bg-[#fffcf7] px-4 py-4">
                        <div className="flex min-w-0 items-center gap-3"><div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#e5f0e5] text-[#477458]"><FileText className="size-5" /></div><div className="min-w-0"><p className="truncate text-sm font-semibold">{document.originalName}</p><p className="mt-1 text-xs text-muted-foreground">{formatBytes(document.sizeBytes)} · {document.pageCount ?? "—"} páginas</p></div></div>
                        <div className="flex items-center gap-2"><span className={`hidden rounded-full px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-[0.12em] sm:inline ${document.status === "ready" ? "bg-[#e5f0e5] text-[#3b6c4f]" : document.status === "failed" ? "bg-[#f7ded8] text-[#a24135]" : "bg-[#f4eadb] text-[#865d1e]"}`}>{document.status === "ready" ? "Pronto" : document.status === "failed" ? "Falhou" : "Processando"}</span><Button variant="ghost" size="icon" className="text-muted-foreground hover:bg-[#f7ded8] hover:text-[#a24135]" onClick={() => remove.mutate({ documentId: document.id })} disabled={remove.isPending} aria-label={`Remover ${document.originalName}`}><Trash2 className="size-4" /></Button></div>
                      </div>
                    )) : <div className="rounded-2xl border border-dashed border-border bg-muted/35 px-5 py-12 text-center"><UploadCloud className="mx-auto size-7 text-[#a85945]" /><p className="mt-3 text-sm font-semibold">Nenhum PDF no contexto</p><p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-muted-foreground">Envie o primeiro documento para a LibertyAI começar a responder com base no seu material.</p></div>}
                  </div>
                </CardContent>
              </Card>
            </section>
            <section>
              <Card className="rounded-[1.35rem] border-border/70 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2 text-xl"><Settings2 className="size-5 text-[#a85945]" />Instrução-base</CardTitle><CardDescription className="mt-2">Define tom e forma da resposta. PDFs permanecem prioritários; fontes externas confiáveis podem complementar o contexto e são exibidas separadamente.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="space-y-2"><Label htmlFor="system-prompt" className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Orientação da LibertyAI</Label><Textarea id="system-prompt" value={prompt} onChange={event => setPrompt(event.target.value)} className="min-h-72 resize-y rounded-xl bg-[#fffcf7] leading-6" maxLength={8000} /></div><div className="flex items-center justify-between gap-3"><span className="text-xs text-muted-foreground">{prompt.length}/8000 caracteres</span><Button className="rounded-xl" onClick={() => savePrompt.mutate({ systemPrompt: prompt })} disabled={savePrompt.isPending || prompt.trim().length < 40}>{savePrompt.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <CheckCircle2 className="mr-2 size-4" />}Salvar instrução</Button></div></CardContent></Card>
            </section>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
