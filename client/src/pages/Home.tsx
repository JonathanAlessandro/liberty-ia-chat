import { AIChatBox, type Message } from "@/components/AIChatBox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { createVisitorId, describeChatRequestFailure, hydrateStoredMessages, parseSavedConversationId, type ChatSource } from "@/lib/chat-history";
import { trpc } from "@/lib/trpc";
import { ArrowUpRight, CircleAlert, LogOut, Menu, MessageSquareText, Plus, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";

type DisplayMessage = Message & { sources?: ChatSource[] };

const VISITOR_KEY = "liberty-ai-visitor-id";
const CONVERSATION_KEY_PREFIX = "liberty-ai-conversation-id";

function getVisitorId() {
  const current = localStorage.getItem(VISITOR_KEY);
  if (current) return current;
  const created = createVisitorId();
  localStorage.setItem(VISITOR_KEY, created);
  return created;
}

function getSavedConversationId(userId: number) {
  return parseSavedConversationId(localStorage.getItem(`${CONVERSATION_KEY_PREFIX}:${userId}`));
}

export default function Home() {
  const [, setLocation] = useLocation();
  const session = trpc.userAuth.me.useQuery(undefined, { retry: false });
  const [visitorId] = useState(getVisitorId);
  const [conversationId, setConversationId] = useState<number | undefined>();
  const [conversationVersion, setConversationVersion] = useState(0);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [chatActionError, setChatActionError] = useState("");
  const chatUtils = trpc.useUtils();
  const logout = trpc.userAuth.logout.useMutation({ onSuccess: () => setLocation("/login") });

  useEffect(() => {
    if (!session.isLoading && !session.data) setLocation("/login");
  }, [session.data, session.isLoading, setLocation]);

  useEffect(() => {
    if (session.data?.mustChangePassword) setLocation("/alterar-senha");
  }, [session.data?.mustChangePassword, setLocation]);

  useEffect(() => {
    if (!session.data) return;
    setConversationId(getSavedConversationId(session.data.id));
    setMessages([]);
  }, [session.data?.id]);

  const history = trpc.chat.history.useQuery(
    { visitorId, conversationId: conversationId ?? 0 },
    { enabled: Boolean(session.data && conversationId), retry: false },
  );
  const conversations = trpc.chat.conversations.useQuery(
    { visitorId },
    { enabled: Boolean(session.data), retry: false },
  );
  const chat = trpc.chat.ask.useMutation({
    onSuccess: result => {
      setConversationId(result.conversationId);
      if (session.data) localStorage.setItem(`${CONVERSATION_KEY_PREFIX}:${session.data.id}`, String(result.conversationId));
      setMessages(current => [...current, { role: "assistant", content: result.answer, sources: result.sources }]);
      void chatUtils.chat.conversations.invalidate({ visitorId });
    },
    onError: error => {
      console.error("[LibertyAI] Falha ao processar pergunta:", error);
      setMessages(current => [...current, { role: "assistant", content: describeChatRequestFailure(error.message) }]);
    },
  });

  useEffect(() => {
    if (!conversationId || !history.data) return;
    setMessages(hydrateStoredMessages(history.data));
  }, [conversationId, history.data]);

  const sendQuestion = (question: string) => {
    setMessages(current => [...current, { role: "user", content: question }]);
    chat.mutate({ visitorId, conversationId, question });
  };

  const isBusy = session.isLoading || chat.isPending || history.isLoading;

  const startNewConversation = () => {
    if (isBusy || !session.data) return;
    localStorage.removeItem(`${CONVERSATION_KEY_PREFIX}:${session.data.id}`);
    setConversationId(undefined);
    setMessages([]);
    setConversationVersion(version => version + 1);
    setSidebarOpen(false);
    setChatActionError("");
  };

  const selectConversation = (id: number) => {
    if (isBusy) return;
    if (conversationId !== id) {
      setConversationId(id);
      setMessages([]);
      setConversationVersion(version => version + 1);
      if (session.data) localStorage.setItem(`${CONVERSATION_KEY_PREFIX}:${session.data.id}`, String(id));
    }
    setSidebarOpen(false);
    setChatActionError("");
  };

  const deleteConversation = trpc.chat.delete.useMutation({
    onSuccess: (_result, variables) => {
      if (conversationId === variables.conversationId) {
        if (session.data) localStorage.removeItem(`${CONVERSATION_KEY_PREFIX}:${session.data.id}`);
        setConversationId(undefined);
        setMessages([]);
        setConversationVersion(version => version + 1);
      }
      setDeleteTargetId(null);
      setChatActionError("");
      void chatUtils.chat.conversations.invalidate({ visitorId });
    },
    onError: () => setChatActionError("Não foi possível excluir a conversa. Tente novamente."),
  });

  if (!session.data) {
    return <main className="grid min-h-screen place-items-center bg-[#fbf7ee] p-6"><p className="text-sm text-muted-foreground">Verificando acesso seguro…</p></main>;
  }

  if (session.data.mustChangePassword) {
    return <main className="grid min-h-screen place-items-center bg-[#fbf7ee] p-6"><p className="text-sm text-muted-foreground">Redirecionando para a atualização de senha…</p></main>;
  }

  return (
    <main className="h-[100dvh] min-h-screen bg-[#fbf7ee] px-3 py-3 text-foreground sm:px-6 sm:py-6 lg:grid lg:place-items-center">
      <section className="flex h-full min-h-0 w-full max-w-6xl overflow-hidden rounded-[1.8rem] border border-[#dfd0bb] bg-[#fffdf9] shadow-[0_24px_85px_-48px_oklch(0.26_0.04_194_/_0.7)]">
        {sidebarOpen && <button type="button" className="fixed inset-0 z-30 bg-black/30 md:hidden" onClick={() => setSidebarOpen(false)} aria-label="Fechar lista de conversas" />}
        <aside className={`${sidebarOpen ? "fixed inset-y-0 left-0 z-40 flex w-72" : "hidden"} min-h-0 flex-col border-r border-[#eadfcd] bg-[#fdf9f1] md:flex md:w-64 md:shrink-0`}>
          <div className="flex items-center justify-between gap-2 border-b border-[#eadfcd] p-4">
            <p className="text-sm font-bold text-primary">Conversas</p>
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setSidebarOpen(false)} aria-label="Fechar conversas"><X className="size-4" /></Button>
          </div>
          <div className="p-3"><Button onClick={startNewConversation} disabled={isBusy} className="w-full justify-start gap-2 rounded-xl"><Plus className="size-4" />Nova conversa</Button></div>
          <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-3" aria-label="Histórico de conversas">
            {conversations.isLoading && <p className="px-3 py-2 text-xs text-muted-foreground">Carregando conversas…</p>}
            {conversations.isError && <p className="px-3 py-2 text-xs text-[#9a3d30]">Não foi possível carregar as conversas.</p>}
            {conversations.data?.length === 0 && <p className="px-3 py-2 text-xs text-muted-foreground">Nenhuma conversa salva.</p>}
            {conversations.data?.map(item => <div key={item.id} className={`group mb-1 flex items-center rounded-xl ${conversationId === item.id ? "bg-[#e8ded0]" : "hover:bg-[#f1e9dd]"}`}>
              <button type="button" onClick={() => selectConversation(item.id)} disabled={isBusy} className="min-w-0 flex-1 px-3 py-2.5 text-left text-sm" aria-current={conversationId === item.id ? "page" : undefined}><span className="block truncate font-medium">{item.title || "Conversa sem título"}</span><span className="block text-[0.65rem] text-muted-foreground">{new Date(item.updatedAt).toLocaleDateString("pt-BR")}</span></button>
              <Button variant="ghost" size="icon" className="mr-1 shrink-0 text-muted-foreground hover:text-[#9a3d30]" onClick={() => { setDeleteTargetId(item.id); setChatActionError(""); }} aria-label={`Excluir conversa ${item.title || item.id}`} title="Excluir conversa"><Trash2 className="size-4" /></Button>
            </div>)}
          </nav>
        </aside>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-[#eadfcd] px-5 py-4 sm:px-7">
          <div className="flex min-w-0 items-center gap-2"><Button variant="ghost" size="icon" className="md:hidden" onClick={() => setSidebarOpen(true)} aria-label="Abrir conversas"><Menu className="size-4" /></Button><span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">L</span><div className="min-w-0"><p className="truncate text-base font-bold tracking-tight text-primary">Liberty<span className="font-medium text-[#a85945]">AI</span></p><p className="truncate text-[0.62rem] font-bold uppercase tracking-[0.16em] text-muted-foreground">Conversa documental</p></div></div>
          <div className="flex items-center gap-1"><Button onClick={startNewConversation} disabled={isBusy} variant="ghost" size="icon" className="rounded-full text-primary md:hidden" aria-label="Nova conversa"><Plus className="size-4" /></Button><Link href="/admin"><Button variant="ghost" className="rounded-full px-3 text-[0.65rem] font-bold uppercase tracking-[0.1em] text-primary hover:bg-[#efe5d5] sm:px-4">Administração <ArrowUpRight className="ml-1.5 size-3.5" /></Button></Link><Button onClick={() => logout.mutate()} variant="ghost" size="icon" className="rounded-full text-muted-foreground hover:bg-[#f9e1dc] hover:text-[#9a3d30]" aria-label="Sair da conta"><LogOut className="size-4" /></Button></div>
        </header>
        <div className="flex items-center justify-between gap-3 border-b border-[#f0e7d9] bg-[#fdf9f1] px-5 py-2.5 text-xs sm:px-7"><p className="flex items-center gap-2 text-[#477458]"><span className="size-1.5 rounded-full bg-[#477458]" />Olá, {session.data.name ?? session.data.email}. Sua conversa é privada.</p><span className="hidden text-muted-foreground sm:inline">PDFs prioritários + fontes externas identificadas</span></div>
        <div className="flex min-h-0 flex-1 flex-col p-2 sm:p-4">
          <AIChatBox
            key={`${conversationId ?? "new"}-${conversationVersion}`}
            messages={messages}
            onSendMessage={sendQuestion}
            isLoading={isBusy}
            height="100%"
            className="min-h-0 flex-1 border-0 bg-transparent shadow-none"
            placeholder="Descreva sua dúvida"
            emptyStateMessage={history.isLoading ? "Recuperando sua conversa…" : "Envie uma pergunta para consultar o conteúdo disponível."}
            suggestedPrompts={[]}
          />
          {history.isError ? <p className="mx-3 mb-2 flex items-center gap-2 rounded-xl bg-[#f9e1dc] px-3 py-2 text-xs text-[#9a3d30]"><CircleAlert className="size-3.5" />Não foi possível recuperar o histórico anterior. Você ainda pode iniciar uma nova conversa.</p> : null}
          {chatActionError && <p className="mx-3 mb-2 text-xs text-[#9a3d30]" role="alert">{chatActionError}</p>}
          <p className="flex items-center justify-center gap-1.5 px-4 pb-1 text-center text-[0.65rem] text-muted-foreground"><MessageSquareText className="size-3.5" />A LibertyAI prioriza os documentos e identifica cada fonte externa complementar.</p>
        </div>
        </div>
      </section>
      <AlertDialog open={deleteTargetId !== null} onOpenChange={open => { if (!open && !deleteConversation.isPending) setDeleteTargetId(null); }}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Excluir esta conversa?</AlertDialogTitle><AlertDialogDescription>As mensagens desta conversa serão apagadas permanentemente. Esta ação não pode ser desfeita.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={deleteConversation.isPending}>Cancelar</AlertDialogCancel><AlertDialogAction disabled={deleteConversation.isPending} onClick={event => { event.preventDefault(); if (deleteTargetId !== null) deleteConversation.mutate({ visitorId, conversationId: deleteTargetId }); }}>Excluir conversa</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
