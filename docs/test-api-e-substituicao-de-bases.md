# Testes pela API e substituição de bases

## Ativar a API no servidor

Configure no Coolify, nas variáveis de ambiente da aplicação, `CHAT_TEST_API_KEY` com uma chave aleatória de pelo menos 32 caracteres e faça o deploy. Ela é exclusiva para automação; não use a chave da OpenAI nem a senha de um usuário. Para gerar uma chave localmente: `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Guarde em um gerenciador de senhas. Não coloque no código, no navegador ou em arquivos versionados.

Sem essa configuração a rota retorna 503. Com credencial errada retorna 401. Para revogar ou trocar o acesso, altere a variável e reinicie a aplicação. Use HTTPS.

`POST /api/test/ask`, com `Authorization: Bearer SUA_CHAVE` e `Content-Type: application/json`:

```json
{"question":"Na Bradesco, qual a cobertura em Schengen?","history":[]}
```

Retorna `answer`, `sources`, `hasContext`, `responseMode` (quando informado pelo serviço) e `elapsedMs`. Usa o mesmo serviço de resposta, acervo ativo, instruções e pesquisa externa do chat. Não cria conta, conversa ou mensagem no histórico. Para testar continuidade, envie explicitamente `history` com até 20 mensagens de `role` user/assistant e `content`. Cada pergunta tem até 2200 caracteres; cada mensagem anterior, até 6000.

Há limite de 30 perguntas por minuto e 2 simultâneas por instância; excesso retorna 429 com Retry-After. Falha de processamento retorna 502, sem expor detalhes do provedor. As consultas reais podem consumir créditos do provedor de IA e de pesquisa, como o chat normal. Os testes automatizados desta atualização usam respostas simuladas, sem créditos.

No terminal do computador que fará os testes, defina `LIBERTY_API_URL` com a URL HTTPS da aplicação e `CHAT_TEST_API_KEY` com a mesma chave do servidor. Depois:

```powershell
node scripts/ask-test-api.mjs "Na Bradesco, qual a cobertura em Schengen?"
```

O script imprime o JSON completo e termina com erro caso a API não responda com sucesso. A credencial é lida somente do ambiente, sem argumento na linha de comando.

## Substituir bases no administrador

1. Em Acervo de conhecimento, marque em **Substituir bases anteriores** exatamente os arquivos inteiramente substituídos pela nova versão.
2. Envie um único novo arquivo: PDF, planilha ou .knowledge.json. O seletor lista os arquivos ativos de todas as pastas para permitir substituir fontes antigas mesmo que estejam sem pasta.
3. Quando os novos trechos forem gravados com sucesso, a nova base e a desativação das selecionadas são confirmadas na mesma transação. Se a validação, extração ou gravação falhar, as antigas continuam ativas.
4. Bases inativas ficam guardadas e visíveis no administrador. Use **Reativar** para devolvê-las às buscas ou **Desativar** para retirá-las sem enviar outro arquivo. A ação antiga de remover também passa a desativar, preservando o original.

Todas as buscas documentais e de páginas oficiais cadastradas excluem fontes inativas. A reindexação em lote pula essas fontes, e o monitor da pasta não reativa um arquivo desativado, mesmo se ele mudar. A exclusão física do arquivo monitorado continua removendo seu registro; se ele for adicionado novamente depois, é uma nova importação.

Não desative um manual geral por causa de uma base que cobre só um assunto. A consolidação Bradesco de seguro viagem não substitui todo o manual PME, que contém outros temas. A substituição é por arquivo inteiro, não por trechos. Não altera respostas antigas já gravadas nem o contexto textual de mensagens anteriores: para verificar as regras atuais, inicie uma conversa nova ou teste a API com `history: []`.

## Publicação

A migração 0011 adiciona `documents.isActive`, mantendo todos os documentos existentes ativos. O início padrão do contêiner executa as migrações antes da aplicação. Nenhum documento existente é desativado automaticamente pelo deploy. Para fluxos fora do contêiner, execute as migrações antes de iniciar a nova versão.
