'use strict';

require('dotenv').config();
const config = require('./config.json');

function descrever(m) {
  if (typeof m === 'function') return `funcao ${m.name || '(anonima)'}`;
  if (m && typeof m === 'object') return `objeto { ${Object.keys(m).join(', ')} }`;
  return typeof m;
}

function resolver(modulo, nome) {
  if (typeof modulo === 'function') return modulo;
  if (modulo && typeof modulo.default === 'function') return modulo.default;
  if (modulo && typeof modulo[nome] === 'function') return modulo[nome];
  if (modulo && typeof modulo === 'object') {
    const fns = Object.keys(modulo).filter((k) => typeof modulo[k] === 'function');
    const pref = fns.find((k) => /^create/i.test(k)) || fns[0];
    if (pref) return modulo[pref];
  }
  return null;
}

function ehClasse(fn) {
  return /^[A-Z]/.test(fn.name || '') && fn.prototype && Object.getOwnPropertyNames(fn.prototype).length > 1;
}

function construir(fn, candidatos, rotulo) {
  const classe = ehClasse(fn);
  let primeiro;
  for (const args of candidatos) {
    try {
      return classe ? new fn(...args) : fn(...args);
    } catch (e) {
      if (!primeiro) primeiro = e;
    }
  }
  console.error(`[ERRO] Falha ao criar ${rotulo}: ${primeiro && primeiro.message}`);
  console.error(`[ERRO] Como o modulo ${rotulo} se apresenta:`);
  console.error('  ' + String(fn).split('\n').slice(0, 6).join('\n  '));
  process.exit(1);
}

const modHub = require('./src/logs/hub');
const modMc = require('./src/minecraft/manager');
const modBot = require('./src/bot/client');
const modApi = require('./src/api/server');

const fnHub = resolver(modHub, 'createHub');
const fnMc = resolver(modMc, 'createMinecraftManager');
const fnBot = resolver(modBot, 'createBot');
const fnApi = resolver(modApi, 'createApiServer');

if (!fnHub || !fnMc || !fnBot || !fnApi) {
  console.error('[ERRO] Nao encontrei as funcoes. O que cada modulo exporta:');
  console.error('  hub     ->', descrever(modHub));
  console.error('  manager ->', descrever(modMc));
  console.error('  bot     ->', descrever(modBot));
  console.error('  api     ->', descrever(modApi));
  process.exit(1);
}

const hub = construir(fnHub, [[], [{}], [config]], 'hub');
const minecraft = construir(fnMc, [[hub], [{ hub }], [hub, config], [{ hub, config }], []], 'minecraft');
const bot = construir(fnBot, [[hub], [{ hub }], [hub, config], [{ hub, config }], []], 'bot');

const api = construir(fnApi, [
  [{ config, hub, minecraft, bot }],
  [config, hub, minecraft, bot],
  [config, hub],
  [config],
  [hub, minecraft, bot],
  [hub],
  []
], 'api');

const port = (config.panel && config.panel.port) || 3000;
const host = (config.panel && config.panel.host) || '0.0.0.0';
const server = api.server || api.app || api;

if (typeof server.listen !== 'function') {
  console.error('[ERRO] A API nao devolveu um servidor com listen(). Exporta:', descrever(api));
  process.exit(1);
}

server.listen(port, host, () => {
  console.log(`[PAINEL] Rodando em http://localhost:${port}`);
});

process.on('uncaughtException', (e) => console.error('[ERRO NAO TRATADO]', e));