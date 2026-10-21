'use strict';

const fs = require('fs');
const path = require('path');

function listarArquivos(pasta) {
  const saida = [];

  for (const entrada of fs.readdirSync(pasta, { withFileTypes: true })) {
    const completo = path.join(pasta, entrada.name);

    if (entrada.isDirectory()) {
      saida.push(...listarArquivos(completo));
    } else if (entrada.name.endsWith('.js') && entrada.name !== 'index.js') {
      saida.push(completo);
    }
  }

  return saida;
}

function carregarComandos() {
  const comandos = new Map();
  const arquivos = listarArquivos(__dirname);

  for (const arquivo of arquivos) {
    let cmd;
    try {
      cmd = require(arquivo);
    } catch (e) {
      console.error(`[BOT] Falha ao carregar ${path.basename(arquivo)}: ${e.message}`);
      continue;
    }

    if (!cmd || !cmd.dados || typeof cmd.executar !== 'function') {
      console.error(`[BOT] ${path.basename(arquivo)} nao exporta { dados, executar }.`);
      continue;
    }

    comandos.set(cmd.dados.name, cmd);
  }

  console.log(`[BOT] ${comandos.size} comandos carregados.`);
  return comandos;
}

module.exports = { carregarComandos };