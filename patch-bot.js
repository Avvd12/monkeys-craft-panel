'use strict';

const fs = require('fs');

const arquivo = 'src/bot/client.js';
const original = fs.readFileSync(arquivo, 'utf8');
let t = original;
const feito = [];
const falhou = [];

function trocar(rotulo, velho, novo) {
  if (t.includes(novo) && !t.includes(velho)) {
    feito.push(rotulo + ' (ja aplicado)');
    return;
  }
  if (!t.includes(velho)) {
    falhou.push(rotulo);
    return;
  }
  t = t.replace(velho, novo);
  feito.push(rotulo);
}

trocar(
  'nivel ajudante',
  'const NIVEIS = { todos: 0, jogador: 1, moderador: 2, admin: 3 };',
  'const NIVEIS = { todos: 0, jogador: 1, ajudante: 2, moderador: 3, admin: 4 };'
);

trocar(
  'deteccao do cargo ajudante',
  [
    "  if (CARGOS_MODERADOR.length && membro.roles && membro.roles.cache) {",
    "    if (CARGOS_MODERADOR.some((id) => membro.roles.cache.has(id))) return NIVEIS.moderador;",
    "  }",
    "  return NIVEIS.jogador;"
  ].join('\n'),
  [
    "  if (CARGOS_MODERADOR.length && membro.roles && membro.roles.cache) {",
    "    if (CARGOS_MODERADOR.some((id) => membro.roles.cache.has(id))) return NIVEIS.moderador;",
    "  }",
    "  if (CARGOS_AJUDANTE.length && membro.roles && membro.roles.cache) {",
    "    if (CARGOS_AJUDANTE.some((id) => membro.roles.cache.has(id))) return NIVEIS.ajudante;",
    "  }",
    "  return NIVEIS.jogador;"
  ].join('\n')
);

trocar(
  'fechamento de ticket (campo e nivel)',
  [
    "      const dono = String(ticket.usuarioId || '') === String(interacao.user.id);",
    "      const equipe = podeUsar(interacao, NIVEIS.moderador);"
  ].join('\n'),
  [
    "      const dono = String(ticket.autor_id || '') === String(interacao.user.id);",
    "      const equipe = podeUsar(interacao, NIVEIS.ajudante);"
  ].join('\n')
);

trocar(
  'carregamento de eventos',
  [
    "  function carregarEventos(c) {",
    "    const dir = path.join(__dirname, '..', 'events');",
    "    if (!fs.existsSync(dir)) return;",
    "    for (const arquivo of fs.readdirSync(dir).filter((f) => f.endsWith('.js'))) {",
    "      try {",
    "        const evt = require(path.join(dir, arquivo));",
    "        if (!evt.name) continue;",
    "        if (evt.once) c.once(evt.name, (...args) => evt.execute(...args));",
    "        else c.on(evt.name, (...args) => evt.execute(...args));",
    "      } catch (e) {",
    "        logBot('erro', `Falha ao carregar evento ${arquivo}: ${e.message}`);",
    "      }",
    "    }",
    "  }"
  ].join('\n'),
  [
    "  const EVENTOS_EXTERNOS = ['guildMemberAdd.js', 'guildMemberRemove.js'];",
    "",
    "  function carregarEventos(c) {",
    "    const dir = path.join(__dirname, '..', '..', 'events');",
    "",
    "    if (!fs.existsSync(dir)) {",
    "      logBot('aviso', 'Pasta events nao encontrada. Boas-vindas desligadas.');",
    "      return;",
    "    }",
    "",
    "    for (const arquivo of EVENTOS_EXTERNOS) {",
    "      const caminho = path.join(dir, arquivo);",
    "      if (!fs.existsSync(caminho)) continue;",
    "",
    "      try {",
    "        const evt = require(caminho);",
    "        if (!evt.name) continue;",
    "        if (evt.once) c.once(evt.name, (...args) => evt.execute(...args));",
    "        else c.on(evt.name, (...args) => evt.execute(...args));",
    "        logBot('sistema', 'Evento externo carregado: ' + arquivo);",
    "      } catch (e) {",
    "        logBot('erro', `Falha ao carregar evento ${arquivo}: ${e.message}`);",
    "      }",
    "    }",
    "  }"
  ].join('\n')
);

if (t !== original) {
  fs.writeFileSync(arquivo + '.bak', original, 'utf8');
  fs.writeFileSync(arquivo, t, 'utf8');
  console.log('OK: client.js atualizado. Backup em client.js.bak');
} else {
  console.log('NADA MUDOU');
}

console.log('Aplicado: ' + (feito.join(', ') || 'nada'));
if (falhou.length) console.log('NAO ENCONTRADO: ' + falhou.join(', '));