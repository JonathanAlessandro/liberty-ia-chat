# Melhorias iniciais de respostas — 16/11/2026

Destino: código da aplicação hospedada na VPS. O provedor OpenAI configurado não foi trocado. Nenhum deploy, alteração de acervo ativo, treinamento ou chamada à OpenAI foi realizado nesta etapa. O Qwen serve apenas de provedor local no teste opcional; o banco desse teste é substituído pela cópia histórica dos documentos.

## Implementação

- Busca: expansão de dentista/odontologia, recuperação da base pertinente mesmo sem o usuário conhecer o nome do arquivo, peso maior para termos discriminantes e exclusão de páginas que só repetem o nome da operadora no arquivo. Palavras comuns normalizadas, como “são”, não contam como prova de relevância. Os limites de operadora/produto/PF/PME continuam aplicados.
- Modalidade: respostas documentais que já distinguem PF e PME são preservadas. Quando um cenário numérico depende da modalidade e não há resposta direta sustentada para os dois cenários, pede-se esclarecimento. Respostas curtas como “PF” continuam a pergunta anterior.
- Tabelas: associação explícita de procedimento/coluna/prazo quando a estrutura é verificável. Suporte a tabelas verticais, linhas horizontais e continuação com cabeçalhos repetidos em outras páginas. Descrições e ressalvas originais são preservadas. Contagem incorreta, coluna ausente e conflito fazem o programa desistir da resposta direta.
- Regras: validação conservadora do limite expresso de idade para redução, incluindo a distinção funcionário/sócio; comparação de prazo apenas quando o usuário informa o mesmo marco temporal que a fonte. Não se equipara cancelamento ao último vencimento pago. O programa não confirma elegibilidade completa nem substitui análise da operadora.
- Respostas diretas: parto e preexistências podem vir das colunas verificadas, com as páginas originais. Cláusulas odontológicas de planos diferentes permanecem separadas; o nome mais específico, como Nacional Plus, tem prioridade sobre Nacional. Não há valores comerciais fixados no código.
- Geração: instruções reforçadas com exemplos fictícios de interpretação e consistência. Respostas documentais têm orçamento mínimo de 1.200 tokens; carências mantêm 2.400. Uma conclusão interrompida por `finish_reason=length` recebe uma única tentativa ampliada, limitada a 6.000; se continuar incompleta, é recusada. Esse mecanismo pode acrescentar consumo e latência quando ocorrer truncamento. Não são novas chamadas em toda pergunta.

Esta é uma primeira etapa sem novas dependências de produção. A aplicação continua usando recuperação lexical aprimorada; **embeddings/busca semântica não foram implantados na VPS**. Os componentes semânticos e a interface experimental do Qwen permanecem separados em scripts/local-ai. Datas arbitrárias, todos os tipos de tabelas e toda regra comercial ainda não possuem validação determinística universal. A auditoria por modelo continua sendo necessária para as respostas geradas e não garante ausência de erro.

## Verificação

Os 131 testes automatizados das áreas alteradas e regressões relacionadas passaram. A suíte completa executada com acesso HTTP local teve 266 testes aprovados, 9 ignorados e 3 falhas em arquivos não alterados: duas comparações de caminho POSIX no watcher sob Windows e uma expectativa de cookies no logout. Os testes locais de rotas/API e healthcheck passaram nessa execução; na primeira execução sem acesso de rede local eles foram bloqueados pelo ambiente. A contagem da suíte completa precede a última regressão adicional de ranking, incluída nos 131 testes direcionados.

Compilação e verificação TypeScript aprovadas. Os resultados novos do fluxo real, incluindo fontes, ficam em `tmp/vps-improvements-2026-11-16/`; o recorte histórico de 30 testes permanece intacto. Sete cenários documentais foram confirmados sem chamadas ao modelo (qwen-flow.json). A pergunta de boletos/carteirinha da Alice foi respondida corretamente pelo Qwen e passou pela auditoria do mesmo fluxo: documentos digitais, fonte Painel_alice_2026-10-28.pdf, página 7. Essa verificação usou duas chamadas locais, geração e auditoria, em aproximadamente 242 segundos na CPU (qwen-generation.json). Isso não representa latência da VPS. O teste foi iniciado antes do último refinamento de palavras comuns no ranking; o refinamento final tem regressão automatizada própria.

As primeiras tentativas evidenciaram duas limitações locais: contexto de 4.096 tokens insuficiente para as instruções completas e timeout de 240 segundos durante leitura de um contexto longo. O Qwen foi reiniciado apenas para o teste com 12.288 tokens e limite de espera de 360 segundos. Na produção, o timeout configurado não foi alterado. O ajuste das tabelas divididas entre páginas eliminou a necessidade de geração no cenário Ameplan de parto/CPT.

```powershell
pnpm check
pnpm build
pnpm exec vitest run server/services/evidence-rules.test.ts server/services/chat-context.service.test.ts server/services/chat-retrieval.test.ts server/services/consolidated-policy.service.test.ts server/services/commercial-policy.service.test.ts server/services/llm.service.test.ts server/services/travel-search.test.ts server/services/knowledge-bundle.test.ts
```

O teste real opcional usa apenas `127.0.0.1:8766`, não carrega `.env` e substitui a chave por um marcador local. Requer o corpus salvo e o Qwen iniciado com contexto suficiente para as instruções da aplicação (a configuração de 4.096 tokens usada no comparativo anterior foi insuficiente). Nenhuma fonte é cortada para fingir equivalência; a adaptação do protocolo apenas reúne as mensagens de sistema no formato aceito pelo Qwen.

```powershell
$env:RUN_QWEN_VPS_FLOW='1'
pnpm exec vitest run server/services/qwen-vps-flow.test.ts
```

Esses testes não confirmam o comportamento do GPT em produção, o estado atual da base na VPS nem a vigência comercial dos documentos. A validação após deploy continua necessária.
