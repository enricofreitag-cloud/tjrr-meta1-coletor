# Indicadores públicos da Meta 1 — TJRR

Coletor independente dos indicadores agregados de 1ª, 2ª, 3ª e 4ª Vara Cível.
Fonte: https://estatistica.tjrr.jus.br/painel/meta-1
Não é um serviço oficial do TJRR. A fonte oficial prevalece.

## Execução

Node.js 24, sem dependências adicionais: `npm test` e `npm run collect`.
O coletor consulta o Qlik público numa sessão anônima, selecionando uma unidade
por vez. Não contém processos, dados pessoais, credenciais Google ou código do
sistema institucional. A única saída publicada é `data/latest.json`.

GitHub Actions: repositório **público**, runner padrão `ubuntu-24.04`, duas vezes
por dia: 00h15 e 12h15 de Boa Vista (04h15 e 16h15 UTC). Execução manual disponível.
Durante a preparação, agendamento fica pausado: somente execuções manuais rodam.
Após aprovação, definir a variável de repositório `ENABLE_SCHEDULE` como `true`.
Timeout de 45 segundos por chamada; até duas sessões de quatro minutos, com
intervalo de dez segundos. Limite global de dez minutos e execução serializada.
Falha não substitui o último snapshot válido. Data da fonte e da coleta são
distintas: coletar novamente não significa que o TJRR atualizou os indicadores.

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
