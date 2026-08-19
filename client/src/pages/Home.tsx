import { AIChatBox, type Message } from "@/components/AIChatBox";
import { Button } from "@/components/ui/button";
import { createVisitorId, describeChatRequestFailure, hydrateStoredMessages, parseSavedConversationId, type ChatSource } from "@/lib/chat-history";
import { trpc } from "@/lib/trpc";
import { ArrowUpRight, CircleAlert, LogOut, MessageSquareText } from "lucide-react";
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
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
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
  const chat = trpc.chat.ask.useMutation({
    onSuccess: result => {
      setConversationId(result.conversationId);
      if (session.data) localStorage.setItem(`${CONVERSATION_KEY_PREFIX}:${session.data.id}`, String(result.conversationId));
      setMessages(current => [...current, { role: "assistant", content: result.answer, sources: result.sources }]);
    },
    onError: error => {
      console.error("[LibertyAI] Falha ao processar pergunta:", error);
      setMessages(current => [...current, { role: "assistant", content: describeChatRequestFailure(error.message) }]);
    },
  });

  useEffect(() => {
    if (!history.data) return;
    setMessages(hydrateStoredMessages(history.data));
  }, [history.data]);

  const sendQuestion = (question: string) => {
    setMessages(current => [...current, { role: "user", content: question }]);
    chat.mutate({ visitorId, conversationId, question });
  };

  const isBusy = session.isLoading || chat.isPending || history.isLoading;

  if (!session.data) {
    return <main className="grid min-h-screen place-items-center bg-[#fbf7ee] p-6"><p className="text-sm text-muted-foreground">Verificando acesso seguro…</p></main>;
  }

  if (session.data.mustChangePassword) {
    return <main className="grid min-h-screen place-items-center bg-[#fbf7ee] p-6"><p className="text-sm text-muted-foreground">Redirecionando para a atualização de senha…</p></main>;
  }

  return (
    <main className="min-h-screen bg-[#fbf7ee] px-3 py-3 text-foreground sm:px-6 sm:py-6 lg:grid lg:place-items-center">
      <section className="flex min-h-[calc(100vh-1.5rem)] w-full max-w-5xl flex-col overflow-hidden rounded-[1.8rem] border border-[#dfd0bb] bg-[#fffdf9] shadow-[0_24px_85px_-48px_oklch(0.26_0.04_194_/_0.7)] sm:min-h-[calc(100vh-3rem)]">
        <header className="flex items-center justify-between gap-3 border-b border-[#eadfcd] px-5 py-4 sm:px-7">
          <div className="flex min-w-0 items-center gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">L</span><div className="min-w-0"><p className="truncate text-base font-bold tracking-tight text-primary">Liberty<span className="font-medium text-[#a85945]">AI</span></p><p className="truncate text-[0.62rem] font-bold uppercase tracking-[0.16em] text-muted-foreground">Conversa documental</p></div></div>
          <div className="flex items-center gap-1"><Link href="/admin"><Button variant="ghost" className="rounded-full px-3 text-[0.65rem] font-bold uppercase tracking-[0.1em] text-primary hover:bg-[#efe5d5] sm:px-4">Administração <ArrowUpRight className="ml-1.5 size-3.5" /></Button></Link><Button onClick={() => logout.mutate()} variant="ghost" size="icon" className="rounded-full text-muted-foreground hover:bg-[#f9e1dc] hover:text-[#9a3d30]" aria-label="Sair da conta"><LogOut className="size-4" /></Button></div>
        </header>
        <div className="flex items-center justify-between gap-3 border-b border-[#f0e7d9] bg-[#fdf9f1] px-5 py-2.5 text-xs sm:px-7"><p className="flex items-center gap-2 text-[#477458]"><span className="size-1.5 rounded-full bg-[#477458]" />Olá, {session.data.name ?? session.data.email}. Sua conversa é privada.</p><span className="hidden text-muted-foreground sm:inline">PDFs prioritários + fontes externas identificadas</span></div>
        <div className="flex min-h-0 flex-1 flex-col p-2 sm:p-4">
          <AIChatBox
            messages={messages}
            onSendMessage={sendQuestion}
            isLoading={isBusy}
            height="100%"
            className="min-h-[calc(100vh-15rem)] flex-1 border-0 bg-transparent shadow-none sm:min-h-[calc(100vh-17rem)]"
            placeholder="Descreva sua dúvida"
            emptyStateMessage={history.isLoading ? "Recuperando sua conversa…" : "Envie uma pergunta para consultar o conteúdo disponível."}
            suggestedPrompts={[]}
          />
          {history.isError ? <p className="mx-3 mb-2 flex items-center gap-2 rounded-xl bg-[#f9e1dc] px-3 py-2 text-xs text-[#9a3d30]"><CircleAlert className="size-3.5" />Não foi possível recuperar o histórico anterior. Você ainda pode iniciar uma nova conversa.</p> : null}
          <p className="flex items-center justify-center gap-1.5 px-4 pb-1 text-center text-[0.65rem] text-muted-foreground"><MessageSquareText className="size-3.5" />A LibertyAI prioriza os documentos e identifica cada fonte externa complementar.</p>
        </div>
      </section>
    </main>
  );
}
