# Testes, cobertura e relatórios

Cobertura mede o código executado pela suíte, não a qualidade das asserções. Ela ajuda a localizar fluxos sem testes; não substitui testes de comportamento, revisão ou observabilidade em produção.

## Comandos

```bash
npm test
npm run test:watch
npm run test:report
npm run test:coverage
npm run test:coverage -- src/services/gemini.test.ts
```

`npm test` mantém a execução rápida sem relatórios. `test:report` executa a mesma descoberta e produz JUnit, preservando a saída no terminal. `test:coverage` executa a suíte uma vez, produz JUnit e mede a cobertura com c8/V8, remapeando os resultados para TypeScript. `--report` não é combinado com watch. Relatórios são sobrescritos na próxima execução; uma execução filtrada mede somente os testes selecionados e não representa a cobertura da suíte completa.

| Caminho                                  | Conteúdo                                    |
| ---------------------------------------- | ------------------------------------------- |
| `reports/tests/junit.xml`                | Resultado dos testes para ferramentas de CI |
| `reports/coverage/index.html`            | Relatório navegável por arquivo e linha     |
| `reports/coverage/coverage-summary.json` | Percentuais para leitura por ferramentas    |
| `reports/coverage/lcov.info`             | Formato de intercâmbio de cobertura         |
| `reports/coverage/.tmp/`                 | Dados intermediários locais da coleta V8    |

Abra `reports/coverage/index.html` no navegador após executar o comando. A pasta `reports/` é ignorada pelo Git e pelo Prettier. Na CI, os relatórios são disponibilizados como artefatos por sistema operacional, com retenção de sete dias; os dados temporários ocultos não são enviados.

## Escopo e interpretação

A configuração está em `.c8rc.json`. O relatório inclui `src/**/*.ts`, inclusive implementações que nenhum teste importou, contabilizadas como não cobertas. Testes, fakes e módulos contendo apenas contratos de tipos são excluídos; `dist/` e dependências não entram na medição. Os adaptadores reais de entrada e Twitch continuam no relatório, mesmo quando não exercitados, para não esconder lacunas de integração.

- **Linhas e statements:** código executado ao menos uma vez.
- **Branches:** alternativas de execução, como sucesso, erro, permissão negada e timeout.
- **Funções:** funções chamadas pela suíte.

A cobertura global deve permanecer sempre em **no mínimo 90% para cada métrica: linhas, statements, funções e branches**. A configuração `check-coverage` em `.c8rc.json` faz `npm run test:coverage` retornar código não zero quando qualquer métrica ficar abaixo desse piso, mesmo que todos os testes passem. A CI executa essa verificação em Windows e Linux. Não reduzir os limites ou excluir código executável para contornar uma falha; adicionar testes de comportamento para os caminhos descobertos. Priorizar erros, segurança, persistência e fila.

Antes de publicar qualquer alteração, executar a suíte completa com `npm run test:coverage`, além da formatação e do build. Uma execução filtrada continua sujeita ao piso global e pode falhar por não exercitar o restante da aplicação; ela serve para diagnóstico, não para aprovação da entrega.

Documentação e decisões ficam em `docs/`; relatórios reproduzíveis ficam em `reports/`. Ao compartilhar relatórios, lembrar que HTML e LCOV incluem referências ao código-fonte e que JUnit pode incluir saída dos testes. Não registrar credenciais ou dados reais nos testes.
