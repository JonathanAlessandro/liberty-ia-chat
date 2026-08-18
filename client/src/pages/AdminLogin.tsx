import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Loader2, ShieldCheck } from "lucide-react";
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

  return <main className="grid min-h-screen place-items-center bg-[#fbf7ee] p-5"><section className="w-full max-w-md rounded-[2rem] border border-[#dfd0bb] bg-[#fffdf9] p-7 shadow-[0_24px_75px_-38px_oklch(0.26_0.04_194_/_0.6)] sm:p-9"><button onClick={() => setLocation("/")} className="mb-10 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground hover:text-primary"><ArrowLeft className="size-3.5" />Voltar ao chat</button><div className="flex size-11 items-center justify-center rounded-2xl bg-primary text-white"><ShieldCheck className="size-5" /></div><p className="mt-5 text-[0.65rem] font-bold uppercase tracking-[0.2em] text-[#a85945]">LibertyAI · VPS</p><h1 className="font-editorial mt-2 text-3xl leading-tight text-primary">Acesso administrativo</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">Use as credenciais definidas nas variáveis protegidas do servidor.</p><form className="mt-8 space-y-5" onSubmit={event => { event.preventDefault(); setError(""); login.mutate({ email, password }); }}><div className="space-y-2"><Label htmlFor="email">E-mail do administrador</Label><Input id="email" type="email" value={email} onChange={event => setEmail(event.target.value)} required autoComplete="email" className="h-11 rounded-xl bg-[#fffcf7]" /></div><div className="space-y-2"><Label htmlFor="password">Senha</Label><Input id="password" type="password" value={password} onChange={event => setPassword(event.target.value)} required autoComplete="current-password" className="h-11 rounded-xl bg-[#fffcf7]" /></div>{error ? <p role="alert" className="rounded-xl bg-[#f9e1dc] px-3 py-2 text-sm text-[#9a3d30]">{error}</p> : null}<Button type="submit" className="h-11 w-full rounded-xl" disabled={login.isPending}>{login.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}Entrar no painel</Button></form></section></main>;
}
