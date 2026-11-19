# Roadmap por fases

Este documento organiza a evolução do AI Twitch Bot em fases sequenciais.

Cada fase deve ser concluída antes da seguinte. Não avançar para novas funcionalidades enquanto houver riscos críticos na estabilidade, segurança ou persistência da fase atual.

## Estado atual

O projeto já possui:

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

- [ ] Validar todas as variáveis na inicialização.
- [ ] Validar nome do canal, OAuth, API key, modelo e valores numéricos.
- [ ] Impedir combinações impossíveis de limites.
- [ ] Encerrar com código não zero e mensagem clara quando a configuração estiver inválida.
- [ ] Adicionar exemplo completo de configuração em `.env.example`.

### Persistência

- [ ] Implementar escrita atomica de arquivos JSON.
- [ ] Usar arquivo temporário e renomeação ao salvar estado e idioma.
- [ ] Tratadores específicos para arquivo ausente, corrompido, sem permissão e somente leitura.
- [ ] Manter o valor anterior em memória quando uma gravação falhar.
- [ ] Criar um diretório dedicado para dados persistentes.
- [ ] Impedir o uso de arquivos persistentes com tamanho excessivo.
- [ ] Nunca versionar arquivos de estado ou secrets.

### Fila

- [ ] Adicionar timeout para uma pergunta ativa.
- [ ] Garantir que timeout ou erro sempre libera a fila.
- [ ] Remover respostas pendentes que ultrapassem o tempo máximo.
- [ ] Impedir que uma falha interna bloqueie o próximo item.
- [ ] Definir e testar o limite de espera da fila.
- [ ] Preservar a execução da fila durante falhas no Twitch reply.

### Respostas do Gemini

- [ ] Padronizar timeout, erro HTTP, rede, resposta vazia e resposta inválida.
- [ ] Aplicar backoff limitado para erros recuperáveis.
- [ ] Impedir retry em erros de autenticação ou configuração.
- [ ] Definir limite de tentativas e timeout total.
- [ ] Validar novamente a resposta antes de enviar ao Twitch.

### Conexao Twitch

- [ ] Padronizar mensagens de conexão, reconexão e desconexão.
- [ ] Adicionar limite ou backoff às reconexões excessivas.
- [ ] Garantir shutdown previsível com `SIGINT` e `SIGTERM`.
- [ ] Não iniciar novas perguntas durante o encerramento.
- [ ] Esperar ou cancelar operações já iniciadas antes de sair.

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
- interrupção durante a escrita;
- timeout real;
- fila cheia e fila vazia;
- limpeza da fila durante uma resposta ativa;
- fallback após falha do Gemini;
- falha no reply do Twitch;
- reconexão e shutdown.

---

# Fase 2 - proteger entradas e recursos

**Objetivo:** impedir abuso, prompt injection e consumo excessivo da API.

**Prioridade:** crítica.

## Entregaveis

### Protecao contra prompt injection

- [ ] Separar instruções de sistema das mensagens dos usuários.
- [ ] Impedir que o chat substitua instruções internas.
- [ ] Ignorar pedidos de credenciais, system prompts ou alteração de persona.
- [ ] Filtrar texto que pareça instrução administrativa.
- [ ] Validar toda resposta gerada antes do envio.
- [ ] Adicionar testes para “ignore as instruções anteriores”.

### Controle de abuso

- [ ] Implementar limite por usuário em janela de tempo.
- [ ] Manter cooldown global e por usuário.
- [ ] Adicionar escalamento progressivo de cooldown.
- [ ] Bloquear temporariamente usuários que repetem abuso.
- [ ] Permitir exigir conta conhecida ou papel específico para `!question`.
- [ ] Separar limites para comandos comuns e comandos administrativos.

### Segurança de conteúdo

- [ ] Expandir testes de conteúdo perigoso.
- [ ] Bloquear links inesperados, dados sensíveis e pedidos maliciosos.
- [ ] Normalizar Unicode antes das validações.
- [ ] Validar tamanho em caracteres, não apenas em bytes.
- [ ] Revisar palavras bloqueadas para evitar falsos positivos excessivos.

### Segredos e privacidade

- [ ] Garantir que `.env` esteja no `.gitignore`.
- [ ] Nunca incluir API key, OAuth ou conteúdo privado em logs.
- [ ] Configurar escopos OAuth mínimos.
- [ ] Documentar a troca de credenciais.
- [ ] Adicionar varredura de secrets no CI.
- [ ] Fazer auditoria de dependências no CI.

### Permissões

- [ ] Centralizar autorização em helpers compartilhados.
- [ ] Cobrir moderador, broadcaster e usuário comum.
- [ ] Impedir usuários com tags de Twitch inconsistentes de assumir função administrativa.
- [ ] Registrar alterações administrativas sem registrar conteúdo privado.

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

## Entregáveis

### Logs estruturados

- [ ] Adicionar eventos padronizados para conexão, comandos e fila.
- [ ] Registrar resultado, duração e status HTTP quando existir.
- [ ] Separar nível de log: debug, info, warn e error.
- [ ] Nunca registrar pergunta, resposta ou credencial.
- [ ] Reduzir logs duplicados durante reconexões.

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

- [ ] mensagens recebidas;
- [ ] comandos por tipo;
- [ ] tamanho da fila;
- [ ] tempo de espera;
- [ ] tempo de resposta da IA;
- [ ] taxa de sucesso, timeout e erro;
- [ ] comandos rejeitados por cooldown;
- [ ] reconexões;
- [ ] tamanho médio das respostas.

### Saúde do processo

- [ ] Melhorar `!status` com estado da IA e disponibilidade básica.
- [ ] Adicionar log periódico de saúde.
- [ ] Separar estado do Twitch, Gemini, persistência e fila.
- [ ] Adicionar endpoint de healthcheck local se o bot virar serviço.

### Diagnóstico

- [ ] Criar relatório inicial de configuração sem expor secrets.
- [ ] Tornar erros operacionais distinguíveis de bugs.
- [ ] Definir IDs de evento estáveis para logs operacionais.
- [ ] Documentar como investigar timeout, reconexão e falha de persistência.

## Critérios de conclusão

- cada falha relevante pode ser identificada nos logs;
- uma pergunta não deixa conteúdo sensível registrado;
- o operador sabe a saúde de Twitch, Gemini e fila;
- o dashboard ou a coleta posterior não exigem alteração do formato de logs.

## Testes da fase

- nenhum secret em logs;
- nenhum texto de usuário em logs;
- serialização JSON válida;
- eventos obrigatórios em sucesso e falha;
- atualização correta das métricas;
- healthcheck em estados variados.

---

# Fase 4 - melhorar a arquitetura

**Objetivo:** preparar o projeto para crescer sem acoplar comandos, IA e armazenamento.

**Prioridade:** média.

## Entregáveis

### Separação de responsabilidades

- [ ] Criar módulo de inicialização da aplicação.
- [ ] Extrair configuração para um validador independente.
- [ ] Extrair a conexão Twitch para `src/twitch`.
- [ ] Extrair a fila para `src/queue`.
- [ ] Extrair persistência para `src/stores`.
- [ ] Extrair observabilidade para `src/observability`.
- [ ] Extrair regras de segurança para `src/safety`.

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

- [ ] Criar contrato `AiProvider.ask(question, options)`.
- [ ] Criar contrato `StateStore.get/set`.
- [ ] Criar contrato `RateLimiter.consume(userId)`.
- [ ] Criar contrato `QuestionQueue.enqueue/dequeue/clear/status`.
- [ ] Criar contrato `Logger.info/error(event, metadata)`.

### Provider Gemini

- [ ] Separar prompts, validação e chamada HTTP.
- [ ] Permitir substituir Gemini em testes e integrações futuras.
- [ ] Não acoplar o Gemini a comandos de chat.
- [ ] Centralizar timeout e retry no provider.

### Testabilidade

- [ ] Usar injeção de dependências nos fluxos principais.
- [ ] Criar fakes de Twitch, Gemini e armazenamento.
- [ ] Executar testes de integração com concorrência controlada.
- [ ] Mover mocks grandes para helpers compartilhados.

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

## Entregaveis iniciais

### Contexto limitado

- [ ] Criar conversa curta por usuário.
- [ ] Limitar quantidade de mensagens e tempo de vida.
- [ ] Permitir `!clearcontext`.
- [ ] Não compartilhar contexto entre usuários.
- [ ] Manter contexto apenas em memória.

### Modos de resposta

- [ ] Criar modo `concise`.
- [ ] Criar modo `detailed`.
- [ ] Criar modo `educational`.
- [ ] Permitir alteração apenas por moderadores.
- [ ] Aplicar limites de tamanho por modo.

### Comandos educativos

- [ ] `!explain <termo>`;
- [ ] `!quiz`;
- [ ] `!dailyfact`;
- [ ] `!summarize`;

### Memória opt-in do canal

- [ ] Permitir cadastro somente por moderadores.
- [ ] Criar comando para listar fatos conhecidos.
- [ ] Permitir adicionar, editar e remover fatos.
- [ ] Registrar quem fez cada alteração.
- [ ] Adicionar validade para informações temporárias.

### Personalidade

- [ ] Criar perfis como tutor, comentarista ou assistente técnico.
- [ ] Validar arquivos de configuração de personalidade.
- [ ] Impedir alteração de regras de segurança por prompt.
- [ ] Permitir configuração fixa na inicialização.

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

Começar pela Fase 1, com este conjunto mínimo:

1. persistência atomica;
2. timeout da pergunta ativa;
3. padronização de falhas do Gemini;
4. testes de arquivos corrompidos e falha de escrita;
5. teste de falha que garante a liberação da fila;
6. validação ampliada da inicialização;
7. shutdown previsível.
