'use strict';

const { status } = require('minecraft-server-util');

// Consulta o status do servidor (online/offline, jogadores, versão, latência)
async function verificarStatus(host, porta, tempoLimiteMs = 5000) {
  return status(host, porta, { timeout: tempoLimiteMs });
}

module.exports = { verificarStatus };