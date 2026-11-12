import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";

export default function AdminLogin() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const login = trpc.adminAuth.login.useMutation({
    onSuccess: () => setLocation("/admin"),
    onError: failure => setError(failure.message),
  });

  return <main className="grid min-h-screen place-items-center bg-[#f8fafc] p-5"><section className="w-full max-w-md rounded-[2rem] border border-[#e2e8f0] bg-[#ffffff] p-7 shadow-sm sm:p-9"><button onClick={() => setLocation("/")} className="mb-10 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground hover:text-primary"><ArrowLeft className="size-3.5" />Voltar ao chat</button><img src="/liberty-heart.svg" alt="Liberty Saúde" className="size-12" /><p className="mt-5 text-[0.65rem] font-bold uppercase tracking-[0.2em] text-[#2563eb]">LibertyAI · VPS</p><h1 className="font-editorial mt-2 text-3xl leading-tight text-primary">Acesso administrativo</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">Use as credenciais definidas nas variáveis protegidas do servidor.</p><form className="mt-8 space-y-5" onSubmit={event => { event.preventDefault(); setError(""); login.mutate({ email, password }); }}><div className="space-y-2"><Label htmlFor="email">E-mail do administrador</Label><Input id="email" type="email" value={email} onChange={event => setEmail(event.target.value)} required autoComplete="email" className="h-11 rounded-xl bg-[#ffffff]" /></div><div className="space-y-2"><Label htmlFor="password">Senha</Label><Input id="password" type="password" value={password} onChange={event => setPassword(event.target.value)} required autoComplete="current-password" className="h-11 rounded-xl bg-[#ffffff]" /></div>{error ? <p role="alert" className="rounded-xl bg-[#fef2f2] px-3 py-2 text-sm text-[#b91c1c]">{error}</p> : null}<Button type="submit" className="h-11 w-full rounded-xl" disabled={login.isPending}>{login.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}Entrar no painel</Button></form></section></main>;
}
