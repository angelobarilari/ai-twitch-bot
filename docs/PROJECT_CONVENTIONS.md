# Padroes do projeto

Este documento define como codigo, testes e arquivos devem ser escritos no AI Twitch Bot.

## 1. Principios gerais

- preferir codigo simples e direto;
- preservar tipagem estrita;
- adicionar validacao na fronteira dos dados externos;
- separar parsing, regras de negocio, transporte e persistencia;
- usar pequenas funcoes com responsabilidade unica;
- testar sucesso e caminhos de falha;
- nao registrar dados sensiveis;
- nao adicionar dependencias quando a API padrao resolver.

Quando houver conflito entre concisao e clareza, preferir clareza.

## 2. Padrao de funcoes

Todas as funcoes novas devem usar arrow functions.

```ts
const parseName = (value: string): string => {
  return value.trim();
};

export const loadStatus = (): string => {
  return "enabled";
};
```

Funcoes async tambem usam arrow functions:

```ts
const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
  await client.disconnect();
};

export const statusCommand: CommandHandler = async ({ reply }): Promise<void> => {
  await reply("AI is enabled.");
};
```

Funcoes que podem ser reutilizadas devem ser exportadas como constantes.

```ts
export const isModerator = (tags: ChatUserstate): boolean => {
  return tags.mod === true;
};
```

Toda funcao nova nomeada deve ter um bloco JSDoc imediatamente antes da declaracao, seja publica ou privada. O bloco deve explicar o comportamento, documentar cada parametro com `@param` e o resultado com `@returns`; incluir `@throws` quando a funcao puder lancar erros esperados. Para funcoes sem parametros ou sem valor de retorno, ainda documentar esses fatos. Callbacks anonimos e funcoes usadas somente dentro de testes nao precisam de JSDoc.

```ts
/**
 * Splits a response into chunks that fit within the chat message limit.
 *
 * @param message Response text to split.
 * @param maxLength Maximum length allowed per chunk.
 * @returns Trimmed chunks, preferring to split at word boundaries.
 */
export const splitForTwitch = (message: string, maxLength: number): string[] => {
  // ...
};
```

Nao criar novas declarations com `function`.

```ts
// nao fazer
function parseName(value: string): string {}

// fazer
const parseName = (value: string): string => {};
```

## 3. Tipagem

- habilitar strict mode;
- tipar parametros, retornos publicos e objetos externos;
- inferir tipos locais simples;
- evitar `any`;
- evitar casts desnecessarios;
- validar `unknown` antes de usar como objeto;
- preferir tipos pequenos e colocados perto do uso;
- usar `readonly` quando uma colecao nao dever ser alterada;
- usar interfaces somente quando houver extensao ou semantica de implementacao.

Exemplo:

```ts
type AiResponse = {
  answer: string;
};

const parseResponse = (value: unknown): AiResponse | null => {
  if (typeof value !== "object" || value === null) return null;

  const answer = (value as { answer?: unknown }).answer;
  if (typeof answer !== "string") return null;

  return { answer };
};
```

Nao usar `as unknown as T` como atalho.

## 4. Imports

- usar imports relativos explicitos;
- incluir `.js` em imports locais de codigo TypeScript;
- usar `import type` para tipos;
- agrupar imports externos antes dos locais;
- nao criar dependencias circulares;
- nao importar uma implementacao quando apenas um contrato for necessario.

Exemplo:

```ts
import type tmi from "tmi.js";
import type { CommandHandler } from "../types/commands.js";
import { isModerator } from "../shared/permissions.js";
```

## 5. Estrutura de arquivos

Cada comando deve ficar em seu proprio diretorio:

```text
src/commands/<nome>/
  index.ts
  <nome>.test.ts
```

O `index.ts` do comando deve expor apenas seu handler ou fabrica relacionada.

```ts
export const pingCommand: CommandHandler = async ({ reply }): Promise<void> => {
  await reply("Pong.");
};
```

Testes ficam no mesmo nivel do modulo testado ou em seu diretorio.

Codigo compartilhado fica em:

```text
src/commands/shared/
```

Servicos externos ficam em:

```text
src/services/
```

Na arquitetura da Fase 4, `src/services/` preserva adaptadores de compatibilidade. Novas implementações usam os módulos de domínio: `src/ai` para providers e respostas, `src/twitch` para transporte, `src/queue` para agendamento, `src/stores` para persistência, `src/observability` para logs/métricas/saúde e `src/safety` para conteúdo, permissões e limites de abuso. A composição fica em `src/app.ts`; o ponto de entrada `src/index.ts` carrega configuração, cria dependências reais e registra sinais.

Fábricas de domínio recebem dependências explicitamente e não devem ler `.env`, abrir arquivos de estado ou iniciar conexões durante a importação. O validador independente é `src/config/validate.ts`; `src/config.ts` mantém o adaptador para o ambiente do processo. Comandos com dependências expõem a fábrica em `handler.ts`; os `index.ts` existentes mantêm handlers padrão para compatibilidade. Código novo de composição deve importar a fábrica sem inicializar esses adaptadores.

Providers implementam `AiProvider`, stores implementam `StateStore<T>`, limitadores implementam `RateLimiter`, a fila implementa `QuestionQueue` e o logger implementa `Logger`. Prefira os contratos aos detalhes de implementação. Use os fakes compartilhados de `src/test-support/fakes.ts` e promessas controladas nos testes de integração; não use credenciais locais ou rede real.

Utilidades puras ficam em:

```text
src/utils/
```

Cada utilitario independente deve ter seu proprio diretorio, nomeado em kebab-case a partir do nome da funcao, com a implementacao em `index.ts` e seu teste focado no mesmo diretorio:

```text
src/utils/
  split-for-twitch/
    index.ts
    split-for-twitch.test.ts
  remaining-seconds/
    index.ts
    remaining-seconds.test.ts
```

Nao agrupar funcoes utilitarias independentes em um arquivo generico. Constantes e helpers privados podem ficar com o utilitario ao qual pertencem; funcoes reutilizadas por mais de um utilitario devem ter um diretorio proprio e testes proprios.

## 6. Comandos Twitch

- todo handler implementa `CommandHandler`;
- comandos sem argumento devem validar argumento vazio;
- argumentos invalidos devem retornar erro curto de uso;
- nomes de comandos devem ser tratados em minusculas;
- todo reply deve passar pela funcao injetada no contexto;
- comandos administrativos devem usar a permissao centralizada;
- respostas administrativas devem permanecer em ingles;
- respostas geradas devem seguir o idioma configurado;
- mensagens enviadas ao Twitch devem respeitar o limite configurado.

Exemplo:

```ts
export const statusCommand: CommandHandler = async ({ reply, tags }): Promise<void> => {
  if (!isModerator(tags)) {
    await reply("Only moderators and the broadcaster can use this command.");
    return;
  }

  await reply("Status.");
};
```

Comandos novos devem ser registrados em `src/commands/router.ts`.

## 7. Validacao

- validar variaveis de ambiente no inicio;
- validar JSON antes de acessar propriedades;
- validar argumentos de comando;
- validar respostas externas;
- converter entradas brutas apenas uma vez;
- usar limites positivos e seguros;
- impedir tamanho excessivo de input;
- falhar antes de realizar efeitos externos.

Exemplo:

```ts
const value = process.env.MAX_PENDING_QUESTIONS?.trim();
if (!value || !Number.isSafeInteger(Number(value)) || Number(value) <= 0) {
  throw new Error("MAX_PENDING_QUESTIONS must be a positive safe integer.");
}
```

## 8. Erros

- lancar erros com contexto util;
- usar `unknown` em catches;
- nao expor payload, URL privada ou secret;
- relatar falhas persistidas sem alterar o estado anterior;
- registrar o erro apenas no ponto de tratamento adequado;
- nao engolir erro silenciosamente;
- nao tentar continuar um processo em estado desconhecido.

Exemplo:

```ts
try {
  writeState(value);
} catch (error) {
  throw new Error("Failed to persist AI state.", { cause: error });
}
```

Para mensagens de Twitch, fornecer uma resposta curta e nao tecnica.

## 9. Persistencia

- estado persistente deve ter estrutura valida;
- arquivo ausente pode ter fallback documentado;
- JSON invalido nao deve ser silenciosamente substituido;
- escrita deve preferir operacao atomica;
- manter o estado anterior se a escrita falhar;
- nunca registrar ou enviar o conteudo persistido por acidente;
- nao incluir arquivos de estado no controle de versao.

## 10. APIs externas

- aplicar timeout em toda chamada externa;
- usar AbortController quando a biblioteca suportar;
- validar HTTP status;
- validar JSON;
- validar campos esperados;
- registrar outcome, duration e status sem conteudo;
- nao repetir chamadas infinitamente;
- nao usar retry em credenciais invalidas.

## 11. Seguranca

- secrets ficam somente em variaveis de ambiente;
- `.env` nao deve ser versionado;
- logs nao devem conter question, answer ou credenciais;
- respostas devem passar por filtros de segurança;
- instrucoes do usuario nao podem sobrescrever instrucoes internas;
- qualquer funcionalidade que execute ferramenta deve usar allowlist;
- nunca executar shell a partir de texto recebido no chat;
- permissao administrativa deve ser centralizada.

## 12. Cooldowns e filas

- cooldown global e por usuario devem ser separados;
- perguntas aceitas devem entrar na fila;
- fila deve ter limite configurado;
- uma falha nao pode bloquear o item seguinte;
- timeout deve liberar o item ativo;
- status da fila deve ser separado de status da IA;
- limpeza da fila nao deve cancelar uma pergunta ativa.

## 13. Logs

Usar JSON estruturado para eventos novos:

```ts
console.info(
  JSON.stringify({
    event: "gemini.request",
    outcome: "success",
    durationMs: 842,
  }),
);
```

Campos proibidos em logs:

- pergunta completa;
- resposta completa;
- API key;
- OAuth token;
- password;
- payload bruto do provedor;
- secrets em mensagens de erro.

## 14. Testes

Documentação mantida fica em `docs/`, com índice em `docs/README.md`; o README da raiz continua sendo a porta de entrada do projeto. Configurações e instruções de ferramentas em `.github/` permanecem em seus caminhos próprios. Relatórios gerados ficam em `reports/`, ignorados pelo Git e pelo Prettier, e não devem ser copiados para a documentação.

Use `npm run test:coverage` para medir cobertura e gerar HTML, JSON, LCOV e JUnit; `npm run test:report` gera apenas o relatório de testes. A configuração de cobertura inclui arquivos de implementação não executados pela suíte, sem contar testes, fakes ou contratos contendo apenas tipos. A cobertura global deve permanecer sempre em pelo menos 90% para linhas, statements, funções e branches; qualquer métrica abaixo desse piso reprova o comando e a CI. Não reduzir limites nem excluir código executável para contornar falhas. Consulte [QUALITY.md](./QUALITY.md) para comandos e interpretação.

Usar Node Test com `node:test` e `node:assert/strict`.

Testes devem:

- testar comportamento observavel;
- cobrir sucesso e falha;
- usar fakes injetaveis;
- evitar rede real;
- isolar variaveis de ambiente;
- limpar arquivos temporarios;
- nao depender de estado global entre testes.
- cada comando deve ter testes diretos em `<comando>/<comando>.test.ts`, alem dos testes de integracao do roteador;
- cada utilitario deve ter testes focados no mesmo diretorio da implementacao.

Os testes diretos dos comandos devem cobrir os caminhos principais e limites relevantes, como argumentos invalidos, permissoes, persistencia ou falhas externas quando aplicavel.

Exemplo:

```ts
test("parseCommand handles command text", () => {
  assert.deepEqual(parseCommand("!question hello"), {
    name: "question",
    args: ["hello"],
    text: "hello",
  });
});
```

Cada comportamento novo deve ter teste focado.

## 15. Nomeacao

- arquivos: kebab-case, exceto arquivos de entrypoint;
- diretorios: kebab-case;
- constantes: camelCase;
- tipos: PascalCase;
- classes: PascalCase;
- variaveis booleanas: prefixo positivo como `isEnabled`, `canSend` ou `hasPermission`;
- funcoes que executam acao: verbo no inicio;
- funcoes que fazem pergunta: `is`, `has`, `can`, `should`;
- stores: substantivo ou dominio seguido de Store;
- comandos: nome terminado em `Command`.

Exemplos:

```ts
const createQuestionCommand = () => {};
const remainingSeconds = () => 0;
const isAiEnabled = (): boolean => true;
const questionQueue = () => {};
```

## 16. Formatação

- Prettier e `.prettierrc.json` são obrigatorios;
- executavel novo não deve alterar o estilo global;
- aspas duplas em TypeScript;
- ponto e virgula;
- trailing comma em estruturas multilinha;
- largura definida pelo Prettier;
- nao formatar arquivos manualmente contra o Prettier.

Comandos:

```bash
npm run format
npm run format:check
```

## 17. Comentarios

- comentar apenas quando o motivo não estiver claro no codigo;
- nao comentar instrucoes obvias;
- manter JSDoc em APIs publicas existentes;
- JSDoc deve refletir comportamento atual;
- nao repetir o nome da funcao no comentario.

Exemplo util:

```ts
// A fila serializa chamadas para evitar concorrencia contra o mesmo provedor.
const processNextQuestion = (): void => {};
```

## 18. Testes e validacao

Antes de finalizar uma mudanca:

```bash
npm run format:check
npm test
npm run build
```

Se formatacao estiver diferente:

```bash
npm run format
```

## 19. Branches

O padrao de branch deve ser seguido obrigatoriamente.

Estrutura de branches:

- `main`: branch estável e testada;
- `feature/<descricao>`: novas funcionalidades;
- `fix/<descricao>`: correcoes de bugs;
- `hotfix/<descricao>`: correcoes urgentes;
- `docs/<descricao>`: apenas documentação;
- `refactor/<descricao>`: reestruturacao sem alteração de comportamento;
- `test/<descricao>`: melhorias focadas em testes.

Usar letras minusculas, kebab-case e uma descricao curta.
Usar descricoes em ingles, seguindo o idioma adotado nos nomes existentes do repositorio.

Exemplos:

```text
feature/question-context
fix/gemini-timeout
hotfix/invalid-state-file
docs/project-conventions
refactor/question-queue
test/gemini-failure-paths
```

Fluxo obrigatório:

```bash
git checkout main
git pull --ff-only
git checkout -b feature/minha-funcionalidade
```

Nao trabalhar diretamente em `main`.

Manter cada branch focada em uma entrega. Branches com documentacao não devem incluir implementacao de funcionalidades, salvo quando a documentação documentar diretamente essa implementação.

Antes de criar a branch, garantir que o estado local não possui alterações não relacionadas.

## 20. Commits

Commits devem seguir o padrão Conventional Commits e são obrigatórios.
Mensagens de commit devem ser escritas em ingles.

Formato:

```text
tipo: descrição curta no imperativo
```

Tipos aceitos:

- `feat`: nova funcionalidade;
- `fix`: correção de bug;
- `docs`: documentação;
- `refactor`: mudança interna sem alterar comportamento;
- `test`: testes;
- `perf`: melhoria de desempenho;
- `build`: sistema de build ou dependências;
- `ci`: integração contínua;
- `chore`: manutenção que não se encaixa em outro tipo.

Exemplos válidos:

```text
feat: add question context
fix: prevent queue blocking after timeout
docs: document project conventions
refactor: standardize functions with arrow functions
test: cover corrupted state files
```

Regras:

- usar inglês;
- usar imperativo;
- não começar com letra maiúscula;
- não terminar com ponto;
- manter a primeira linha com no máximo 72 caracteres;
- cada commit deve representar uma alteração coerente;
- não misturar funcionalidade, refactor amplo e documentação em um mesmo commit;
- não commitar secrets, arquivos de estado ou arquivos temporários;
- todo commit criado pelo Copilot deve incluir o trailer:

```text
Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
```

Exemplo completo:

```text
docs: add project conventions

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
```

## 21. Pull requests

O padrão de Pull Request deve ser seguido obrigatoriamente.
Títulos e descrições de PR devem ser escritos em ingles, seguindo o padrão das PRs existentes e a convenção English-only do workflow do projeto.

Regra da branch:

- Pull Requests devem apontar para `main`;
- não abrir PR de uma branch para outra branch de trabalho;
- atualizar a branch com `main` antes da revisão;
- resolver conflitos na branch de origem.

Título do PR:

- seguir o mesmo padrão de Conventional Commits;
- ser curto e descrevível.

Exemplos:

```text
docs: add project conventions
feat: add question context
fix: prevent queue blocking after timeout
```

Descrição do PR deve conter:

```md
## Summary

- Describe what changed.
- Explain why the change was made.

## Validation

- `npm run format:check`
- `npm test`
- `npm run build`
```

Regras obrigatórias:

- uma entrega deve estar focada em um objetivo;
- alterações novas devem possuir testes adequados;
- documentação diretamente relacionada deve ser atualizada;
- título e descrição devem estar em ingles;
- usar os cabeçalhos `## Summary` e `## Validation`;
- listar os comandos realmente executados e informar resultados relevantes, incluindo a quantidade de testes quando disponível;
- não adicionar checklist genérico: seguir o formato conciso das PRs existentes;
- nenhuma credencial pode ser incluída;
- nenhum arquivo de estado pode ser incluído;
- nenhuma dependência deve ser adicionada sem necessidade;
- mudanças maiores devem ser divididas em PRs menores;
- o PR não deve ser criado até a validação local estar concluída.

Quando aplicável, vincular issue ou tarefa relacionada no corpo do PR.

Antes de abrir o PR:

```bash
git fetch origin
git rebase origin/main
npm run format:check
npm test
npm run build
git push --force-with-lease
```

Para branches que ainda não estão prontas, abrir como Draft.

## 22. Padrao para novas funcionalidades

Para adicionar uma nova funcionalidade:

1. criar o teste do comportamento;
2. validar limites e entradas;
3. criar funcoes arrow com tipagem estrita;
4. reutilizar helpers existentes;
5. adicionar tratamento de falha;
6. evitar logar dados sensiveis;
7. registrar o comando ou serviço no fluxo existente;
8. atualizar README ou documento de convenções quando necessário;
9. executar formatacao, testes e build.
