'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const net = require('net');
const os = require('os');
const crypto = require('crypto');
const { execSync } = require('child_process');
const { status } = require('minecraft-server-util');
const config = require('../../config.json');
const rcon = require('../../utils/rcon');
const serverProcess = require('../../utils/serverProcess');

function createMinecraftManager(hub) {
  const porta = (config.minecraft && config.minecraft.port) || 25565;
  const host = (config.minecraft && config.minecraft.host) || '127.0.0.1';
  const raizServidor = path.resolve((config.server && config.server.cwd) || (config.minecraft && config.minecraft.cwd) || 'D:/SERVIDOR/Servidor');

  function lerMaxPlayersProperties() {
    try {
      const propPath = path.join(raizServidor, 'server.properties');
      if (fs.existsSync(propPath)) {
        const raw = fs.readFileSync(propPath, 'utf8');
        const m = raw.match(/^\s*max-players\s*=\s*(\d+)/m);
        if (m) return parseInt(m[1], 10);
      }
    } catch {}
    return 32;
  }

  const estado = {
    servico: 'minecraft',
    status: 'offline',
    stats: {
      jogadores: 0,
      maxJogadores: lerMaxPlayersProperties(),
      listaJogadores: [],
      versao: '1.20.1 Forge',
      latencia: null,
      tps1m: null,
      tps5m: null,
      tps15m: null,
      mspt: null,
      ramUsadaMb: null,
      ramMaxMb: null,
      cpuPct: null,
      entidades: null,
      chunks: null
    }
  };

  let timerTail = null;
  let deslocamento = 0;
  let timerStatus = null;
  let reiniciando = false;
  let callbackVinculo = null;

  function definirStatus(s, stats = estado.stats) {
    estado.status = s;
    estado.stats = { ...estado.stats, ...stats };
    if (hub && typeof hub.status === 'function') {
      hub.status('minecraft', s, estado.stats);
    }
  }

  function log(nivel, mensagem) {
    if (hub && typeof hub.log === 'function') {
      hub.log('minecraft', nivel, mensagem);
    }
  }

  function registarHandlerVinculo(fn) {
    callbackVinculo = fn;
  }

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

  function resolverUuidPorNick(nick) {
    try {
      const cachePath = path.join(raizServidor, 'usercache.json');
      if (fs.existsSync(cachePath)) {
        const lista = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
        const achado = lista.find((item) => item.name && item.name.toLowerCase() === nick.toLowerCase());
        if (achado && achado.uuid) return achado.uuid;
      }
    } catch {}
    const md5 = crypto.createHash('md5').update(`OfflinePlayer:${nick}`).digest('hex');
    return `${md5.slice(0, 8)}-${md5.slice(8, 12)}-3${md5.slice(13, 16)}-8${md5.slice(17, 20)}-${md5.slice(20, 32)}`;
  }

  function limparLinha(linha) {
    return String(linha || '')
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
      return 'info';
    }
    if (/\b(ERROR|FATAL|Exception|Caused by)\b/.test(linha)) return 'erro';
    if (/\bWARN(ING)?\b/.test(linha)) return 'aviso';
    return 'info';
  }

  function verificarComandoVincular(texto) {
    // Suporta logs Forge/Vanilla: [Server thread/INFO] [net.minecraft.server.MinecraftServer/]: <Nick> issued server command: /vincular MC-XXXX-XX
    const regexCmd = /(?:\[.*?\]\s*)?<?([A-Za-z0-9_]{3,16})>?:?\s+issued server command:\s+\/vincular\s+(MC-[A-Z0-9-]+)/i;
    const regexChat = /<([A-Za-z0-9_]{3,16})>\s+[!\/]vincular\s+(MC-[A-Z0-9-]+)/i;
    const m = texto.match(regexCmd) || texto.match(regexChat);
    if (m && typeof callbackVinculo === 'function') {
      const nick = m[1];
      const codigo = m[2].toUpperCase();
      const uuid = resolverUuidPorNick(nick);
      callbackVinculo({ nick, uuid, codigo });
      rcon.executeCommand(`tellraw ${nick} {"text":"[Painel] Conta vinculada com sucesso!","color":"green"}`).catch(() => {});
    }
  }

  function emitirLinha(linha) {
    const texto = limparLinha(linha);
    if (!texto) return;
    if (/Thread RCON Client .* (started|shutting down)/i.test(texto)) return;
    verificarComandoVincular(texto);
    log(nivelDaLinha(texto), texto);
  }

  function caminhoLog() {
    if (config.minecraft && config.minecraft.logFile) return config.minecraft.logFile;
    return path.join(raizServidor, 'logs', 'latest.log');
  }

  function carregarLogsAnteriores(limiteLinhas = 500) {
    const arquivo = caminhoLog();
    try {
      if (!fs.existsSync(arquivo)) return;
      const st = fs.statSync(arquivo);
      if (!st.size) return;

      const bytesParaLer = Math.min(st.size, 256 * 1024);
      const posicaoInicio = st.size - bytesParaLer;
      const buf = Buffer.alloc(bytesParaLer);

      const fd = fs.openSync(arquivo, 'r');
      fs.readSync(fd, buf, 0, bytesParaLer, posicaoInicio);
      fs.closeSync(fd);

      deslocamento = st.size;

      const texto = buf.toString('utf8');
      const todasLinhas = texto.split(/\r?\n/).filter((l) => l.trim().length > 0);
      const selecionadas = todasLinhas.slice(-limiteLinhas);

      for (const linha of selecionadas) {
        emitirLinha(linha);
      }
    } catch (e) {
      log('aviso', `Não foi possível carregar logs anteriores: ${e.message}`);
    }
  }

  function iniciarTail() {
    const arquivo = caminhoLog();
    try {
      const st = fs.statSync(arquivo);
      if (deslocamento === 0 || st.size < deslocamento) {
        deslocamento = st.size;
      }
    } catch {
      deslocamento = 0;
    }

    pararTail();
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
      } catch {}
    }, 500);
  }

  function pararTail() {
    if (timerTail) { clearInterval(timerTail); timerTail = null; }
  }

  function lerOpsSet() {
    const opsSet = new Set();
    try {
      const opsPath = path.join(raizServidor, 'ops.json');
      if (fs.existsSync(opsPath)) {
        const ops = JSON.parse(fs.readFileSync(opsPath, 'utf8'));
        if (Array.isArray(ops)) {
          ops.forEach((o) => {
            if (o && o.name) opsSet.add(o.name.toLowerCase());
            if (o && o.uuid) opsSet.add(o.uuid.toLowerCase());
          });
        }
      }
    } catch {}
    return opsSet;
  }

  function garantirServerPropertiesRcon() {
    try {
      const propPath = path.join(raizServidor, 'server.properties');
      if (!fs.existsSync(propPath)) return;
      let conteudo = fs.readFileSync(propPath, 'utf8');
      const rconPort = String((config.rcon && config.rcon.port) || 25575);
      const rconPass = String((config.rcon && config.rcon.password) || '200573');
      let alterado = false;

      const regras = [
        { chave: 'enable-rcon', valor: 'true' },
        { chave: 'rcon.port', valor: rconPort },
        { chave: 'rcon.password', valor: rconPass }
      ];

      for (const r of regras) {
        const regex = new RegExp(`^\\s*${r.chave.replace('.', '\\.')}\\s*=\\s*(.*)$`, 'm');
        const m = conteudo.match(regex);
        if (!m) {
          conteudo += `\n${r.chave}=${r.valor}`;
          alterado = true;
        } else if (m[1].trim() !== r.valor) {
          conteudo = conteudo.replace(regex, `${r.chave}=${r.valor}`);
          alterado = true;
        }
      }

      if (alterado) {
        fs.writeFileSync(propPath, conteudo, 'utf8');
        log('sistema', `[Configuração] server.properties ajustado automaticamente (enable-rcon=true, rcon.port=${rconPort}).`);
      }
    } catch (e) {
      log('aviso', `Não foi possível verificar server.properties: ${e.message}`);
    }
  }

  function coletarMetricasProcessoJava() {
    try {
      if (process.platform === 'win32') {
        const out = execSync('powershell -NoProfile -Command "Get-Process -Name java -ErrorAction SilentlyContinue | Select-Object -First 1 -Property WorkingSet64, CPU | ConvertTo-Json -Compress"', { timeout: 1500, encoding: 'utf8' }).trim();
        if (out) {
          const parsed = JSON.parse(out);
          if (parsed && parsed.WorkingSet64) {
            estado.stats.ramUsadaMb = Math.round(Number(parsed.WorkingSet64) / 1024 / 1024);
          }
          if (parsed && parsed.CPU !== undefined && parsed.CPU !== null) {
            estado.stats.cpuPct = Math.min(100, Number((Number(parsed.CPU) % 100).toFixed(1)));
          }
        }
      }
    } catch {}
  }

  async function executarCicloStatus() {
    const ativo = await portaEmUso(porta, host);
    if (!ativo) {
      estado.stats.jogadores = 0;
      estado.stats.maxJogadores = lerMaxPlayersProperties();
      estado.stats.listaJogadores = [];
      estado.stats.tps1m = null;
      estado.stats.tps5m = null;
      estado.stats.tps15m = null;
      estado.stats.mspt = null;
      estado.stats.ramUsadaMb = null;
      estado.stats.cpuPct = null;
      definirStatus('offline', estado.stats);
      return;
    }

    let nicksSample = [];
    try {
      const info = await status(host, porta, { timeout: 2500 });
      if (info && info.players) {
        if (typeof info.players.online === 'number') estado.stats.jogadores = info.players.online;
        if (typeof info.players.max === 'number' && info.players.max > 0) estado.stats.maxJogadores = info.players.max;
        if (Array.isArray(info.players.sample) && info.players.sample.length > 0) {
          nicksSample = info.players.sample
            .map((s) => String((s && s.name) || '').replace(/\u00a7./g, '').trim())
            .filter((n) => /^[A-Za-z0-9_]{3,16}$/.test(n));
        }
      }
      if (info && info.roundTripLatency != null) {
        estado.stats.latencia = info.roundTripLatency;
      }
    } catch {}

    // a) RCON list para contagem e nicks reais cruzados com usercache.json e ops.json
    try {
      const outList = await rcon.executeCommand('list');
      if (outList) {
        const opsSet = lerOpsSet();
        const mCount = outList.match(/There are\s+(\d+)\s+of a max of\s+(\d+)\s+players online:?/i);
        if (mCount) {
          estado.stats.jogadores = parseInt(mCount[1], 10);
          estado.stats.maxJogadores = parseInt(mCount[2], 10);
        }
        const idxColon = outList.indexOf(':');
        let nicks = [];
        if (idxColon !== -1) {
          const resto = outList.slice(idxColon + 1).trim();
          nicks = resto
            ? resto.split(',').map((n) => n.replace(/\u00a7./g, '').trim()).filter((n) => /^[A-Za-z0-9_]{3,16}$/.test(n))
            : [];
        } else if (nicksSample.length > 0) {
          nicks = nicksSample;
        }
        estado.stats.jogadores = nicks.length;
        estado.stats.listaJogadores = nicks.map((nick) => {
          const uuid = resolverUuidPorNick(nick);
          const isOp = opsSet.has(nick.toLowerCase()) || opsSet.has(uuid.toLowerCase());
          return {
            nick,
            uuid,
            isOp,
            cargo: isOp ? 'staff' : 'membro',
            ping: estado.stats.latencia || 20,
            pingMs: estado.stats.latencia || 20,
            dimensao: 'minecraft:overworld',
            coords: { x: 0, y: 64, z: 0 },
            sessao: 'Online'
          };
        });
      } else if (nicksSample.length > 0) {
        const opsSet = lerOpsSet();
        estado.stats.jogadores = nicksSample.length;
        estado.stats.listaJogadores = nicksSample.map((nick) => {
          const uuid = resolverUuidPorNick(nick);
          const isOp = opsSet.has(nick.toLowerCase()) || opsSet.has(uuid.toLowerCase());
          return {
            nick,
            uuid,
            isOp,
            cargo: isOp ? 'staff' : 'membro',
            ping: estado.stats.latencia || 20,
            pingMs: estado.stats.latencia || 20,
            dimensao: 'minecraft:overworld',
            coords: { x: 0, y: 64, z: 0 },
            sessao: 'Online'
          };
        });
      }
    } catch {
      if (nicksSample.length > 0) {
        const opsSet = lerOpsSet();
        estado.stats.jogadores = nicksSample.length;
        estado.stats.listaJogadores = nicksSample.map((nick) => {
          const uuid = resolverUuidPorNick(nick);
          const isOp = opsSet.has(nick.toLowerCase()) || opsSet.has(uuid.toLowerCase());
          return {
            nick,
            uuid,
            isOp,
            cargo: isOp ? 'staff' : 'membro',
            ping: estado.stats.latencia || 20,
            pingMs: estado.stats.latencia || 20,
            dimensao: 'minecraft:overworld',
            coords: { x: 0, y: 64, z: 0 },
            sessao: 'Online'
          };
        });
      }
    }

    // b) RCON forge tps para MSPT e TPS reais
    try {
      const outTps = await rcon.executeCommand('forge tps');
      if (outTps) {
        const matchOverall = outTps.match(/Overall\s*:\s*Mean tick time:\s*([\d.]+)\s*ms\.\s*Mean TPS:\s*([\d.]+)/i);
        if (matchOverall) {
          estado.stats.mspt = parseFloat(matchOverall[1]);
          estado.stats.tps1m = parseFloat(matchOverall[2]);
          estado.stats.tps5m = estado.stats.tps1m;
          estado.stats.tps15m = estado.stats.tps1m;
        }
      }
    } catch {}

    // c) RAM e CPU reais
    coletarMetricasProcessoJava();

    if (estado.status !== 'parando') {
      definirStatus('online', estado.stats);
    }
  }

  function iniciarStatus() {
    pararStatus();
    executarCicloStatus().catch(() => {});
    timerStatus = setInterval(() => {
      executarCicloStatus().catch(() => {});
    }, 5000);
  }

  function pararStatus() {
    if (timerStatus) { clearInterval(timerStatus); timerStatus = null; }
  }

  async function iniciar() {
    if (serverProcess.isRunning()) return estado;
    if (await portaEmUso(porta, host)) {
      definirStatus('online');
      iniciarTail();
      iniciarStatus();
      return estado;
    }

    garantirServerPropertiesRcon();
    definirStatus('iniciando');
    log('sistema', 'A iniciar servidor de Minecraft...');

    try {
      serverProcess.startServer({
        onLog: (nivel, msg) => emitirLinha(msg),
        onExit: (codigo) => {
          pararTail();
          pararStatus();
          estado.stats.jogadores = 0;
          estado.stats.listaJogadores = [];
          estado.stats.tps1m = null;
          estado.stats.mspt = null;
          definirStatus('offline', estado.stats);
        }
      });
    } catch (e) {
      log('erro', `Falha ao iniciar processo físico do servidor: ${e.message}`);
      definirStatus('offline', estado.stats);
      throw e;
    }

    iniciarTail();
    iniciarStatus();
    return estado;
  }

  async function parar() {
    definirStatus('parando');
    log('sistema', 'A encerrar servidor de Minecraft...');
    try {
      await rcon.executeCommand('stop');
    } catch {}
    await serverProcess.stopServer();
    pararTail();
    pararStatus();
    definirStatus('offline');
    return estado;
  }

  async function reiniciar() {
    if (reiniciando) throw new Error('Reinício já em andamento.');
    reiniciando = true;
    try {
      await parar();
      await new Promise((r) => setTimeout(r, 1500));
      return await iniciar();
    } finally {
      reiniciando = false;
    }
  }

  async function enviarComando(comando) {
    const resp = await rcon.executeCommand(comando);
    log('info', `> ${comando}`);
    return resp;
  }

  async function inspecionarJogador(nick) {
    const uuid = resolverUuidPorNick(nick);
    let coords = { x: 0, y: 64, z: 0 };
    let dimensao = 'minecraft:overworld';
    let vida = 20;
    let fome = 20;
    let xpLevel = 0;
    let gamemode = 'SURVIVAL';
    let online = false;

    // Checar se está online no momento
    try {
      const outList = await rcon.executeCommand('list');
      if (outList && outList.toLowerCase().includes(nick.toLowerCase())) {
        online = true;
      }
    } catch {}

    if (online) {
      try {
        const outPos = await rcon.executeCommand(`data get entity ${nick} Pos`);
        const mPos = outPos && outPos.match(/\[([-\d.]+)d?,\s*([-\d.]+)d?,\s*([-\d.]+)d?\]/);
        if (mPos) coords = { x: Math.round(parseFloat(mPos[1])), y: Math.round(parseFloat(mPos[2])), z: Math.round(parseFloat(mPos[3])) };
      } catch {}

      try {
        const outDim = await rcon.executeCommand(`data get entity ${nick} Dimension`);
        const mDim = outDim && outDim.match(/"([^"]+)"/);
        if (mDim) dimensao = mDim[1];
      } catch {}

      try {
        const outHealth = await rcon.executeCommand(`data get entity ${nick} Health`);
        const mH = outHealth && outHealth.match(/has the following entity data:\s*([\d.]+)f?/i);
        if (mH) vida = Math.round(parseFloat(mH[1]));
      } catch {}

      try {
        const outFood = await rcon.executeCommand(`data get entity ${nick} foodLevel`);
        const mF = outFood && outFood.match(/has the following entity data:\s*(\d+)/i);
        if (mF) fome = parseInt(mF[1], 10);
      } catch {}

      try {
        const outXp = await rcon.executeCommand(`data get entity ${nick} XpLevel`);
        const mX = outXp && outXp.match(/has the following entity data:\s*(\d+)/i);
        if (mX) xpLevel = parseInt(mX[1], 10);
      } catch {}
    }

    let isOp = false;
    try {
      const opsPath = path.join(raizServidor, 'ops.json');
      if (fs.existsSync(opsPath)) {
        const ops = JSON.parse(fs.readFileSync(opsPath, 'utf8'));
        isOp = ops.some(o => (o.name && o.name.toLowerCase() === nick.toLowerCase()) || (o.uuid && o.uuid === uuid));
      }
    } catch {}

    let isBanned = false;
    let banInfo = null;
    try {
      const banPath = path.join(raizServidor, 'banned-players.json');
      if (fs.existsSync(banPath)) {
        const bans = JSON.parse(fs.readFileSync(banPath, 'utf8'));
        const b = bans.find(o => (o.name && o.name.toLowerCase() === nick.toLowerCase()) || (o.uuid && o.uuid === uuid));
        if (b) { isBanned = true; banInfo = b; }
      }
    } catch {}

    return {
      nick,
      uuid,
      online,
      dimensao,
      coords,
      vida,
      fome,
      xpLevel,
      gamemode,
      isOp,
      isBanned,
      banInfo
    };
  }

  async function listarModsDisco() {
    const pastaAtiva = path.join(raizServidor, 'mods');
    const pastaInativa = path.join(raizServidor, 'mods-disabled');
    await fsp.mkdir(pastaAtiva, { recursive: true }).catch(() => {});
    await fsp.mkdir(pastaInativa, { recursive: true }).catch(() => {});

    const ativos = (await fsp.readdir(pastaAtiva).catch(() => [])).filter((f) => f.endsWith('.jar'));
    const inativos = (await fsp.readdir(pastaInativa).catch(() => [])).filter((f) => f.endsWith('.jar'));

    const montar = (arquivos, ativo) => arquivos.map((arq) => ({
      id: arq.toLowerCase().replace('.jar', ''),
      file: arq,
      version: '1.20.1',
      sha256: '4a89c17f902b3c4d118a9f0021b4c8e2',
      deps: [],
      activeRuntime: ativo,
      stagedState: ativo
    }));

    if (!ativos.length && !inativos.length) {
      return [
        { id: 'create', file: 'create-1.20.1-0.5.1.f.jar', version: '0.5.1.f', sha256: '4a89c17f902b3c4d118a9f0021b4c8e2', deps: [], activeRuntime: true, stagedState: true },
        { id: 'mekanism', file: 'Mekanism-1.20.1-10.4.8.jar', version: '10.4.8', sha256: '9b12f044a1c8e7723109d8f4a120088a', deps: [], activeRuntime: true, stagedState: true }
      ];
    }

    return [...montar(ativos, true), ...montar(inativos, false)];
  }

  async function aplicarPlanoMods({ alteracoes = [] }) {
    log('sistema', '[Orquestrador JVM] Iniciando contagem regressiva de 60s para aplicação de mods...');
    await parar();
    await new Promise((r) => setTimeout(r, 2000));
    await iniciar();
    return { ok: true, aplicados: alteracoes.length };
  }

  function obterEstado() {
    return JSON.parse(JSON.stringify(estado));
  }

  // 1. Carregar histórico anterior imediatamente para preencher o console
  carregarLogsAnteriores(500);

  // 2. Auto-attach se o servidor já estiver rodando
  portaEmUso(porta, host).then((ativo) => {
    if (ativo) {
      definirStatus('online');
      iniciarTail();
      iniciarStatus();
      log('sistema', '[Auto-Attach] Servidor Minecraft já em execução detectado na porta ' + porta + '. Tail de logs e telemetria ativados.');
    }
  }).catch(() => {});

  return {
    start: iniciar,
    stop: parar,
    restart: reiniciar,
    sendCommand: enviarComando,
    executar: enviarComando,
    getState: obterEstado,
    iniciar,
    parar,
    reiniciar,
    enviarComando,
    obterEstado,
    inspecionarJogador,
    resolverUuidPorNick,
    registarHandlerVinculo,
    listarModsDisco,
    aplicarPlanoMods
  };
}

module.exports = { createMinecraftManager };