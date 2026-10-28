# Chats permanentes por usuário

Cada conta autenticada tem sua própria lista de chats. O navegador identifica a sessão de uso, mas não restringe o acesso às conversas da mesma conta. Ler, continuar, renomear e excluir chats sempre verifica `ownerUserId` a partir da sessão autenticada; IDs enviados pelo cliente nunca autorizam acesso a outra conta.

A interface mantém a lista lateral, permite criar chats independentes, retomar e renomear conversas e excluir somente após confirmação. As consultas em cache incluem a conta para impedir que um histórico em cache apareça para outra conta no mesmo navegador. O último chat selecionado é lembrado localmente por conta; a lista completa vem do banco em qualquer navegador.

O histórico completo fica no banco até exclusão explícita. A migração `0010_open_grandmaster.sql` define retenção permanente e converte mensagens antigas ainda existentes. Ela não apaga mensagens. Mensagens já excluídas antes desta mudança só poderão ser recuperadas por um backup do banco. Conversas legadas sem proprietário não são atribuídas automaticamente a ninguém.

Ao responder, a IA recebe as duas mensagens iniciais e até 20 mensagens recentes do chat selecionado, sem duplicatas, limitadas a 2.000 caracteres por mensagem. O restante do histórico continua disponível para leitura; não existe promessa de memória ilimitada do modelo. Perguntas curtas podem usar o assunto anterior do mesmo chat para recuperar documentos e pesquisar, sem misturar usuários ou chats.

Os novos chats são registrados antes de enviar a primeira pergunta. Assim, uma falha da IA não perde a identificação da conversa ou mistura a tentativa com um novo chat.

## Implantação

O processo de produção executa as migrações antes de iniciar o servidor (`scripts/start.sh`). A mudança precisa ser publicada e implantada para afetar o site em produção. Nenhuma migração foi aplicada ao banco de produção durante a implementação local.
