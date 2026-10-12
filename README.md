# Indicadores públicos da Meta 1 — TJRR

Coletor independente dos indicadores agregados de 1ª, 2ª, 3ª e 4ª Vara Cível.
Fonte: https://estatistica.tjrr.jus.br/painel/meta-1
Não é um serviço oficial do TJRR. A fonte oficial prevalece.

## Execução

Node.js 24, sem dependências adicionais: `npm test` e `npm run collect`.
O coletor consulta o Qlik público numa sessão anônima, selecionando uma unidade
por vez. Não contém processos, dados pessoais, credenciais Google ou código do
sistema institucional. Publica `data/latest.json` (cumprimento corrente) e
`data/forecast.json` (série mensal e projeção por vara).

GitHub Actions: repositório **público**, runner padrão `ubuntu-24.04`, duas vezes
por dia: 00h15 e 12h15 de Boa Vista (04h15 e 16h15 UTC). Execução manual disponível.
Agendamento autorizado e ativo com `ENABLE_SCHEDULE=true`.
Timeout de 45 segundos por chamada; até duas sessões de quatro minutos, com
intervalo de dez segundos. Limite global de quinze minutos e execução serializada.
Falha não substitui o último snapshot válido. Data da fonte e da coleta são
distintas: coletar novamente não significa que o TJRR atualizou os indicadores.

## Recálculo mensal

Após a coleta corrente, `node collect-monthly.cjs` verifica meses faltantes.
Só admite mês anterior ao mês atual (UTC−04) e ao mês da atualização da fonte.
Consulta as quatro varas separadamente e confere filtro, contagem e soma anual.
Sem mês novo: preserva o arquivo sem recalcular. Com mês novo: incorpora os
valores realizados e reestima a regressão com tendência e efeitos mensais.

Projeção de 36 meses à frente, com totais anuais para o ano corrente e os dois
seguintes; soma antes do arredondamento. Faixas pontuais nominais aproximadas
80%/95% por vara, bootstrap residual em blocos de seis meses, 5.000 trajetórias.
Não são garantia de cobertura futura, nem previsão de julgamentos ou da meta.

Timeout mensal de 90 segundos, subprocesso encerrado ao exceder o prazo. Etapa
do workflow limitada a dois minutos. Falha preserva o último artefato válido e
registra aviso, sem bloquear a publicação do cumprimento corrente. Um arquivo
canônico mantém série e projeção juntas, gravadas por troca atômica.

Base inicial: janeiro/2021–setembro/2026. Meses anteriores são preservados;
eventuais revisões retroativas requerem recolha deliberada. Não coleta processos
individualizados. Não requer Python, pacotes adicionais ou credenciais.

## Custo zero

Runners padrão em repositórios públicos são gratuitos, conforme
[GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions).
Não utiliza cache, artifacts, Packages, runner ampliado, Codespaces ou recursos
Google Cloud. Não há chave ou conta de faturamento a configurar. O workflow
ignora a execução caso o repositório passe a ser privado.

O agendamento é aproximado e pode atrasar. Workflows agendados em repositórios
públicos podem ser desativados após 60 dias sem atividade. Consulte
[a documentação de agendamentos](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).
Não há garantia de disponibilidade: o consumidor deve sinalizar dados antigos.

O token temporário padrão do Actions grava exclusivamente neste repositório.
O coletor não acessa Google Sheets nem altera qualquer aplicação institucional.
