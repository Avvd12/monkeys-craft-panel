'use strict';

const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const config = require('../config.json');

let proc = null;
let encerrando = false;

function obterConfigServidor() {
  const srv = (config && config.server) || {};
  const mc = (config && config.minecraft) || {};
  const cwd = path.resolve(srv.cwd || mc.cwd || 'D:/SERVIDOR/Servidor');
  const command = String(srv.command || 'run.bat').trim();
  const args = Array.isArray(srv.args) ? srv.args.map(String) : [];
  return { cwd, command, args };
}

function isRunning() {
  return Boolean(proc && proc.pid && !proc.killed && proc.exitCode === null);
}

function getPid() {
  return isRunning() ? proc.pid : null;
}

function matarArvoreWindows(pid) {
  if (!pid) return false;
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
    } else {
      process.kill(pid, 'SIGKILL');
    }
    return true;
  } catch {
    return false;
  }
}

function quebrarETransmitir(chunk, nivelPadrao, onLog) {
  if (typeof onLog !== 'function' || !chunk) return;
  const texto = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
  for (const linha of texto.split(/\r?\n/)) {
    const limpa = linha.trim();
    if (!limpa) continue;
    // Ignora o prompt "Pressione qualquer tecla para continuar..." do pause do .bat no Windows
    if (/pressione qualquer tecla|press any key to continue/i.test(limpa)) continue;
    onLog(nivelPadrao, limpa);
  }
}

function startServer({ onLog = null, onExit = null } = {}) {
  if (isRunning()) {
    throw new Error('O processo do servidor já está em execução.');
  }

  const { cwd, command, args } = obterConfigServidor();

  if (!fs.existsSync(cwd)) {
    throw new Error(`A pasta do servidor não foi encontrada em: ${cwd}`);
  }

  const caminhoExecutavel = path.join(cwd, command);
  const usaArquivoLocal = fs.existsSync(caminhoExecutavel);

  encerrando = false;

  if (process.platform === 'win32') {
    proc = spawn('cmd.exe', ['/c', command, ...args], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    });
  } else {
    const bin = usaArquivoLocal ? caminhoExecutavel : command;
    proc = spawn(bin, args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true
    });
  }

  if (proc.stdout) {
    proc.stdout.on('data', (chunk) => quebrarETransmitir(chunk, 'info', onLog));
  }

  if (proc.stderr) {
    proc.stderr.on('data', (chunk) => quebrarETransmitir(chunk, 'erro', onLog));
  }

  proc.on('error', (erro) => {
    if (typeof onLog === 'function') {
      onLog('erro', `Falha no processo do servidor: ${erro.message}`);
    }
  });

  proc.on('exit', (codigo, sinal) => {
    const encerramentoEsperado = encerrando;
    proc = null;
    encerrando = false;

    if (encerramentoEsperado && typeof onLog === 'function') {
      onLog('sistema', 'Processo do servidor encerrado com sucesso.');
    }

    if (typeof onExit === 'function') {
      onExit(encerramentoEsperado ? 0 : codigo, encerramentoEsperado ? null : sinal);
    }
  });

  return proc;
}

function sendStdin(comando) {
  if (!isRunning() || !proc.stdin || !proc.stdin.writable) {
    return false;
  }
  try {
    proc.stdin.write(String(comando || '').trim() + '\r\n');
    return true;
  } catch {
    return false;
  }
}

async function stopServer(timeoutMs = 15000) {
  if (!isRunning()) {
    proc = null;
    encerrando = false;
    return true;
  }

  encerrando = true;
  const pidAlvo = proc.pid;

  // Envia stop também via stdin caso o RCON tenha falhado ou esteja desativado
  sendStdin('stop');

  const encerrouLimpo = await new Promise((resolve) => {
    if (!proc) return resolve(true);

    const timer = setTimeout(() => {
      resolve(false);
    }, timeoutMs);

    proc.once('exit', () => {
      clearTimeout(timer);
      resolve(true);
    });
  });

  if (!encerrouLimpo && pidAlvo) {
    matarArvoreWindows(pidAlvo);
  }

  proc = null;
  return true;
}

module.exports = {
  isRunning,
  getPid,
  startServer,
  stopServer,
  sendStdin
};