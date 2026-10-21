'use strict';

const { spawn } = require('child_process');
const config = require('../config.json');

let serverProcess = null;

function startServer({ onLog, onExit } = {}) {
  if (serverProcess) throw new Error('Servidor já está em execução');

  const log = onLog || (() => {});
  const { cwd, command, args } = config.server;

  const proc = spawn(command, args, {
    cwd,
    shell: true,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  serverProcess = proc;

  let finalizado = false;
  function finalizar(codigo) {
    if (finalizado) return;
    finalizado = true;
    serverProcess = null;
    if (onExit) onExit(codigo);
  }

  if (proc.stdout) {
    proc.stdout.on('data', (chunk) => {
      for (const linha of String(chunk).split(/\r?\n/)) {
        if (linha.trim()) log('info', linha.trim());
      }
    });
  }

  if (proc.stderr) {
    proc.stderr.on('data', (chunk) => {
      for (const linha of String(chunk).split(/\r?\n/)) {
        if (linha.trim()) log('erro', linha.trim());
      }
    });
  }

  proc.on('error', (erro) => {
    log('erro', `Não foi possível iniciar o servidor: ${erro.message}`);
    log('erro', `Confira o caminho em config.json (server.cwd): ${cwd}`);
    finalizar(-1);
  });

  proc.on('exit', (codigo) => {
    log('sistema', `Processo do servidor encerrado (código ${codigo})`);
    finalizar(codigo);
  });

  return proc;
}

function isRunning() {
  return serverProcess !== null;
}

function forceKill() {
  if (!serverProcess) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(serverProcess.pid), '/T', '/F']);
  } else {
    serverProcess.kill('SIGKILL');
  }
}

function stopServer() {
  if (!serverProcess) return Promise.resolve();
  const proc = serverProcess;
  return new Promise((resolve) => {
    const timer = setTimeout(() => { forceKill(); resolve(); }, 20000);
    proc.once('exit', () => { clearTimeout(timer); resolve(); });
  });
}

module.exports = { startServer, stopServer, isRunning, forceKill };