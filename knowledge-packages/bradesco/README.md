# Base consolidada Bradesco — seguro viagem

Arquivo de importação: `Bradesco_PME_Seguro_Viagem_Schengen_Exterior.knowledge.json`.

São 38 blocos independentes construídos a partir do folheto Seguro Viagem - Nacional e NP, do Manual_SeguroViagem_090123 e do trecho de assistência em viagem do Painel Bradesco PME coletado em 28/10/2026. Cada bloco declara produto/versão, assunto, situação documental, conteúdo e páginas das fontes. Os três arquivos originais são identificados por nome, total de páginas e SHA-256. Nenhum PDF foi alterado.

## Conteúdo e tratamento das diferenças

- Limites de assistência por Plano I, II e III; capitais de reembolso em blocos separados.
- Nacional antigo até 30/06/2022 separado do Nacional a partir de 01/07/2022; Schengen do Nacional novo preservado.
- Diferenças de duração (menos de 90 / não superior a 90 dias), distância (residência / município) e pós-pagamento sem Concierge mantidas como divergências.
- Regional mencionado somente pelo Painel permanece não confirmado pelos outros PDFs; Preferencial Plus conserva o enquadramento do manual.
- Carta/certificado, emissão por beneficiário, canais, COVID-19, benefícios e limites com suas condições.
- Valores em EUR/USD não são somados nem confundidos com capitais de reembolso em BRL. Telefones e lista histórica de países não foram verificados em fontes atuais.

A data de organização **não é vigência**. `effectiveAt` é nulo. Esta base não garante cobertura de uma apólice específica nem estabelece qual edição contratual está vigente hoje.

## Importar após publicar a versão com suporte ao formato

1. No administrador, envie somente o arquivo `.knowledge.json`. Pode ser enviado sem pasta: a operadora `bradesco` vem no arquivo. Se escolher pasta, use **Bradesco**.
2. Aguarde o status pronto. Não é necessário reindexar todos os PDFs, nem enviá-los novamente. A importação desse JSON não usa API de IA.
3. Alternativamente, copie o mesmo arquivo para a pasta `bradesco` dentro do volume monitorado por `KNOWLEDGE_DIR`.

O índice mantém cada bloco inteiro com seus metadados e referências. No chat, a citação usa **bloco**, sem inventar uma página de PDF para o JSON. Os nomes e páginas dos PDFs originais permanecem dentro do trecho recuperado. O arquivo tem nome descritivo para que perguntas de seguro viagem/Schengen/exterior encontrem a base específica; assuntos como carências e formação do grupo continuam no manual geral.

Não remova o Painel geral: ele contém outros assuntos que não fazem parte desta consolidação. Os originais devem ser mantidos como arquivo de referência. A base não foi importada no ambiente publicado nem foram feitas perguntas à IA durante sua preparação.

## Manutenção e validação

Edite o gerador `scripts/build-bradesco-travel-knowledge.mjs`, mantendo as referências conferidas, e execute:

```powershell
node scripts/build-bradesco-travel-knowledge.mjs 'C:/Users/liber/Downloads/Seguro Viagem - Nacional e NP.pdf' 'C:/Users/liber/Downloads/Manual_SeguroViagem_090123.pdf'
```

O gerador usa o Painel preservado no projeto. Se as fontes mudarem, é necessário revisar o conteúdo e os números de página, não apenas gerar novos hashes. Testes locais validam estrutura, referências, páginas, blocos indivisíveis, importação, citação e recuperação lexical dos assuntos, sem consultar um modelo.
