'use strict';

const fs = require('fs');
const path = require('path');
const net = require('net');
const { execSync } = require('child_process');
const { status } = require('minecraft-server-util');
const config = require('../../config.json');
const rcon = require('../../utils/rcon');
const serverProcess = require('../../utils/serverProcess');

function createMinecraftManager(hub) {
  const estado = {
    servico: 'minecraft',
    status: 'offline',
    stats: { jogadores: null, maxJogadores: null, versao: null, latencia: null }
  };

  let timerTail = null;
  let deslocamento = 0;
  let timerStatus = null;
  let reiniciando = false;

  const porta = config.minecraft.port;
  const host = config.minecraft.host;

  function definirStatus(s, stats = estado.stats) {
    estado.status = s;
    estado.stats = stats;
    hub.status('minecraft', s, estado.stats);
  }

  function log(nivel, mensagem) {
    hub.log('minecraft', nivel, mensagem);
  }

  // ---------- Detecção de porta ----------

  function portaEmUso(p, h) {
    return new Promise((resolve) => {
      const socket = net.connect({ port: p, host: h });
      let resolvido = false;
      const finalizar = (valor) => {
        if (resolvido) return;
        resolvido = true;
        socket.destroy();
        resolve(valor);
      };
      socket.setTimeout(1500);
      socket.once('connect', () => finalizar(true));
      socket.once('timeout', () => finalizar(false));
      socket.once('error', () => finalizar(false));
    });
  }

  function pidNaPorta(p) {
    try {
      const saida = execSync(`netstat -ano | findstr :${p}`, { encoding: 'utf8' });
      for (const linha of saida.split(/\r?\n/)) {
        const m = linha.trim().match(/TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)/);
        if (m && Number(m[1]) === p) return Number(m[2]);
      }
    } catch {
      // netstat sem resultado
    }
    return null;
  }

  function encerrarPorPorta(p) {
    const pid = pidNaPorta(p);
    if (!pid) return false;
    try {
      execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  // ---------- Normalização das linhas ----------

  function limparLinha(linha) {
    return linha
      .replace(/^\[\d{2}:\d{2}:\d{2}\]\s*/, '')
      .replace(/\u00a7./g, '')
      .trim();
  }

  function nivelDaLinha(linha) {
    const m = linha.match(/\[[^\]]*?\/(TRACE|DEBUG|INFO|WARN|ERROR|FATAL)\]/i);
    if (m) {
      const n = m[1].toUpperCase();
      if (n === 'ERROR' || n === 'FATAL') return 'erro';
      if (n === 'WARN') return 'aviso';
      if (n === 'DEBUG' || n === 'TRACE') return 'debug';
      return 'info';
    }
    if (/^\s*(java\.|Caused by:|\s+at )/.test(linha)) return 'erro';
    if (/\b(ERROR|FATAL|Exception|Caused by)\b/.test(linha)) return 'erro';
    if (/\bWARN(ING)?\b/.test(linha)) return 'aviso';
    return 'info';
  }

  function avisarSeForLock(linha) {
    if (/outro processo bloqueou|another process|session\.lock|DirectoryLock/i.test(linha)) {
      log('erro', `O mundo está travado por outra instância do servidor. Encerre o processo java que segura a porta ${porta} antes de iniciar pelo painel.`);
      return true;
    }
    return false;
  }

  function emitirLinha(linha) {
    const texto = limparLinha(linha);
    if (!texto) return;
    if (avisarSeForLock(texto)) return;
    log(nivelDaLinha(texto), texto);
  }

  // ---------- Tail do log ----------

  function caminhoLog() {
    if (config.minecraft && config.minecraft.logFile) return config.minecraft.logFile;
    if (config.minecraft && config.minecraft.cwd) return path.join(config.minecraft.cwd, 'logs', 'latest.log');
    if (config.server && config.server.cwd) return path.join(config.server.cwd, 'logs', 'latest.log');
    return null;
  }

  function iniciarTail() {
    const arquivo = caminhoLog();
    if (!arquivo) {
      log('aviso', 'Caminho do log não configurado. Defina server.cwd no config.json.');
      return;
    }

    try {
      deslocamento = fs.statSync(arquivo).size;
    } catch {
      deslocamento = 0;
    }

    timerTail = setInterval(() => {
      try {
        const st = fs.statSync(arquivo);
        if (st.size < deslocamento) deslocamento = 0;
        if (st.size <= deslocamento) return;

        const fd = fs.openSync(arquivo, 'r');
        const buf = Buffer.alloc(st.size - deslocamento);
        fs.readSync(fd, buf, 0, buf.length, deslocamento);
        fs.closeSync(fd);
        deslocamento = st.size;

        for (const linha of buf.toString('utf8').split(/\r?\n/)) {
          emitirLinha(linha);
        }
      } catch {
        // arquivo ainda não existe
      }
    }, 500);
  }

  function pararTail() {
    if (timerTail) {
      clearInterval(timerTail);
      timerTail = null;
    }
  }

  // ---------- Polling de status ----------

  function iniciarStatus() {
    pararStatus();
    timerStatus = setInterval(async () => {
      try {
        const info = await status(host, porta, { timeout: 4000 });
        estado.stats = {
          jogadores: info.players.online,
          maxJogadores: info.players.max,
          versao: info.version.name,
          latencia: info.roundTripLatency
        };
        if (estado.status !== 'parando') definirStatus('online', estado.stats);
      } catch {
        if (estado.status === 'online') definirStatus('offline', estado.stats);
      }
    }, 10000);
  }

  function pararStatus() {
    if (timerStatus) {
      clearInterval(timerStatus);
      timerStatus = null;
    }
  }

  // ---------- Iniciar ----------

  async function iniciar() {
    if (serverProcess.isRunning()) {
      throw new Error('Servidor já está em execução pelo painel');
    }

    if (await portaEmUso(porta, host)) {
      definirStatus('online');
      log('aviso', `A porta ${porta} já está em uso. O servidor está rodando fora do painel. Assumindo o monitoramento sem abrir uma segunda instância.`);
      iniciarStatus();
      return estado;
    }

    definirStatus('iniciando');
    log('sistema', 'Iniciando servidor de Minecraft...');

    serverProcess.startServer({
      onLog: (nivel, msg) => emitirLinha(msg),
      onExit: (codigo, sinal) => {
        pararTail();
        pararStatus();
        // O serverProcess já registra o encerramento normal.
        // Aqui só sinalizamos o que ele não cobre.
        if (codigo !== 0 || sinal) {
          const c = (codigo === undefined || codigo === null) ? 'desconhecido' : codigo;
          log('erro', `Processo do servidor encerrado de forma anormal (código ${c}${sinal ? ', sinal ' + sinal : ''}).`);
        }
        definirStatus('offline');
      }
    });

    iniciarTail();
    iniciarStatus();
    return estado;
  }

  // ---------- Parar ----------

  async function parar() {
    const rodandoPeloPainel = serverProcess.isRunning();
    const externo = !rodandoPeloPainel && await portaEmUso(porta, host);

    if (!rodandoPeloPainel && !externo) {
      definirStatus('offline');
      return estado;
    }

    definirStatus('parando');
    log('sistema', 'Encerrando servidor de Minecraft...');

    try {
      await rcon.connectRcon();
      await rcon.executeCommand('stop');
      log('sistema', 'Comando stop enviado via RCON.');
    } catch (e) {
      log('aviso', `RCON indisponível: ${e.message}`);
    }

    if (rodandoPeloPainel) {
      await serverProcess.stopServer();
    } else {
      log('aviso', 'O servidor foi iniciado fora do painel. Aguardando o encerramento pela porta.');
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        if (!(await portaEmUso(porta, host))) break;
      }
      if (await portaEmUso(porta, host)) {
        const ok = encerrarPorPorta(porta);
        log(ok ? 'sistema' : 'erro', ok
          ? 'Processo encerrado à força pelo painel.'
          : `Não foi possível encerrar o processo na porta ${porta}.`);
      }
    }

    pararTail();
    pararStatus();
    definirStatus('offline');
    return estado;
  }

  // ---------- Reiniciar ----------

  async function reiniciar() {
    if (reiniciando) {
      throw new Error('Já existe um reinício em andamento');
    }

    reiniciando = true;
    try {
      log('sistema', 'Reiniciando servidor de Minecraft...');

      await parar();

      // Espera a porta liberar de fato antes de subir de novo.
      // Sem isso, o iniciar() veria a porta ocupada e assumiria
      // que existe um servidor externo, em vez de subir o próprio.
      for (let i = 0; i < 30; i++) {
        if (!(await portaEmUso(porta, host))) break;
        await new Promise((r) => setTimeout(r, 1000));
      }

      await new Promise((r) => setTimeout(r, 2000));

      return await iniciar();
    } finally {
      reiniciando = false;
    }
  }

  // ---------- Comandos ----------

  async function enviarComando(comando) {
    await rcon.connectRcon();
    const resposta = await rcon.executeCommand(comando);
    log('info', `> ${comando}`);
    return resposta;
  }

  function obterEstado() {
    return JSON.parse(JSON.stringify(estado));
  }

  return {
    start: iniciar,
    stop: parar,
    restart: reiniciar,
    sendCommand: enviarComando,
    getState: obterEstado,
    iniciar,
    parar,
    reiniciar,
    enviarComando,
    obterEstado
  };
}

module.exports = { createMinecraftManager };