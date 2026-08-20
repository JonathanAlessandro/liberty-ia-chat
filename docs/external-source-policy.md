# Política de fontes externas da LibertyAI

A LibertyAI trata PDFs, imagens e planilhas internas como **materiais de treinamento**. Páginas previamente aprovadas em `fontes.txt` podem ser tratadas como **fontes oficiais cadastradas**, desde que o administrador inclua somente endereços das próprias operadoras, órgãos reguladores ou entidades de referência. A resposta sempre deve distinguir a origem de cada informação.

Além da pesquisa automática sob demanda, o administrador pode cadastrar páginas previamente aprovadas em `fontes.txt`. Quando `TAVILY_API_KEY` está configurada, a LibertyAI consulta a busca complementar a cada pergunta sem exigir um comando adicional do corretor. Essas páginas são importadas para o acervo, aparecem como **Lista de links** no chat e são consideradas junto aos materiais internos mediante os critérios de vigência e autoridade abaixo.

| Regra | Aplicação |
| --- | --- |
| Vigência e autoridade | Antes da chamada à IA, a LibertyAI ordena os trechos de uma página oficial cadastrada à frente do treinamento interno somente quando ambos pertencem à mesma operadora e a data declarada da página é posterior. |
| Metadados comparáveis | O treinamento interno recebe a data `AAAA-MM-DD` do nome/caminho do arquivo. A página cadastrada recebe a data e a operadora declaradas na própria linha de `fontes.txt`: `URL|AAAA-MM-DD|operadora`. |
| Sem inferência | A data de indexação, a data de download e a aparência de atualização na página não são usadas como prova automática de vigência. Uma URL sem data ou sem operadora cadastrada continua disponível, porém não aciona o desempate determinístico. |
| Conflito sem data | Se as fontes conflitarem sem versão ou vigência comparável, a resposta explica a divergência e orienta confirmação com a operadora; não escolhe por suposição. |
| PDF interno | É identificado como material de treinamento, não como regra automaticamente vigente. |
| Pesquisa controlada | A busca ocorre no servidor por meio de um provedor configurado; a chave não é exposta ao navegador. |
| Rastreabilidade | Cada resultado externo exibido informa título, domínio e URL. |
| Conteúdo limitado | O modelo recebe somente os trechos retornados pela pesquisa e os segmentos documentais relevantes. |
| Segurança | Instruções encontradas em PDFs ou páginas externas são tratadas como conteúdo, nunca como comandos para a IA. |

> A ordenação determinística não exclui o material interno do contexto. Ela o mantém rastreável e posiciona primeiro a página oficial comprovadamente mais recente, para que a IA possa explicar o critério e a eventual divergência.
