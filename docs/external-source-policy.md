# Política de fontes externas da LibertyAI

O Painel do Corretor é a base principal para preços, produtos e condições comerciais. A ANS é prioritária para regras regulatórias gerais. Pesquisa externa complementa as respostas; nunca substitui silenciosamente a documentação nem atualiza o acervo.

## Pesquisa pela API

Na ausência de trechos internos relevantes, em perguntas regulatórias explícitas (ANS, rol, resolução, portabilidade) ou pedidos de pesquisa/atualização, o servidor envia a pergunta à Responses API com `web_search` obrigatório. A IA realiza a pesquisa e retorna conclusões com citações. Perguntas comerciais já atendidas pelo acervo continuam usando os documentos, sem pesquisa desnecessária.

A busca permite `www.gov.br`, com validação posterior de citações da ANS sob `/ans/`, e os domínios oficiais relacionados previamente cadastrados em `fontes.txt`. O servidor rejeita respostas incompletas, sem pesquisa ou sem citações válidas. O cadastro deve conter apenas sites oficiais aprovados pelo administrador.

A requisição de pesquisa recebe somente a pergunta (até 2.000 caracteres), não os PDFs ou o acervo inteiro, e usa `store: false`. O resultado transitório é entregue ao modelo que redige a resposta junto dos trechos internos separados. A resposta e suas referências permanecem no histórico normal do chat; não são adicionadas ao índice documental. A importação explícita de `fontes.txt` continua sendo um fluxo distinto.

## Divergências e apresentação

O modelo deve manter as condições comerciais do Painel separadas das regras gerais da ANS, explicar divergências, identificar fontes e mencionar datas/vigências declaradas quando disponíveis. Datas de coleta ou indexação não comprovam vigência. Não deve presumir equivalência entre produtos, modalidades ou códigos, nem apresentar promoções vencidas como atuais.

O chat exibe documentos com nome e página e referências externas com título e link clicável. Instruções presentes em documentos ou páginas são tratadas como dados, nunca comandos.

## Configuração e falhas

`LLM_WEB_SEARCH_ENABLED=false` desliga a pesquisa. Por padrão, a pesquisa está habilitada e reutiliza `LLM_API_KEY` e `LLM_BASE_URL`; o provedor precisa oferecer Responses API com a ferramenta `web_search`. Para um provedor separado, configure `LLM_WEB_SEARCH_API_KEY` e `LLM_WEB_SEARCH_BASE_URL`. O modelo padrão é `gpt-4.1-mini`, ajustável com `LLM_WEB_SEARCH_MODEL`. A chave fica apenas no servidor. Tavily não é mais usado no fluxo do chat.

A busca tem prazo máximo de 45 segundos. Em indisponibilidade, respostas sem citações ou falta de chave, a aplicação preserva o contexto interno e orienta o modelo a informar que não foi possível confirmar externamente. Nunca alega uma verificação que não ocorreu.

Referência de implementação: [OpenAI — Web search](https://developers.openai.com/api/docs/guides/tools-web-search).
