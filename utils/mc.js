'use strict';

const { status } = require('minecraft-server-util');
const config = require('../config.json');
const { executeCommand } = require('./rcon');
const { ErroPainel } = require('./painel');

function limpar(valor) {
  return String(valor ?? '').replace(/[\r\n\t]/g, ' ').replace(/\s+/g, ' ').trim();
}

let cache = { dados: null, expira: 0 };

async function statusCache(ttl = 15000) {
  const agora = Date.now();
  if (cache.dados && agora < cache.expira) return cache.dados;

  try {
    const dados = await status(config.minecraft.host, config.minecraft.port, {
      timeout: 5000,
      enableSRV: false
    });
    cache = { dados, expira: agora + ttl };
    return dados;
  } catch {
    cache = { dados: null, expira: 0 };
    throw new ErroPainel('offline', 'O servidor está desligado ou não respondeu. Ligue pelo painel e tente novamente.');
  }
}

function invalidarCache() {
  cache = { dados: null, expira: 0 };
}

async function exigirServidor() {
  return statusCache(8000);
}

async function rcon(comando) {
  await exigirServidor();

  try {
    return await executeCommand(limpar(comando));
  } catch {
    throw new ErroPainel('erro', 'O servidor aceitou a conexão, mas não respondeu ao comando. Tente novamente em instantes.');
  }
}

async function rconArgs(base, ...args) {
  return rcon([base, ...args.map(limpar)].join(' '));
}

module.exports = { rcon, rconArgs, statusCache, exigirServidor, invalidarCache, limpar };