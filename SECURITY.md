# Política de Segurança

## Versões suportadas

Apenas a versão mais recente da branch `main` recebe correções de segurança.

| Versão | Suporte |
|---|---|
| `main` (mais recente) | ✅ |
| Versões anteriores | ❌ |

---

## Como reportar uma vulnerabilidade

**Não abra uma issue pública para vulnerabilidades.** Issues públicas expõem o problema antes de existir correção.

Use o canal privado do GitHub:

1. Acesse a aba **Security** do repositório.
2. Clique em **Report a vulnerability**.
3. Descreva o problema com o máximo de detalhe possível.

Link direto: https://github.com/Avvd12/monkeys-craft-panel/security/advisories/new

Se o recurso de reporte privado estiver indisponível, entre em contato pelo e-mail indicado no perfil do mantenedor no GitHub.

---

## O que incluir no relatório

- Descrição clara da vulnerabilidade.
- Passos para reproduzir, com o mínimo necessário.
- Versão do Node.js e do projeto.
- Sistema operacional.
- Impacto estimado: o que um atacante conseguiria fazer.
- Prova de conceito, se houver.
- Sugestão de correção, se você tiver uma.

---

## O que esperar

| Etapa | Prazo |
|---|---|
| Confirmação de recebimento | até 72 horas |
| Avaliação inicial e classificação | até 7 dias |
| Correção ou plano de mitigação | até 30 dias, conforme a gravidade |

Você será mantido informado durante todo o processo. Se a correção demorar, explicamos o motivo.

---

## Escopo

### Dentro do escopo

- Falhas de autenticação e de sessão.
- Escalada de privilégio entre os cargos `admin`, `moderador` e `visualizador`.
- Path traversal no gerenciador de arquivos.
- Execução remota de código pelo painel ou pelo bot.
- Injeção de comando no console do Minecraft via RCON.
- Exposição de credenciais, tokens ou dados de usuários.
- Bypass de rate limit ou do bloqueio por tentativas de login.

### Fora do escopo

- Ataques que exigem acesso físico à máquina.
- Engenharia social contra os mantenedores.
- Ataques de negação de serviço volumétricos.
- Vulnerabilidades em dependências de terceiros sem impacto demonstrável neste projeto. Nesse caso, reporte diretamente ao projeto de origem.
- Configurações inseguras feitas pelo próprio operador, como expor o painel sem HTTPS ou usar `SESSION_SECRET` fraco.

---

## Divulgação responsável

Pedimos que você:

- Não divulgue a falha publicamente antes da correção.
- Não acesse, altere ou apague dados que não sejam seus.
- Não use a falha para prejudicar o serviço ou outros usuários.
- Nos dê um prazo razoável antes de qualquer publicação.

Após a correção, você será creditado no changelog, caso deseje.

---

## Boas práticas para quem opera este projeto

- Nunca versione o `.env`, o `config.json` com credenciais reais, o `usuarios.json` ou a pasta `dados/`.
- Gere o `SESSION_SECRET` com pelo menos 32 bytes aleatórios.
- Rode o painel atrás de HTTPS em produção.
- Mantenha o RCON restrito a `127.0.0.1` e com senha forte.
- Mantenha as dependências atualizadas com `npm audit`.
- Dê ao processo do painel apenas as permissões de sistema necessárias.