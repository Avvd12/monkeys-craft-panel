'use strict';

const fs = require('fs');

// Lê o latest.log e chama onLinha para cada linha nova (sem reler o arquivo inteiro)
function criarLeitorLog(caminhoArquivo, onLinha) {
  let deslocamento = 0;
  let timer = null;
  let rodando = false;

  function lerLinhasNovas() {
    if (!rodando) return;
    try {
      const stat = fs.statSync(caminhoArquivo);
      if (stat.size < deslocamento) deslocamento = 0; // arquivo foi rotacionado
      if (stat.size > deslocamento) {
        const fd = fs.openSync(caminhoArquivo, 'r');
        const buffer = Buffer.alloc(stat.size - deslocamento);
        fs.readSync(fd, buffer, 0, buffer.length, deslocamento);
        fs.closeSync(fd);
        deslocamento = stat.size;
        for (const linha of buffer.toString('utf8').split(/\r?\n/)) {
          if (linha.trim()) onLinha(linha.trim());
        }
      }
    } catch (erro) {
      // arquivo ainda não existe (servidor iniciando), ignora
    }
  }

  return {
    iniciar() {
      rodando = true;
      try { deslocamento = fs.statSync(caminhoArquivo).size; } catch (erro) {}
      timer = setInterval(lerLinhasNovas, 500);
    },
    parar() {
      rodando = false;
      if (timer) { clearInterval(timer); timer = null; }
    }
  };
}

module.exports = { criarLeitorLog };