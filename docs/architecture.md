# Arquitetura da LibertyAI

A LibertyAI será uma aplicação full-stack em Node.js. A camada de apresentação usa React e a camada de aplicação usa Express com tRPC como fronteira de API tipada. A organização interna preserva responsabilidades explícitas: os modelos descrevem persistência, os repositórios acessam dados, os serviços concentram regras de negócio, os controladores adaptam entradas e saídas e as rotas agrupam os procedimentos disponíveis para cada interface.

| Camada | Responsabilidade | Diretório principal |
| --- | --- | --- |
| Modelos | Define documentos, trechos, configurações e mensagens persistidas. | `drizzle/` e `server/models/` |
| Repositórios | Executa consultas e alterações no banco de dados. | `server/repositories/` |
| Serviços | Implementa upload, extração, segmentação, busca contextual e geração de resposta. | `server/services/` |
| Controladores | Valida parâmetros e adapta respostas dos serviços para a API. | `server/controllers/` |
| Rotas | Expõe operações administrativas e públicas pela API tipada. | `server/routes/` e `server/routers.ts` |
| Middlewares | Aplica autorização, limites de arquivo e tratamento uniforme de falhas. | `server/middlewares/` |
| Interface | Oferece chat público e painel administrativo autenticado. | `client/src/` |

## Fluxo dos documentos

O administrador envia um PDF. O servidor valida tipo e tamanho, grava o arquivo em armazenamento de objetos persistente e cria o registro do documento. Em seguida, o serviço extrai o texto, preserva a referência de página, divide o conteúdo em segmentos e os indexa. Apenas documentos com indexação concluída participam da busca contextual. Ao remover um documento, seus segmentos são removidos e ele deixa de aparecer em qualquer resposta futura.

## Fluxo da resposta

Para cada pergunta, a LibertyAI seleciona os segmentos mais relevantes entre os PDFs ativos. Se não houver evidência suficiente, responde claramente que a informação não consta nos documentos disponíveis. Caso exista contexto, envia ao modelo somente a instrução-base, a pergunta e os segmentos recuperados. A chamada de IA não habilita ferramentas ou pesquisa externa e as instruções proíbem usar conhecimento fora do material fornecido. A resposta retorna acompanhada das fontes documentais utilizadas.

## Implantação

Em uma VPS, a aplicação será executada em contêiner junto a um banco MySQL e a um serviço de armazenamento compatível com S3, ambos com volumes persistentes. A credencial e a URL do provedor de IA serão passadas por variáveis de ambiente e nunca serão gravadas no repositório. A configuração incluirá limites de upload e saúde dos serviços para operação previsível.
