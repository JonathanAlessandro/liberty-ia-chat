import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { KeyRound, Loader2 } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";

export default function ChangePassword() {
  const [, setLocation] = useLocation();
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const changePassword = trpc.userAuth.changePassword.useMutation({ onSuccess: () => setLocation("/"), onError: failure => setError(failure.message) });
  const submit = (event: React.FormEvent) => { event.preventDefault(); setError(""); if (nextPassword !== confirmation) return setError("A confirmação da nova senha não confere."); changePassword.mutate({ currentPassword, nextPassword }); };
  return <main className="grid min-h-screen place-items-center bg-[#fbf7ee] p-5"><section className="w-full max-w-md rounded-[2rem] border border-[#dfd0bb] bg-[#fffdf9] p-7 shadow-[0_24px_75px_-38px_oklch(0.26_0.04_194_/_0.6)] sm:p-9"><div className="flex size-11 items-center justify-center rounded-2xl bg-primary text-white"><KeyRound className="size-5" /></div><p className="mt-5 text-[0.65rem] font-bold uppercase tracking-[0.2em] text-[#a85945]">LibertyAI · segurança</p><h1 className="font-editorial mt-2 text-3xl leading-tight text-primary">Defina sua senha</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">Por segurança, substitua a senha temporária fornecida pelo administrador.</p><form className="mt-8 space-y-5" onSubmit={submit}><div className="space-y-2"><Label htmlFor="current-password">Senha temporária</Label><Input id="current-password" type="password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} required autoComplete="current-password" className="h-11 rounded-xl bg-[#fffcf7]" /></div><div className="space-y-2"><Label htmlFor="next-password">Nova senha</Label><Input id="next-password" type="password" value={nextPassword} onChange={event => setNextPassword(event.target.value)} required minLength={10} autoComplete="new-password" className="h-11 rounded-xl bg-[#fffcf7]" /></div><div className="space-y-2"><Label htmlFor="confirmation">Confirme a nova senha</Label><Input id="confirmation" type="password" value={confirmation} onChange={event => setConfirmation(event.target.value)} required minLength={10} autoComplete="new-password" className="h-11 rounded-xl bg-[#fffcf7]" /></div>{error ? <p role="alert" className="rounded-xl bg-[#f9e1dc] px-3 py-2 text-sm text-[#9a3d30]">{error}</p> : null}<Button type="submit" className="h-11 w-full rounded-xl" disabled={changePassword.isPending}>{changePassword.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}Salvar e acessar o chat</Button></form></section></main>;
}
