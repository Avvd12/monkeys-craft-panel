'use strict';

require('dotenv').config();

const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const session = require('express-session');
const SqliteStore = require('better-sqlite3-session-store')(session);
const Database = require('better-sqlite3');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcrypt');
const helmet = require('helmet');
const httpProxy = require('http-proxy');

const config = require('./config.json');

/* =========================================================
   1. USUARIOS
   ========================================================= */

const ARQUIVO_USUARIOS = path.join(__dirname, 'usuarios.json');
const ARQUIVO_LOG = path.join(__dirname, 'acessos.log');
const CARGOS = ['admin', 'moderador', 'visualizador'];

function lerUsuarios() {
  try {
    const dados = JSON.parse(fs.readFileSync(ARQUIVO_USUARIOS, 'utf8'));
    return dados && typeof dados === 'object' ? dados : {};
  } catch (e) {
    return {};
  }
}

function salvarUsuarios(usuarios) {
  fs.writeFileSync(ARQUIVO_USUARIOS, JSON.stringify(usuarios, null, 2), 'utf8');
}

function contarAdmins(usuarios) {
  return Object.values(usuarios).filter((u) => u && u.cargo === 'admin').length;
}

function registrarLog(evento, ip, usuario) {
  const linha = `${new Date().toISOString()} | ${evento} | ${ip} | ${usuario || '-'}\n`;
  fs.appendFile(ARQUIVO_LOG, linha, () => {});
}

if (Object.keys(lerUsuarios()).length === 0) {
  console.error('[ERRO] Nenhum usuario cadastrado. Rode: node criar-usuario.js');
  process.exit(1);
}

/* =========================================================
   2. MODULOS DO PAINEL
   ========================================================= */

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
const bot = construir(fnBot, [
  [{ hub, minecraft, config }],
  [{ hub, minecraft }],
  [hub, minecraft, config],
  [hub, config],
  [hub],
  []
], 'bot');
const api = construir(fnApi, [
  [{ config, hub, minecraft, bot }],
  [config, hub, minecraft, bot],
  [config, hub],
  [config],
  [hub, minecraft, bot],
  [hub],
  []
], 'api');

/* =========================================================
   3. PORTAS E SEGREDO
   ========================================================= */

const HOST = '127.0.0.1';
const PORTA_INTERNA = Number(process.env.PORTA_INTERNA || 3001);
const PORTA_PUBLICA = Number(process.env.PORTA_PUBLICA || (config.panel && config.panel.port) || 3000);
const SEGREDO = String(process.env.SESSION_SECRET || '').trim();

if (!SEGREDO || SEGREDO.length < 20) {
  console.error('[ERRO] Defina SESSION_SECRET no .env com pelo menos 20 caracteres.');
  process.exit(1);
}

const HASH_FALSO = bcrypt.hashSync('senha-inexistente-para-igualar-o-tempo', 12);

/* =========================================================
   4. API INTERNA
   ========================================================= */

const servidorApi = api.server || api.app || api;

if (typeof servidorApi.listen !== 'function') {
  console.error('[ERRO] A API nao devolveu um servidor com listen(). Exporta:', descrever(api));
  process.exit(1);
}

servidorApi.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`[ERRO] A porta ${PORTA_INTERNA} ja esta em uso. Feche o outro processo ou mude PORTA_INTERNA no .env.`);
    process.exit(1);
  }
  throw e;
});

servidorApi.listen(PORTA_INTERNA, HOST, () => {
  console.log(`[PAINEL] API interna em http://${HOST}:${PORTA_INTERNA}`);
});

/* =========================================================
   5. CONTROLE DE TENTATIVAS POR IP
   ========================================================= */

const MAX_FALHAS = 5;
const JANELA_MS = 15 * 60 * 1000;
const BLOQUEIO_MS = 15 * 60 * 1000;

const tentativas = new Map();

function ipDe(req) {
  const bruto = req.ip || (req.socket && req.socket.remoteAddress) || 'desconhecido';
  return String(bruto).replace(/^::ffff:/, '');
}

function estadoIp(ip) {
  const agora = Date.now();
  const registro = tentativas.get(ip);

  if (!registro) return { falhas: 0, bloqueadoAte: 0 };

  if (registro.bloqueadoAte && agora > registro.bloqueadoAte) {
    tentativas.delete(ip);
    return { falhas: 0, bloqueadoAte: 0 };
  }

  if (!registro.bloqueadoAte && agora - registro.ultima > JANELA_MS) {
    tentativas.delete(ip);
    return { falhas: 0, bloqueadoAte: 0 };
  }

  return registro;
}

function registrarFalha(ip) {
  const agora = Date.now();
  const registro = estadoIp(ip);
  const falhas = (registro.falhas || 0) + 1;
  const bloqueadoAte = falhas >= MAX_FALHAS ? agora + BLOQUEIO_MS : 0;

  tentativas.set(ip, { falhas, ultima: agora, bloqueadoAte });
  return { falhas, bloqueadoAte };
}

function limparTentativas(ip) {
  tentativas.delete(ip);
}

setInterval(() => {
  const agora = Date.now();
  for (const [ip, r] of tentativas) {
    if (r.bloqueadoAte && agora > r.bloqueadoAte) tentativas.delete(ip);
    else if (!r.bloqueadoAte && agora - r.ultima > JANELA_MS) tentativas.delete(ip);
  }
}, 5 * 60 * 1000).unref();

/* =========================================================
   6. GATEWAY PUBLICO
   ========================================================= */

const app = express();

app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

const PASTA_DADOS = path.join(__dirname, 'dados');
fs.mkdirSync(PASTA_DADOS, { recursive: true });

const bancoSessoes = new Database(path.join(PASTA_DADOS, 'sessoes.db'));
bancoSessoes.pragma('journal_mode = WAL');

const middlewareSessao = session({
  store: new SqliteStore({
    client: bancoSessoes,
    expired: { clear: true, intervalMs: 15 * 60 * 1000 }
  }),
  name: 'mc.sid',
  secret: SEGREDO,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: 'auto',
    maxAge: 8 * 60 * 60 * 1000
  }
});

app.use(middlewareSessao);

const jsonAuth = express.json({ limit: '64kb' });

const limitadorGeral = rateLimit({
  windowMs: 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erro: 'Muitas requisicoes. Aguarde um instante.' }
});

const limitadorLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erro: 'Muitas tentativas. Aguarde alguns minutos.' }
});

app.use(limitadorGeral);

/* ---------- login ---------- */

app.post('/auth/login', jsonAuth, limitadorLogin, async (req, res) => {
  const ip = ipDe(req);
  const estado = estadoIp(ip);

  if (estado.bloqueadoAte && Date.now() < estado.bloqueadoAte) {
    const minutos = Math.ceil((estado.bloqueadoAte - Date.now()) / 60000);
    registrarLog('bloqueado', ip, null);
    return res.status(429).json({ erro: `Muitas tentativas. Tente novamente em ${minutos} minuto(s).` });
  }

  const usuario = String((req.body && req.body.usuario) || '').trim().toLowerCase();
  const senha = String((req.body && req.body.senha) || '');

  const usuarios = lerUsuarios();
  const registro = usuarios[usuario];

  let senhaOk = false;
  try {
    senhaOk = await bcrypt.compare(senha || 'x', registro ? registro.hash : HASH_FALSO);
  } catch {
    senhaOk = false;
  }

  if (!registro || !senhaOk) {
    const r = registrarFalha(ip);
    registrarLog('falha', ip, usuario || null);

    const restantes = Math.max(0, MAX_FALHAS - r.falhas);

    return res.status(401).json({
      erro: restantes > 0
        ? `Usuario ou senha incorretos. Restam ${restantes} tentativa(s).`
        : 'Muitas tentativas. Acesso bloqueado por 15 minutos.'
    });
  }

  limparTentativas(ip);

  req.session.regenerate((erro) => {
    if (erro) {
      registrarLog('erro-sessao', ip, usuario);
      return res.status(500).json({ erro: 'Nao foi possivel iniciar a sessao.' });
    }

    req.session.logado = true;
    req.session.usuario = usuario;
    req.session.nome = registro.nome || usuario;
    req.session.cargo = registro.cargo || 'visualizador';

    registrarLog('sucesso', ip, usuario);

    res.json({
      ok: true,
      usuario: req.session.nome,
      cargo: req.session.cargo
    });
  });
});

app.post('/auth/logout', (req, res) => {
  const ip = ipDe(req);
  const usuario = (req.session && req.session.usuario) || null;

  req.session.destroy(() => {
    res.clearCookie('mc.sid');
    registrarLog('logout', ip, usuario);
    res.json({ ok: true });
  });
});

app.get('/auth/me', (req, res) => {
  res.json({
    logado: Boolean(req.session && req.session.logado),
    usuario: (req.session && req.session.nome) || null,
    login: (req.session && req.session.usuario) || null,
    cargo: (req.session && req.session.cargo) || null
  });
});

/* ---------- porteiro ---------- */

const LIBERADOS = ['/login.html', '/assets/', '/favicon.ico', '/auth/'];

app.use((req, res, next) => {
  if (req.session && req.session.logado) return next();
  if (LIBERADOS.some((p) => req.path.startsWith(p))) return next();

  if (req.path.startsWith('/api') || req.path.startsWith('/ws')) {
    return res.status(401).json({ erro: 'Nao autenticado.' });
  }

  return res.redirect('/login.html');
});

/* ---------- permissao por cargo ---------- */

function exigirCargo(...cargos) {
  return (req, res, next) => {
    if (!req.session || !req.session.logado) {
      return res.status(401).json({ erro: 'Nao autenticado.' });
    }
    if (cargos.length && !cargos.includes(req.session.cargo)) {
      return res.status(403).json({ erro: 'Seu cargo nao permite esta acao.' });
    }
    next();
  };
}

/* =========================================================
   7. GERENCIAMENTO DE USUARIOS (somente admin)
   ========================================================= */

const routerUsuarios = express.Router();

routerUsuarios.get('/', exigirCargo('admin'), (req, res) => {
  const usuarios = lerUsuarios();

  const lista = Object.entries(usuarios).map(([usuario, dados]) => ({
    usuario,
    nome: dados.nome || usuario,
    cargo: dados.cargo || 'visualizador',
    criadoEm: dados.criadoEm || null,
    atualizadoEm: dados.atualizadoEm || null
  }));

  res.json({ usuarios: lista, cargos: CARGOS });
});

routerUsuarios.post('/', jsonAuth, exigirCargo('admin'), async (req, res) => {
  const ip = ipDe(req);

  const usuario = String((req.body && req.body.usuario) || '').trim().toLowerCase();
  const senha = String((req.body && req.body.senha) || '');
  const cargo = String((req.body && req.body.cargo) || '').trim().toLowerCase();

  if (!/^[a-z0-9._-]{3,24}$/.test(usuario)) {
    return res.status(400).json({ erro: 'Usuario invalido. Use de 3 a 24 caracteres: letras minusculas, numeros, ponto, underline ou hifen.' });
  }

  if (senha.length < 8) {
    return res.status(400).json({ erro: 'A senha precisa ter pelo menos 8 caracteres.' });
  }

  if (!CARGOS.includes(cargo)) {
    return res.status(400).json({ erro: `Cargo invalido. Use: ${CARGOS.join(', ')}.` });
  }

  const usuarios = lerUsuarios();
  const existente = usuarios[usuario];

  if (existente && existente.cargo === 'admin' && cargo !== 'admin' && contarAdmins(usuarios) <= 1) {
    return res.status(400).json({ erro: 'Este e o unico administrador. Promova outro antes de rebaixar este.' });
  }

  usuarios[usuario] = {
    nome: usuario,
    hash: await bcrypt.hash(senha, 12),
    cargo,
    criadoEm: (existente && existente.criadoEm) || new Date().toISOString(),
    atualizadoEm: new Date().toISOString()
  };

  salvarUsuarios(usuarios);
  registrarLog(existente ? 'usuario-atualizado' : 'usuario-criado', ip, usuario);

  res.json({ ok: true, usuario, cargo, atualizado: Boolean(existente) });
});

routerUsuarios.delete('/:usuario', exigirCargo('admin'), (req, res) => {
  const ip = ipDe(req);
  const usuario = String(req.params.usuario || '').trim().toLowerCase();

  if (usuario === req.session.usuario) {
    return res.status(400).json({ erro: 'Voce nao pode remover a propria conta.' });
  }

  const usuarios = lerUsuarios();

  if (!usuarios[usuario]) {
    return res.status(404).json({ erro: 'Usuario nao encontrado.' });
  }

  if (usuarios[usuario].cargo === 'admin' && contarAdmins(usuarios) <= 1) {
    return res.status(400).json({ erro: 'Este e o unico administrador. Nao pode ser removido.' });
  }

  delete usuarios[usuario];
  salvarUsuarios(usuarios);
  registrarLog('usuario-removido', ip, usuario);

  res.json({ ok: true });
});

app.use('/api/usuarios', routerUsuarios);

/* =========================================================
   8. GERENCIAMENTO DE ARQUIVOS (somente admin)
   ========================================================= */

const { criarRotasArquivos } = require('./src/api/files');

app.use('/api/files', exigirCargo('admin'), criarRotasArquivos({ config, registrarLog }));
/* =========================================================
   8b. ROTAS DO PAINEL (status, servicos, console)
   ========================================================= */

function chamar(obj, nomes, ...args) {
  if (!obj) return Promise.reject(new Error('Servico indisponivel.'));
  for (const n of nomes) {
    if (typeof obj[n] === 'function') return Promise.resolve(obj[n](...args));
  }
  return Promise.reject(new Error('Metodo nao encontrado no servico.'));
}

function estadoDe(obj, padrao) {
  try {
    if (obj && typeof obj.obterEstado === 'function') return obj.obterEstado();
    if (obj && typeof obj.getState === 'function') return obj.getState();
  } catch (e) {}
  return padrao;
}

app.get('/api/status', (req, res) => {
  res.json({
    minecraft: estadoDe(minecraft, { status: 'offline', stats: {} }),
    discord: estadoDe(bot, { status: 'offline', stats: {} })
  });
});

app.post('/api/services/:servico/:acao', async (req, res) => {
  const servico = String(req.params.servico || '').toLowerCase();
  const acao = String(req.params.acao || '').toLowerCase();

  const alvo = servico === 'minecraft' ? minecraft : servico === 'discord' ? bot : null;
  if (!alvo) return res.status(404).json({ erro: 'Servico desconhecido.' });

  const mapa = {
    start: ['iniciar', 'start', 'ligar'],
    stop: ['parar', 'stop', 'desligar'],
    restart: ['reiniciar', 'restart']
  };

  const nomes = mapa[acao];
  if (!nomes) return res.status(400).json({ erro: 'Acao invalida.' });

  try {
    await chamar(alvo, nomes);
    res.json(estadoDe(alvo, { status: 'online', stats: {} }));
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

app.post('/api/console/minecraft', jsonAuth, async (req, res) => {
  const comando = String((req.body && req.body.comando) || '').trim();
  if (!comando) return res.status(400).json({ erro: 'Comando vazio.' });

  try {
    const resposta = await chamar(minecraft, ['executar', 'enviarComando', 'comando', 'send'], comando);
    res.json({ ok: true, resposta: resposta == null ? null : String(resposta) });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});
app.get('/api/whitelist', exigirCargo('admin', 'moderador'), async (req, res) => {
  try {
    const resposta = await chamar(minecraft, ['executar', 'enviarComando', 'comando', 'send'], 'whitelist list');
    res.json({ ok: true, lista: resposta == null ? null : String(resposta) });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

app.post('/api/whitelist', jsonAuth, exigirCargo('admin', 'moderador'), async (req, res) => {
  const acao = String((req.body && req.body.acao) || '').toLowerCase();
  const nick = String((req.body && req.body.nick) || '').trim();

  if (!['add', 'remove'].includes(acao)) {
    return res.status(400).json({ erro: 'Acao invalida. Use add ou remove.' });
  }

  if (!/^[A-Za-z0-9_]{3,16}$/.test(nick)) {
    return res.status(400).json({ erro: 'Nick invalido.' });
  }

  try {
    await chamar(minecraft, ['executar', 'enviarComando', 'comando', 'send'], `whitelist ${acao} ${nick}`);
    res.json({ ok: true, acao, nick });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

app.post('/api/ban', jsonAuth, exigirCargo('admin', 'moderador'), async (req, res) => {
  const nick = String((req.body && req.body.nick) || '').trim();
  const motivo = String((req.body && req.body.motivo) || 'nao informado').trim();

  if (!/^[A-Za-z0-9_]{3,16}$/.test(nick)) {
    return res.status(400).json({ erro: 'Nick invalido.' });
  }

  try {
    await chamar(minecraft, ['executar', 'enviarComando', 'comando', 'send'], `ban ${nick} ${motivo}`);
    res.json({ ok: true, nick, motivo });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});
/* ---------- proxy ---------- */

const proxy = httpProxy.createProxyServer({ changeOrigin: true, xfwd: true });

proxy.on('error', (erro, req, res) => {
  if (res && !res.headersSent && typeof res.writeHead === 'function') {
    res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ erro: 'Servico interno indisponivel.' }));
    return;
  }
  if (res && typeof res.end === 'function') res.end();
});

// Rotas que exigem cargo. Ajuste conforme as rotas reais da sua API.
app.use('/api/restart', exigirCargo('admin'));
app.use('/api/server/stop', exigirCargo('admin'));
app.use('/api/server/start', exigirCargo('admin'));

app.use('/api', (req, res) => {
  proxy.web(req, res, { target: `http://${HOST}:${PORTA_INTERNA}` });
});

app.use('/ws', (req, res) => {
  proxy.web(req, res, { target: `ws://${HOST}:${PORTA_INTERNA}` });
});

app.use(express.static(path.join(__dirname, 'public'), { index: 'index.html' }));

/* =========================================================
   9. SERVIDOR PUBLICO E WEBSOCKET
   ========================================================= */

const servidorPublico = http.createServer(app);

const resFalso = {
  getHeader: () => undefined,
  setHeader: () => {},
  removeHeader: () => {},
  writeHead: () => {},
  end: () => {},
  on: () => {},
  once: () => {},
  emit: () => {}
};

servidorPublico.on('upgrade', (req, socket, head) => {
  middlewareSessao(req, resFalso, () => {
    if (!req.session || !req.session.logado) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    proxy.ws(req, socket, head, { target: `ws://${HOST}:${PORTA_INTERNA}` });
  });
});

servidorPublico.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`[ERRO] A porta ${PORTA_PUBLICA} ja esta em uso. Feche o outro processo ou mude PORTA_PUBLICA no .env.`);
    process.exit(1);
  }
  throw e;
});

servidorPublico.listen(PORTA_PUBLICA, HOST, () => {
  console.log(`[PAINEL] Painel em http://${HOST}:${PORTA_PUBLICA}`);
  console.log(`[PAINEL] Usuarios: ${Object.keys(lerUsuarios()).join(', ')}`);
});

process.on('uncaughtException', (e) => console.error('[ERRO NAO TRATADO]', e));