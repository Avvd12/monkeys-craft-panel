'use strict';

const path = require('path');
const { spawn } = require('child_process');
const dotenv = require('dotenv');

function createBot({ hub, config } = {}) {
  const pastaBot = path.resolve(__dirname, '..', '..', '..', 'discord-bot');
  let proc = null;
  let iniciadoEm = null;
  let comandosProcessados = 0;
  let timestampsComandos = [];
  let timerStatus = null;

  const estado = {
    servico: 'discord',
    status: 'offline',
    stats: {
      gateway: 'DISCONNECTED',
      servidores: 0,
      comandos: 0,
      comandosPorMinuto: 0,
      latencia: null,
      uptimeSegundos: 0
    }
  };

  function atualizarCpm() {
    const agora = Date.now();
    timestampsComandos = timestampsComandos.filter((t) => agora - t <= 60000);
    estado.stats.comandosPorMinuto = timestampsComandos.length;
    estado.stats.comandos = comandosProcessados;
  }

  function emitirStatus(s) {
    estado.status = s;
    estado.stats.gateway = s === 'online' ? 'CONNECTED (Shard 0)' : 'DISCONNECTED';
    estado.stats.servidores = s === 'online' ? (estado.stats.servidores || 1) : 0;
    estado.stats.uptimeSegundos = iniciadoEm ? Math.floor((Date.now() - iniciadoEm) / 1000) : 0;
    atualizarCpm();
    if (hub && typeof hub.status === 'function') {
      hub.status('discord', s, estado.stats);
    }
  }

  function log(nivel, msg) {
    if (hub && typeof hub.log === 'function') hub.log('bot', nivel, msg);
  }

  async function iniciar() {
    if (proc) return estado;
    emitirStatus('iniciando');
    log('sistema', `A iniciar Bot do Discord em ${pastaBot}...`);

    try {
      const envBot = { ...process.env };
      const parsedEnv = dotenv.config({ path: path.join(pastaBot, '.env') });
      if (parsedEnv && parsedEnv.parsed) {
        Object.assign(envBot, parsedEnv.parsed);
      }

      proc = spawn(process.execPath, ['index.js'], {
        cwd: pastaBot,
        env: envBot,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      iniciadoEm = Date.now();
      emitirStatus('online');

      if (timerStatus) clearInterval(timerStatus);
      timerStatus = setInterval(() => {
        if (proc) emitirStatus('online');
      }, 5000);

      proc.stdout.on('data', (d) => {
        for (const l of d.toString('utf8').split(/\r?\n/)) {
          const texto = l.trim();
          if (!texto) continue;
          if (/comando|command|executou|interaction|!\w+|\/\w+/i.test(texto)) {
            comandosProcessados += 1;
            timestampsComandos.push(Date.now());
            atualizarCpm();
          }
          const mPing = texto.match(/lat[eê]ncia[:\s]+(\d+)\s*ms|ping[:\s]+(\d+)\s*ms/i);
          if (mPing) {
            estado.stats.latencia = parseInt(mPing[1] || mPing[2], 10);
          }
          log('info', texto);
          emitirStatus('online');
        }
      });

      proc.stderr.on('data', (d) => {
        for (const l of d.toString('utf8').split(/\r?\n/)) {
          if (l.trim()) log('erro', l.trim());
        }
      });

      proc.on('exit', (code) => {
        proc = null;
        iniciadoEm = null;
        if (timerStatus) { clearInterval(timerStatus); timerStatus = null; }
        estado.stats.latencia = null;
        log('aviso', `Processo do Bot Discord terminado (código ${code ?? 0}).`);
        emitirStatus('offline');
      });
    } catch (e) {
      proc = null;
      log('erro', `Falha ao iniciar Bot Discord: ${e.message}`);
      emitirStatus('erro');
    }

    return estado;
  }

  async function parar() {
    if (timerStatus) { clearInterval(timerStatus); timerStatus = null; }
    if (!proc) {
      emitirStatus('offline');
      return estado;
    }
    emitirStatus('parando');
    log('sistema', 'A parar Bot do Discord...');
    proc.kill('SIGTERM');
    proc = null;
    iniciadoEm = null;
    estado.stats.latencia = null;
    emitirStatus('offline');
    return estado;
  }

  async function reiniciar() {
    await parar();
    await new Promise((r) => setTimeout(r, 1200));
    return iniciar();
  }

  function obterEstado() {
    estado.stats.uptimeSegundos = iniciadoEm ? Math.floor((Date.now() - iniciadoEm) / 1000) : 0;
    atualizarCpm();
    return JSON.parse(JSON.stringify(estado));
  }

  if (config && config.discord && config.discord.autoStart) {
    iniciar().catch(() => {});
  }

  return {
    iniciar,
    parar,
    reiniciar,
    start: iniciar,
    stop: parar,
    restart: reiniciar,
    obterEstado,
    getState: obterEstado
  };
}

module.exports = { createBot };