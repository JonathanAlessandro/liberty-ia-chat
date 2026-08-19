# Política de fontes externas da LibertyAI

A LibertyAI mantém os PDFs indexados como **fonte prioritária**. A pesquisa externa é acionada como complemento para atualizar, ampliar ou cobrir uma ausência de informação nos documentos. A resposta deve distinguir claramente informações documentais de informações externas e nunca apresentar uma fonte externa como se pertencesse a um PDF.

Além da pesquisa sob demanda, o administrador pode cadastrar páginas previamente aprovadas em `fontes.txt`. Essas páginas são importadas para o acervo, aparecem como **Lista de links** no chat e permanecem complementares aos documentos internos.

| Regra | Aplicação |
| --- | --- |
| Prioridade documental | Quando houver conflito, o conteúdo dos PDFs prevalece e o possível conflito deve ser explicado. |
| Pesquisa controlada | A busca ocorre no servidor por meio de um provedor configurado; a chave não é exposta ao navegador. |
| Rastreabilidade | Cada resultado externo exibido informa título, domínio e URL. |
| Conteúdo limitado | O modelo recebe somente os trechos retornados pela pesquisa e os segmentos documentais relevantes. |
| Segurança | Instruções encontradas em PDFs ou páginas externas são tratadas como conteúdo, nunca como comandos para a IA. |
