# Documentação

- [Roadmap](./ROADMAP.md): fases, entregas e estado de implementação.
- [Convenções](./PROJECT_CONVENTIONS.md): arquitetura, código, testes e fluxo Git.
- [Segurança](./SECURITY.md): limites, permissões, credenciais e privacidade.
- [Qualidade e cobertura](./QUALITY.md): comandos, relatórios e interpretação das métricas.
- [README principal](../README.md): instalação, configuração, comandos e operação.

O `README.md` da raiz permanece como porta de entrada do repositório. A pasta `docs/` contém documentação mantida e versionada. Instruções de agentes e configurações de workflows permanecem em `.github/`, onde as ferramentas esperam encontrá-las.

Relatórios gerados ficam em `reports/`, fora da documentação e ignorados pelo Git. Não copie saídas temporárias de testes para a raiz ou para `docs/`.
