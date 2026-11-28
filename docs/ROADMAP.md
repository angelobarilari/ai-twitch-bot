# Roadmap por fases

Este documento organiza a evolução do AI Twitch Bot em fases sequenciais.

Cada fase deve ser concluída antes da seguinte. Não avançar para novas funcionalidades enquanto houver riscos críticos na estabilidade, segurança ou persistência da fase atual.

## Estado atual

O projeto já possui:

- Fase 1 integrada na [PR #11](https://github.com/angelobarilari/ai-twitch-bot/pull/11); Fase 2 integrada na [PR #13](https://github.com/angelobarilari/ai-twitch-bot/pull/13); Fase 3 integrada na [PR #14](https://github.com/angelobarilari/ai-twitch-bot/pull/14); Fase 4 integrada na [PR #15](https://github.com/angelobarilari/ai-twitch-bot/pull/15); Fase 5 implementada e validada nesta branch, aguardando revisão e integração;
- conexão com Twitch usando `tmi.js`;
- comandos modulares;
- integração com Gemini;
- fila limitada de perguntas;
- cooldown global e por usuário;
- limites de pergunta e resposta;
- persistência do estado de IA e do idioma;
- reconexão automática;
- comandos administrativos para moderadores;
- logs sanitizados;
- testes automatizados e CI.

---

# Fase 1 - estabilizar o bot atual

**Objetivo:** evitar corrupção de dados, travamentos e comportamento imprevisível.

**Prioridade:** crítica.

## Entregáveis

### Configuração

- [x] Validar todas as variáveis na inicialização.
- [x] Validar nome do canal, OAuth, API key, modelo e valores numéricos.
- [x] Impedir combinações impossíveis de limites.
- [x] Encerrar com código não zero e mensagem clara quando a configuração estiver inválida.
- [x] Adicionar exemplo completo de configuração em `.env.example`.

### Persistência

- [x] Implementar escrita atomica de arquivos JSON.
- [x] Usar arquivo temporário e renomeação ao salvar estado e idioma.
- [x] Tratadores específicos para arquivo ausente, corrompido, sem permissão e somente leitura.
- [x] Manter o valor anterior em memória quando uma gravação falhar.
- [x] Criar um diretório dedicado para dados persistentes.
- [x] Impedir o uso de arquivos persistentes com tamanho excessivo.
- [x] Nunca versionar arquivos de estado ou secrets.

### Fila

- [x] Adicionar timeout para uma pergunta ativa.
- [x] Garantir que timeout ou erro sempre libera a fila.
- [x] Remover perguntas pendentes que ultrapassem o tempo máximo de espera.
- [x] Impedir que uma falha interna bloqueie o próximo item.
- [x] Definir e testar o limite de espera da fila.
- [x] Preservar a execução da fila durante falhas no Twitch reply.

### Respostas do Gemini

- [x] Padronizar timeout, erro HTTP, rede, resposta vazia e resposta inválida.
- [x] Aplicar backoff limitado para erros recuperáveis.
- [x] Impedir retry em erros de autenticação ou configuração.
- [x] Definir limite de tentativas e timeout total.
- [x] Validar novamente a resposta antes de enviar ao Twitch.

### Conexao Twitch

- [x] Padronizar mensagens de conexão, reconexão e desconexão.
- [x] Configurar backoff exponencial limitado nas reconexões.
- [x] Garantir shutdown previsível com `SIGINT` e `SIGTERM`.
- [x] Não iniciar novas perguntas durante o encerramento.
- [x] Esperar ou cancelar operações já iniciadas antes de sair.

## Criterios de conclusao

- uma configuração inválida impede a inicialização completa;
- uma falha de escrita não corrompe ou altera o estado anterior;
- uma pergunta nunca deixa a fila permanentemente travada;
- timeout, resposta vazia e erro HTTP seguem caminhos testados;
- o processo encerra limpo;
- a fila continua funcional após múltiplas falhas.

## Testes da fase

- configuração ausente ou inválida;
- arquivos JSON corrompidos;
- falha de escrita;
- interrupção durante a escrita temporária, preservando o arquivo anterior;
- timeout real;
- fila cheia e fila vazia;
- limpeza da fila durante uma resposta ativa;
- fallback após falha do Gemini;
- falha no reply do Twitch;
- configuração de reconexão com backoff limitado;
- recebimento de `SIGINT` e `SIGTERM`, drenagem da fila e desconexão.

---

# Fase 2 - proteger entradas e recursos

**Objetivo:** impedir abuso, prompt injection e consumo excessivo da API.

**Prioridade:** crítica.

**Status:** implementada, validada e integrada na [PR #13](https://github.com/angelobarilari/ai-twitch-bot/pull/13). As regras, os limites e as limitações dos filtros estão em [SECURITY.md](./SECURITY.md). Os escopos mínimos devem ser selecionados ao provisionar o token; esta entrega não altera as credenciais locais existentes.

## Entregaveis

### Protecao contra prompt injection

- [x] Separar instruções de sistema das mensagens dos usuários.
- [x] Impedir que o chat substitua instruções internas.
- [x] Ignorar pedidos de credenciais, system prompts ou alteração de persona.
- [x] Filtrar texto que pareça instrução administrativa.
- [x] Validar toda resposta gerada antes do envio.
- [x] Adicionar testes para “ignore as instruções anteriores”.

### Controle de abuso

- [x] Implementar limite por usuário em janela de tempo.
- [x] Manter cooldown global e por usuário.
- [x] Adicionar escalamento progressivo de cooldown.
- [x] Bloquear temporariamente usuários que repetem abuso.
- [x] Permitir exigir conta conhecida ou papel específico para `!question`.
- [x] Separar limites para comandos comuns e comandos administrativos.

### Segurança de conteúdo

- [x] Expandir testes de conteúdo perigoso.
- [x] Bloquear links inesperados, dados sensíveis e pedidos maliciosos.
- [x] Normalizar Unicode antes das validações.
- [x] Validar tamanho em caracteres, não apenas em bytes.
- [x] Revisar palavras bloqueadas para evitar falsos positivos excessivos.

### Segredos e privacidade

- [x] Garantir que `.env` esteja no `.gitignore`.
- [x] Nunca incluir API key, OAuth ou conteúdo privado em logs.
- [x] Configurar escopos OAuth mínimos.
- [x] Documentar a troca de credenciais.
- [x] Adicionar varredura de secrets no CI.
- [x] Fazer auditoria de dependências no CI.

### Permissões

- [x] Centralizar autorização em helpers compartilhados.
- [x] Cobrir moderador, broadcaster e usuário comum.
- [x] Impedir usuários com tags de Twitch inconsistentes de assumir função administrativa.
- [x] Registrar alterações administrativas sem registrar conteúdo privado.

## Criterios de conclusao

- texto malicioso não altera estado, idioma ou fila;
- usuário que faz spam não derruba a API ou o bot;
- credenciais não aparecem em logs, respostas ou artefatos de CI;
- todas as ações administrativas passam pela mesma camada de autorização;
- o bot continua disponível sob tentativa repetida de abuso.

## Testes da fase

- prompt injection em português e inglês;
- Unicode inválido e texto normalizado;
- flood por um usuário;
- flood global;
- cooldown em escalamento;
- tags falsas ou incompletas;
- autenticação administrativa;
- respostas contendo possível conteúdo sensível;
- auditoria de dependências e secrets.

---

# Fase 3 - observar e operar

**Objetivo:** tornar falhas visíveis e facilitar diagnóstico em produção.

**Prioridade:** alta.

**Status:** implementada, validada em Windows/Linux e integrada na [PR #14](https://github.com/angelobarilari/ai-twitch-bot/pull/14). As fases 1 a 3 passaram novamente na validação local sem `.env`, formatação, build e auditoria de dependências antes da abertura da branch da Fase 4. Não há pendências aplicáveis às fases anteriores; o endpoint HTTP abaixo permanece condicionado à futura execução como serviço.

## Entregáveis

### Logs estruturados

- [x] Adicionar eventos padronizados para conexão, comandos e fila.
- [x] Registrar resultado, duração e status HTTP quando existir.
- [x] Separar nível de log: debug, info, warn e error.
- [x] Nunca registrar pergunta, resposta ou credencial.
- [x] Reduzir logs duplicados durante reconexões.

Eventos iniciais sugeridos:

```json
{
  "event": "question.completed",
  "outcome": "success",
  "durationMs": 842,
  "queueWaiting": 2
}
```

### Métricas locais

- [x] mensagens recebidas;
- [x] comandos por tipo;
- [x] tamanho da fila;
- [x] tempo de espera;
- [x] tempo de resposta da IA;
- [x] taxa de sucesso, timeout e erro;
- [x] comandos rejeitados por cooldown;
- [x] reconexões;
- [x] tamanho médio das respostas.

### Saúde do processo

- [x] Melhorar `!status` com estado da IA e disponibilidade básica.
- [x] Adicionar log periódico de saúde.
- [x] Separar estado do Twitch, Gemini, persistência e fila.
- [ ] Adicionar endpoint de healthcheck local se o bot virar serviço. **Condicional:** o bot continua como processo CLI; saúde local disponível em `!status` e `process.health`, sem listener HTTP.

### Diagnóstico

- [x] Criar relatório inicial de configuração sem expor secrets.
- [x] Tornar erros operacionais distinguíveis de bugs.
- [x] Definir IDs de evento estáveis para logs operacionais.
- [x] Documentar como investigar timeout, reconexão e falha de persistência.

### Execução e descoberta de testes

- [x] Substituir a lista manual de arquivos no script `test` do `package.json` por descoberta automática de `src/**/*.test.ts`.
- [x] Garantir que novos testes sejam incluídos sem editar o `package.json`, sem executar arquivos de `dist/` ou `node_modules/`.
- [x] Usar uma solução compatível com Windows e Linux/CI, sem depender da expansão de glob do shell.
- [x] Preservar a execução com TypeScript, o isolamento dos testes e o código de saída não zero quando houver falhas.
- [x] Alinhar `test:watch` à mesma descoberta e documentar como executar um arquivo específico.

## Critérios de conclusão

- cada falha relevante pode ser identificada nos logs;
- uma pergunta não deixa conteúdo sensível registrado;
- o operador sabe a saúde de Twitch, Gemini e fila;
- o dashboard ou a coleta posterior não exigem alteração do formato de logs.
- novos arquivos `*.test.ts` em `src/` são executados por `npm test` sem manutenção de uma lista manual.

## Testes da fase

- nenhum secret em logs;
- nenhum texto de usuário em logs;
- serialização JSON válida;
- eventos obrigatórios em sucesso e falha;
- atualização correta das métricas;
- healthcheck em estados variados.
- descoberta de testes em diretórios aninhados, inclusão automática de um novo arquivo e propagação de falhas no Windows e no CI.

---

# Fase 4 - melhorar a arquitetura

**Objetivo:** preparar o projeto para crescer sem acoplar comandos, IA e armazenamento.

**Prioridade:** média.

**Status:** implementada, validada em Windows/Linux e integrada na [PR #15](https://github.com/angelobarilari/ai-twitch-bot/pull/15), com cobertura global mínima obrigatória de 90% nas quatro métricas.

## Entregáveis

### Separação de responsabilidades

- [x] Criar módulo de inicialização da aplicação.
- [x] Extrair configuração para um validador independente.
- [x] Extrair a conexão Twitch para `src/twitch`.
- [x] Extrair a fila para `src/queue`.
- [x] Extrair persistência para `src/stores`.
- [x] Extrair observabilidade para `src/observability`.
- [x] Extrair regras de segurança para `src/safety`.

Estrutura sugerida:

```text
src/
  app.ts
  config.ts
  twitch/
  commands/
  ai/
  queue/
  stores/
  observability/
  safety/
```

### Contratos

- [x] Criar contrato `AiProvider.ask(question, options)`.
- [x] Criar contrato `StateStore.get/set`.
- [x] Criar contrato `RateLimiter.consume(userId)`.
- [x] Criar contrato `QuestionQueue.enqueue/dequeue/clear/status`.
- [x] Criar contrato `Logger.info/error(event, metadata)`.

### Provider Gemini

- [x] Separar prompts, validação e chamada HTTP.
- [x] Permitir substituir Gemini em testes e integrações futuras.
- [x] Não acoplar o Gemini a comandos de chat.
- [x] Centralizar timeout e retry no provider.

### Testabilidade

- [x] Usar injeção de dependências nos fluxos principais.
- [x] Criar fakes de Twitch, Gemini e armazenamento.
- [x] Executar testes de integração com concorrência controlada.
- [x] Mover mocks grandes para helpers compartilhados.

Os contratos e as fábricas da aplicação não iniciam conexão, leem `.env` ou criam stores na importação. `src/index.ts` compõe as dependências reais; `src/app.ts` recebe transportes, stores, provider, fila e telemetria. Adaptadores nos caminhos anteriores preservam a API dos testes e comandos existentes. Os fakes compartilhados estão em `src/test-support/fakes.ts`. A suíte local passou em 130 testes sem carregar `.env`, incluindo isolamento entre instâncias, troca de provider e store, fila serial, falhas de reply, drenagem no shutdown e recuperação de saúde da persistência.

### Cobertura e organização da documentação

- [x] Adicionar medição de linhas, statements, branches e funções com `npm run test:coverage`.
- [x] Incluir implementações não importadas pela suíte e excluir testes, fakes e contratos sem código executável.
- [x] Gerar HTML, JSON, LCOV e resultado de testes em JUnit dentro de `reports/`, sem versionar artefatos gerados.
- [x] Configurar a CI para coletar relatórios de Windows/Linux e disponibilizá-los como artefatos.
- [x] Centralizar documentação mantida em `docs/`, preservando o README principal na raiz e atualizando os links.
- [x] Documentar interpretação, limitações e próximos passos para limites mínimos de cobertura em [QUALITY.md](./QUALITY.md).

É obrigatório manter pelo menos 90% globais em cada métrica: linhas, statements, funções e branches. `npm run test:coverage` e a CI falham se qualquer métrica ficar abaixo desse piso. Os limites não devem ser reduzidos para aprovar alterações. A entrega inclui essa verificação na CI de Windows/Linux.

## Criterios de conclusao

- trocar Gemini não exige alterar todos os comandos;
- trocar persistência não exige alterar todos os comandos;
- os testes não dependem de rede real;
- cada módulo possui responsabilidade única;
- os módulos podem ser testados isoladamente.

---

# Fase 5 - adicionar funcionalidades ao bot

**Objetivo:** aumentar utilidade e engajamento depois da estabilidade.

**Prioridade:** média.

**Status:** implementada e validada na branch `feature/phase-5-engagement`, com entregas incrementais e cobertura mínima de 90%. A suíte passou em 152 testes, incluindo isolamento, TTL, invalidação de contexto, modos/perfis, comandos educativos, autorização, auditoria e persistência da memória. Consulte [FEATURES.md](./FEATURES.md).

## Entregaveis iniciais

### Contexto limitado

- [x] Criar conversa curta por usuário.
- [x] Limitar quantidade de mensagens e tempo de vida.
- [x] Permitir `!clearcontext`.
- [x] Não compartilhar contexto entre usuários.
- [x] Manter contexto apenas em memória.

### Modos de resposta

- [x] Criar modo `concise`.
- [x] Criar modo `detailed`.
- [x] Criar modo `educational`.
- [x] Permitir alteração apenas por moderadores.
- [x] Aplicar limites de tamanho por modo.

### Comandos educativos

- [x] `!explain <termo>`;
- [x] `!quiz`;
- [x] `!dailyfact`;
- [x] `!summarize`;

### Memória opt-in do canal

- [x] Permitir cadastro somente por moderadores.
- [x] Criar comando para listar fatos conhecidos.
- [x] Permitir adicionar, editar e remover fatos.
- [x] Registrar quem fez cada alteração.
- [x] Adicionar validade para informações temporárias.

### Personalidade

- [x] Criar perfis como tutor, comentarista ou assistente técnico.
- [x] Validar arquivos de configuração de personalidade.
- [x] Impedir alteração de regras de segurança por prompt.
- [x] Permitir configuração fixa na inicialização.

## Criterios de conclusão

- todo recurso novo possui limites claros;
- toda memória ou contexto possui TTL;
- a fila continua limitada;
- usuários não podem alterar regras administrativas;
- os novos comandos possuem testes e documentação.

---

# Fase 6 - ferramentas controladas

**Objetivo:** permitir ações úteis sem dar acesso arbitrário ao sistema.

**Prioridade:** baixa até as fases anteriores estarem concluídas.

## Entregaveis

- [ ] Criar allowlist de ferramentas disponíveis.
- [ ] Permitir consulta de horário.
- [ ] Permitir consulta da lista de comandos.
- [ ] Permitir consulta do status do bot.
- [ ] Permitir consulta de APIs públicas aprovadas.
- [ ] Validar parâmetros antes de executar qualquer ferramenta.
- [ ] Nunca executar shell arbitrário.
- [ ] Nunca permitir acesso direto ao sistema de arquivos.
- [ ] Limitar quantidade de chamadas por ferramenta.

Exemplos futuros de ferramentas:

- horário atual;
- uptime;
- estado da IA;
- documentação interna do bot;
- dados públicos de uma API permitida.

## Criterios de conclusao

- a IA não executa ações fora da allowlist;
- toda chamada é validada;
- toda ferramenta possui timeout;
- toda ferramenta possui teste e limite de uso.

---

# Fase 7 - integrações e interface

**Objetivo:** ampliar integração sem aumentar o risco da arquitetura principal.

**Prioridade:** baixa.

## Entregaveis

- [ ] Suporte a boas-vindas e eventos de canal.
- [ ] Integração opcional com Twitch EventSub.
- [ ] Comandos de uptime e clips.
- [ ] Dashboard local para fila e estado.
- [ ] Interface de moderação de memória.
- [ ] Integração opcional com OBS sem controle irrestrito do computador.
- [ ] Suporte a mais de um canal.
- [ ] Suporte a provedores de IA adicionais.

## Criterios de conclusao

- integrações são opcionais;
- falha externa não derruba o bot;
- dashboard não expõe secrets;
- canais compartilham somente estado necessário;
- a integração possui testes ou fakes.

---

# Fase 8 - melhorar escala e distribuição

**Objetivo:** preparar o bot para operação contínua em múltiplos canais.

**Prioridade:** baixa.

## Entregaveis

- [ ] Migrar armazenamento de arquivo para banco de dados opcional.
- [ ] Adicionar locks ou serialização de escrita.
- [ ] Adicionar cache com TTL.
- [ ] Separar workers de IA e conexão Twitch.
- [ ] Criar limite global e por canal.
- [ ] Exportar métricas anonimizadas.
- [ ] Definir estratégia de implantação e reinício.
- [ ] Criar backup e recuperação.
- [ ] Adicionar autenticação OAuth via interface quando necessário.

## Criterios de conclusao

- duas instâncias não corrompem o mesmo estado;
- uma indisponibilidade externa não derruba tudo;
- estado é recuperável após reinício;
- métricas não incluem dados pessoais;
- implantação pode ser revertida.

---

# Fase 9 - qualidade contínua

**Objetivo:** manter qualidade em todas as alterações futuras.

**Prioridade:** contínua.

## Entregaveis

- [ ] `npm ci`;
- [ ] `npm run format:check`;
- [ ] `npm test`;
- [ ] `npm run build`;
- [ ] auditoria de dependências;
- [ ] scanner de secrets;
- [ ] testes em Node 20 e Node LTS suportado;
- [ ] revisão obrigatória dos arquivos de estado e configuração;
- [ ] testes de fuzzing em argumentos de comandos;
- [ ] revisão periódica de permissões;
- [ ] revisão periódica de logs;
- [ ] manutenção de dependências em lote controlado.

## Criterios de conclusao

- nenhuma alteração entra sem os checks básicos;
- todos os PRs incluem teste para comportamento novo;
- falhas de segurança são corrigidas antes de novas funcionalidades;
- documentação acompanha mudanças de configuração.

---

# O que não implementar cedo

- execução arbitrária de comandos;
- acesso direto ao sistema de arquivos via prompt;
- memória permanente sem consentimento;
- armazenamento de perguntas completas por padrão;
- acesso a variáveis de ambiente pelo chat;
- respostas sem limite de tamanho;
- fila ilimitada;
- retry infinito;
- cobrança ou integrações financeiras sem auditoria;
- compartilhamento externo de logs sem sanitização;
- controle irrestrito do OBS ou computador.

# Próxima entrega recomendada

Revisar e integrar a Fase 5. A entrega inclui contexto curto por usuário, modos de resposta, perfis fixos de personalidade, comandos educativos e memória opt-in do canal com TTL, autoria e limites. A fila e as proteções anteriores permanecem compartilhadas entre todos os comandos de IA. Não iniciar a Fase 6 antes da validação e integração da Fase 5.

As orientações de operação e recuperação de persistência estão no [README.md](../README.md#operating-and-troubleshooting).
