import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, FileText, Folder, FolderPlus, FolderSync, Loader2, Pencil, Settings2, Trash2, UploadCloud } from "lucide-react";
import { type DragEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

function formatBytes(size: number) {
  if (size < 1024 * 1024) return `${Math.ceil(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Admin() {
  const { user, loading } = useAuth();
  const utils = trpc.useUtils();
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [prompt, setPrompt] = useState("");
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number; fileName: string } | null>(null);
  const [activeFolderId, setActiveFolderId] = useState<number | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [editingFolder, setEditingFolder] = useState<{ id: number; name: string } | null>(null);
  const isAdmin = user?.role === "admin";
  const documents = trpc.admin.documents.useQuery(undefined, { enabled: isAdmin });
  const folders = trpc.admin.knowledgeFolders.useQuery(undefined, { enabled: isAdmin });
  const configuration = trpc.admin.aiConfiguration.useQuery(undefined, { enabled: isAdmin });

  useEffect(() => {
    if (configuration.data) setPrompt(configuration.data.systemPrompt);
  }, [configuration.data]);

  const upload = trpc.admin.uploadDocument.useMutation();
  const createFolder = trpc.admin.createKnowledgeFolder.useMutation({
    onSuccess: async folder => {
      setNewFolderName("");
      await utils.admin.knowledgeFolders.invalidate();
      if (folder) setActiveFolderId(folder.id);
      toast.success("Pasta criada.");
    },
    onError: error => toast.error(error.message),
  });
  const renameFolder = trpc.admin.renameKnowledgeFolder.useMutation({
    onSuccess: async () => {
      setEditingFolder(null);
      await Promise.all([utils.admin.knowledgeFolders.invalidate(), utils.admin.documents.invalidate()]);
      toast.success("Pasta renomeada.");
    },
    onError: error => toast.error(error.message),
  });
  const moveDocument = trpc.admin.moveDocument.useMutation({
    onSuccess: async () => {
      await utils.admin.documents.invalidate();
      toast.success("Arquivo movido.");
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
  const reindex = trpc.admin.reindexDocuments.useMutation({
    onSuccess: async result => {
      await utils.admin.documents.invalidate();
      if (result.failed) toast.error(`${result.processed} arquivo(s) relido(s); ${result.failed} falharam.`);
      else toast.success(`${result.processed} arquivo(s) relido(s) sem alterar o histórico.`);
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

  const readAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Não foi possível ler ${file.name}.`));
    reader.readAsDataURL(file);
  });

  const uploadFiles = async (selection?: FileList | null) => {
    const files = Array.from(selection ?? []);
    if (!files.length) return;
    const supported = /\.(pdf|xlsx|xls|csv)$/i;
    const invalid = files.find(file => !supported.test(file.name));
    if (invalid) return toast.error(`${invalid.name}: use PDF, XLSX, XLS ou CSV.`);
    const oversized = files.find(file => file.size > (/\.pdf$/i.test(file.name) ? 15 : 8) * 1024 * 1024);
    if (oversized) return toast.error(`${oversized.name} excede o limite de ${/\.pdf$/i.test(oversized.name) ? 15 : 8} MB.`);

    setIsReadingFile(true);
    let succeeded = 0;
    const failures: string[] = [];
    try {
      for (let index = 0; index < files.length; index++) {
        const file = files[index]!;
        setUploadProgress({ current: index + 1, total: files.length, fileName: file.name });
        try {
          const base64Content = await readAsDataUrl(file);
          const result = await upload.mutateAsync({ fileName: file.name, mimeType: file.type || "application/octet-stream", base64Content, folderId: activeFolderId ?? undefined });
          if (result?.status === "failed") throw new Error(result.errorMessage || "não foi possível indexar o arquivo");
          succeeded++;
        } catch (error) {
          failures.push(`${file.name}: ${error instanceof Error ? error.message : "falha no envio"}`);
        }
      }
      await utils.admin.documents.invalidate();
      if (succeeded) toast.success(`${succeeded} arquivo${succeeded === 1 ? "" : "s"} enviado${succeeded === 1 ? "" : "s"} e processado${succeeded === 1 ? "" : "s"}.`);
      if (failures.length) toast.error(`${failures.length} arquivo${failures.length === 1 ? " falhou" : "s falharam"}: ${failures.join("; ")}`);
    } finally {
      setIsReadingFile(false);
      setUploadProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (isReadingFile || !event.dataTransfer.types.includes("Files")) return;
    dragDepth.current++;
    setIsDraggingFiles(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (!dragDepth.current) setIsDraggingFiles(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragDepth.current = 0;
    setIsDraggingFiles(false);
    if (isReadingFile) {
      toast.info("Aguarde a fila atual terminar antes de adicionar mais arquivos.");
      return;
    }
    void uploadFiles(event.dataTransfer.files);
  };

  const openFilePicker = (event: KeyboardEvent<HTMLDivElement>) => {
    if ((event.key === "Enter" || event.key === " ") && !isReadingFile) {
      event.preventDefault();
      inputRef.current?.click();
    }
  };

  const activeFolder = folders.data?.find(folder => folder.id === activeFolderId);
  const visibleDocuments = documents.data?.filter(document => (document.folderId ?? null) === activeFolderId);

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-6xl space-y-7 px-1 py-3">
        <header className="relative overflow-hidden rounded-[1.7rem] bg-primary px-7 py-8 text-primary-foreground shadow-[0_24px_70px_-32px_oklch(0.25_0.07_201_/_0.72)] md:px-10">
          <div className="liberty-grid absolute inset-0 opacity-50" />
          <div className="absolute -right-12 -top-16 size-56 rounded-full border border-white/20 bg-white/5" />
          <div className="relative">
            <p className="mb-3 text-[0.64rem] font-bold uppercase tracking-[0.24em] text-[#e9bc88]">Administração segura</p>
            <h1 className="font-editorial text-3xl leading-tight md:text-4xl">Contexto que mantém a resposta no rumo certo.</h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-white/74">A pasta de conhecimento é sincronizada automaticamente com PDFs, imagens e planilhas. Os documentos permanecem prioritários; fontes externas apenas complementam respostas identificadas.</p>
          </div>
        </header>

        {loading ? null : !isAdmin ? (
          <Card className="border-dashed bg-card/80 py-10 text-center"><CardContent><p className="font-semibold">Acesso administrativo necessário</p><p className="mt-2 text-sm text-muted-foreground">Entre com a conta definida como administradora para gerenciar o contexto.</p></CardContent></Card>
        ) : (
          <div className="grid gap-7 lg:grid-cols-[1.18fr_0.82fr]">
            <section className="space-y-7">
              <Card className="rounded-[1.35rem] border-border/70 shadow-sm">
                <CardHeader className="flex-row items-start justify-between gap-5">
                  <div><CardTitle className="flex items-center gap-2 text-xl"><FolderSync className="size-5 text-[#a85945]" />Acervo de conhecimento</CardTitle><CardDescription className="mt-2">Crie pastas por operadora ou assunto, envie vários arquivos e mova os materiais existentes.</CardDescription></div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => reindex.mutate()} disabled={reindex.isPending || isReadingFile || upload.isPending} className="rounded-xl">
                      {reindex.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <FolderSync className="mr-2 size-4" />} Reler arquivos
                    </Button>
                    <Button onClick={() => inputRef.current?.click()} disabled={isReadingFile || upload.isPending || reindex.isPending} className="rounded-xl bg-[#a85945] text-white hover:bg-[#8f4737]">
                      {isReadingFile || upload.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <UploadCloud className="mr-2 size-4" />} Enviar {activeFolder ? `em ${activeFolder.name}` : "sem pasta"}
                    </Button>
                  </div>
                  <input ref={inputRef} type="file" multiple accept=".pdf,.xlsx,.xls,.csv,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv" className="hidden" onChange={event => void uploadFiles(event.target.files)} />
                </CardHeader>
                <CardContent>
                  <div className="mb-5 space-y-3 rounded-2xl border border-border/80 bg-[#fffcf7] p-4">
                    <div className="flex gap-2">
                      <Input value={newFolderName} onChange={event => setNewFolderName(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && newFolderName.trim().length >= 2) createFolder.mutate({ name: newFolderName }); }} placeholder="Nova pasta, ex.: Hapvida NotreDame" maxLength={80} disabled={createFolder.isPending} />
                      <Button type="button" variant="outline" onClick={() => createFolder.mutate({ name: newFolderName })} disabled={createFolder.isPending || newFolderName.trim().length < 2}><FolderPlus className="mr-2 size-4" />Criar</Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" variant={activeFolderId === null ? "default" : "outline"} onClick={() => setActiveFolderId(null)}><Folder className="mr-1.5 size-3.5" />Sem pasta</Button>
                      {folders.data?.map(folder => (
                        <div key={folder.id} className="flex items-center rounded-lg border border-border bg-background">
                          <button type="button" className={`flex items-center px-3 py-1.5 text-xs font-semibold ${activeFolderId === folder.id ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`} onClick={() => setActiveFolderId(folder.id)}><Folder className="mr-1.5 size-3.5" />{folder.name}</button>
                          <button type="button" className="px-2 py-1.5 text-muted-foreground hover:text-foreground" aria-label={`Renomear ${folder.name}`} onClick={() => setEditingFolder({ id: folder.id, name: folder.name })}><Pencil className="size-3.5" /></button>
                          <button type="button" className="border-l border-border px-2 py-1.5 text-[#a85945] hover:bg-[#f4eadb]" aria-label={`Enviar arquivos para ${folder.name}`} onClick={() => { setActiveFolderId(folder.id); setTimeout(() => inputRef.current?.click(), 0); }}><UploadCloud className="size-3.5" /></button>
                        </div>
                      ))}
                    </div>
                    {editingFolder && <div className="flex gap-2 border-t border-border pt-3"><Input autoFocus value={editingFolder.name} onChange={event => setEditingFolder({ ...editingFolder, name: event.target.value })} maxLength={80} aria-label="Novo nome da pasta" /><Button type="button" size="sm" onClick={() => renameFolder.mutate({ folderId: editingFolder.id, name: editingFolder.name })} disabled={renameFolder.isPending || editingFolder.name.trim().length < 2}>Salvar nome</Button><Button type="button" size="sm" variant="ghost" onClick={() => setEditingFolder(null)}>Cancelar</Button></div>}
                  </div>
                  <div
                    role="button"
                    tabIndex={isReadingFile ? -1 : 0}
                    aria-disabled={isReadingFile}
                    aria-label={`Arraste arquivos para ${activeFolder?.name ?? "Sem pasta"} ou pressione Enter para selecionar`}
                    onClick={() => !isReadingFile && inputRef.current?.click()}
                    onKeyDown={openFilePicker}
                    onDragEnter={handleDragEnter}
                    onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = isReadingFile ? "none" : "copy"; }}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`mb-5 flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-5 py-7 text-center transition-colors ${isDraggingFiles ? "border-[#a85945] bg-[#f4eadb]" : "border-border bg-muted/25 hover:border-[#a85945]/60 hover:bg-[#fdf8ef]"} ${isReadingFile ? "cursor-not-allowed opacity-65" : ""}`}
                  >
                    <UploadCloud className={`size-7 ${isDraggingFiles ? "text-[#a85945]" : "text-muted-foreground"}`} />
                    <p className="mt-3 text-sm font-semibold">{isDraggingFiles ? "Solte os arquivos para adicionar à fila" : `Arraste os arquivos para ${activeFolder?.name ?? "Sem pasta"}`}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">ou clique para selecionar · PDF até 15 MB · XLSX, XLS e CSV até 8 MB</p>
                  </div>
                  {uploadProgress && <div className="mb-5 space-y-2 rounded-xl bg-[#f4eadb] p-4"><div className="flex items-center justify-between gap-3 text-sm"><span className="truncate">Processando {uploadProgress.current} de {uploadProgress.total}: {uploadProgress.fileName}</span><Loader2 className="size-4 shrink-0 animate-spin text-primary" /></div><Progress value={(uploadProgress.current / uploadProgress.total) * 100} /></div>}
                  <div className="space-y-3">
                    {documents.isLoading ? <p className="py-6 text-sm text-muted-foreground">Carregando documentos…</p> : visibleDocuments?.length ? visibleDocuments.map(document => (
                      <div key={document.id} className="group flex items-center justify-between gap-4 rounded-2xl border border-border/80 bg-[#fffcf7] px-4 py-4">
                        <div className="flex min-w-0 items-center gap-3"><div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#e5f0e5] text-[#477458]"><FileText className="size-5" /></div><div className="min-w-0"><p className="truncate text-sm font-semibold">{document.originalName}</p><p className="mt-1 text-xs text-muted-foreground">{formatBytes(document.sizeBytes)} · {document.pageCount ?? "—"} seções · {document.sourceOrigin === "folder" ? "Pasta monitorada" : "Upload manual"}</p></div></div>
                        <div className="flex items-center gap-2"><select value={document.folderId ?? ""} onChange={event => moveDocument.mutate({ documentId: document.id, folderId: event.target.value ? Number(event.target.value) : undefined })} disabled={moveDocument.isPending} className="max-w-36 rounded-lg border border-border bg-background px-2 py-1.5 text-xs" aria-label={`Mover ${document.originalName}`}><option value="">Sem pasta</option>{folders.data?.map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select><span className={`hidden rounded-full px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-[0.12em] sm:inline ${document.status === "ready" ? "bg-[#e5f0e5] text-[#3b6c4f]" : document.status === "failed" ? "bg-[#f7ded8] text-[#a24135]" : "bg-[#f4eadb] text-[#865d1e]"}`}>{document.status === "ready" ? "Pronto" : document.status === "failed" ? "Falhou" : "Processando"}</span><Button variant="ghost" size="icon" className="text-muted-foreground hover:bg-[#f7ded8] hover:text-[#a24135]" onClick={() => remove.mutate({ documentId: document.id })} disabled={remove.isPending} aria-label={`Remover ${document.originalName}`}><Trash2 className="size-4" /></Button></div>
                      </div>
                    )) : <div className="rounded-2xl border border-dashed border-border bg-muted/35 px-5 py-12 text-center"><FolderSync className="mx-auto size-7 text-[#a85945]" /><p className="mt-3 text-sm font-semibold">Nenhum arquivo em {activeFolder?.name ?? "Sem pasta"}</p><p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-muted-foreground">Envie arquivos ou mova materiais existentes usando o seletor ao lado de cada documento.</p></div>}
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
