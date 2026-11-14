'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const net = require('net');

const zip = require('../backup/zip');
const config = require('../../config.json');

class ErroBackup extends Error {
  constructor(mensagem, status = 400) {
    super(mensagem);
    this.name = 'ErroBackup';
    this.status = status;
  }
}

const ESTADO = {
  operacao: null,
  tipo: null,
  etapa: null,
  progresso: 0,
  iniciadoEm: null
};

function cfg() {
  return config.backups || {};
}

function dirBackups() {
  const custom = cfg().caminho;
  if (custom) return path.resolve(custom);
  return path.join(__dirname, '..', '..', 'dados', 'backups');
}

function dirTmp() {
  return path.join(dirBackups(), 'tmp');
}

function dirRollback() {
  return path.join(dirBackups(), 'rollback');
}

function raizServidor() {
  const raiz =
    (config.server && config.server.cwd) ||
    (config.minecraft && config.minecraft.cwd) ||
    null;

  if (!raiz) throw new ErroBackup('config.server.cwd nao definido no config.json.', 500);

  return path.resolve(raiz);
}

function log(hub, nivel, mensagem) {
  if (!hub || typeof hub.log !== 'function') return;
  try {
    hub.log('backup', nivel, mensagem);
  } catch (e) {
    // Console do painel fora do ar nao pode derrubar o backup.
  }
}

// Mesmo padrao de chamada usado pelo server.js, com fallback para os nomes usuais.
function rcon(minecraft, comando) {
  if (!minecraft) throw new ErroBackup('Gerenciador do Minecraft indisponivel.', 500);

  for (const nome of ['executar', 'enviarComando', 'comando', 'send', 'rcon']) {
    if (typeof minecraft[nome] === 'function') return minecraft[nome](comando);
  }

  throw new ErroBackup('Metodo de RCON indisponivel no gerenciador.', 500);
}

function esperar(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function garantirPastas() {
  await fsp.mkdir(dirBackups(), { recursive: true });
  await fsp.mkdir(dirTmp(), { recursive: true });
}

function contarBytes(alvo) {
  let total = 0;

  try {
    const st = fs.statSync(alvo);

    if (st.isFile()) return st.size;
    if (!st.isDirectory()) return 0;

    for (const e of fs.readdirSync(alvo, { withFileTypes: true })) {
      if (e.name === 'session.lock') continue;
      total += contarBytes(path.join(alvo, e.name));
    }
  } catch (e) {
    // Item ilegivel conta zero.
  }

  return total;
}

async function espacoLivre(dir) {
  try {
    const st = await fsp.statfs(dir);
    return st.bavail * st.bsize;
  } catch (e) {
    return Number.MAX_SAFE_INTEGER;
  }
}

function itensAlvo() {
  const raiz = raizServidor();

  const mundos = Array.isArray(cfg().mundos) && cfg().mundos.length
    ? cfg().mundos
    : ['world', 'world_nether', 'world_the_end'];

  const extras = Array.isArray(cfg().incluir) ? cfg().incluir : [];

  const lista = [];

  for (const nome of [...mundos, ...extras]) {
    if (lista.some((i) => i.nome === nome)) continue;
    const abs = path.join(raiz, nome);
    if (fs.existsSync(abs)) lista.push({ nome, abs });
  }

  return lista;
}

function semanaIso(iso) {
  const d = new Date(iso);
  const copia = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dia = copia.getUTCDay() || 7;
  copia.setUTCDate(copia.getUTCDate() + 4 - dia);
  const inicio = new Date(Date.UTC(copia.getUTCFullYear(), 0, 1));
  const semana = Math.ceil(((copia - inicio) / 86400000 + 1) / 7);
  return `${copia.getUTCFullYear()}-W${String(semana).padStart(2, '0')}`;
}

// Remove restos de execucoes que morreram no meio.
async function limparOrfaos() {
  await garantirPastas();

  const tmp = await fsp.readdir(dirTmp()).catch(() => []);
  for (const nome of tmp) {
    await fsp.rm(path.join(dirTmp(), nome), { force: true, recursive: true }).catch(() => {});
  }

  const arquivos = await fsp.readdir(dirBackups()).catch(() => []);
  const ids = new Set();

  for (const nome of arquivos) {
    if (nome.endsWith('.json')) ids.add(nome.replace(/\.json$/, ''));
    if (nome.endsWith('.zip')) ids.add(nome.replace(/\.zip$/, ''));
  }

  for (const id of ids) {
    const temZip = fs.existsSync(path.join(dirBackups(), `${id}.zip`));
    const temJson = fs.existsSync(path.join(dirBackups(), `${id}.json`));

    if (!temZip || !temJson) {
      await fsp.rm(path.join(dirBackups(), `${id}.zip`), { force: true }).catch(() => {});
      await fsp.rm(path.join(dirBackups(), `${id}.json`), { force: true }).catch(() => {});
    }
  }
}

async function executarCriacao({ tipo = 'manual', origem = 'painel', minecraft = null, hub = null } = {}) {
  await garantirPastas();
  await limparOrfaos();

  const inicio = Date.now();
  const itens = itensAlvo();

  if (!itens.length) {
    throw new ErroBackup('Nenhuma pasta ou arquivo encontrado em config.server.cwd.', 500);
  }

  const tamanho = itens.reduce((soma, i) => soma + contarBytes(i.abs), 0);
  const livre = await espacoLivre(dirBackups());

  if (livre < tamanho * 1.3) {
    throw new ErroBackup(
      `Espaco insuficiente. Livre ${(livre / 1e9).toFixed(1)} GB, necessario ${((tamanho * 1.3) / 1e9).toFixed(1)} GB.`,
      507
    );
  }

  const agora = new Date();
  const id = `${agora.toISOString().slice(0, 19).replace(/[:T]/g, '-')}_${tipo}`;
  const destino = path.join(dirBackups(), `${id}.zip`);
  const temporario = path.join(dirTmp(), `${id}.zip.part`);
  const manifesto = path.join(dirBackups(), `${id}.json`);

  ESTADO.tipo = tipo;
  ESTADO.iniciadoEm = agora.toISOString();
  ESTADO.etapa = 'pausando-autosave';
  ESTADO.progresso = 0;

  let autosaveDesligado = false;

  try {
    log(hub, 'info', 'Desligando o autosave do servidor...');
    await rcon(minecraft, 'save-off');
    autosaveDesligado = true;

    ESTADO.etapa = 'salvando';
    log(hub, 'info', 'Forcando save-all flush...');
    await rcon(minecraft, 'save-all flush');
    await esperar(2000);

    ESTADO.etapa = 'compactando';
    log(hub, 'info', `Compactando ${itens.length} item(ns), ${(tamanho / 1e9).toFixed(2)} GB...`);

    const resultado = await zip.compactar({
      itens,
      destino: temporario,
      ignorados: ['session.lock'],
      aoProgredir: (bytes) => {
        ESTADO.progresso = bytes;
      }
    });

    ESTADO.etapa = 'verificando';
    await fsp.rename(temporario, destino);

    const st = await fsp.stat(destino);

    const dados = {
      id,
      criadoEm: agora.toISOString(),
      tipo,
      origem,
      pastas: itens.map((i) => i.nome),
      bytes: st.size,
      sha256: resultado.sha256,
      arquivos: resultado.arquivos,
      arquivosIgnorados: resultado.arquivosIgnorados,
      duracaoMs: Date.now() - inicio,
      verificado: resultado.arquivos > 0 && st.size > 0
    };

    await fsp.writeFile(manifesto, JSON.stringify(dados, null, 2), 'utf8');

    log(
      hub,
      'sucesso',
      `Backup ${id} concluido: ${(st.size / 1e6).toFixed(1)} MB em ${((Date.now() - inicio) / 1000).toFixed(0)}s`
    );

    await podar({ hub }).catch((e) => log(hub, 'aviso', `Falha ao podar: ${e.message}`));

    return dados;
  } catch (e) {
    await fsp.rm(temporario, { force: true }).catch(() => {});
    log(hub, 'erro', `Backup falhou: ${e.message}`);
    throw e;
  } finally {
    // Religar o autosave mesmo em erro. Sem isso o servidor deixa de gravar.
    if (autosaveDesligado) {
      try {
        await rcon(minecraft, 'save-on');
        log(hub, 'info', 'Autosave religado.');
      } catch (e) {
        log(hub, 'erro', `Falha ao religar o autosave: ${e.message}. Tentando de novo.`);
        await esperar(1000);
        await rcon(minecraft, 'save-on').catch(() => {
          log(hub, 'erro', 'CRITICO: autosave continua desligado. Rode /save-on manualmente.');
        });
      }
    }
  }
}

async function criar(opcoes = {}) {
  if (ESTADO.operacao) {
    throw new ErroBackup('Ja existe uma operacao de backup em andamento.', 409);
  }

  ESTADO.operacao = 'backup';

  try {
    return await executarCriacao(opcoes);
  } finally {
    ESTADO.operacao = null;
    ESTADO.etapa = null;
    ESTADO.progresso = 0;
    ESTADO.tipo = null;
  }
}

async function listar() {
  await garantirPastas();

  const arquivos = await fsp.readdir(dirBackups()).catch(() => []);
  const itens = [];

  for (const nome of arquivos) {
    if (!nome.endsWith('.json')) continue;

    try {
      const bruto = await fsp.readFile(path.join(dirBackups(), nome), 'utf8');
      const dados = JSON.parse(bruto);
      const temZip = fs.existsSync(path.join(dirBackups(), `${dados.id}.zip`));
      itens.push({ ...dados, arquivoPresente: temZip });
    } catch (e) {
      // Manifesto corrompido, ignorado.
    }
  }

  return itens.sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm)));
}

async function obter(id) {
  const todos = await listar();
  return todos.find((b) => b.id === id) || null;
}

async function removerArquivos(id) {
  await fsp.rm(path.join(dirBackups(), `${id}.zip`), { force: true });
  await fsp.rm(path.join(dirBackups(), `${id}.json`), { force: true });
}

async function excluir(id, { hub = null } = {}) {
  if (ESTADO.operacao) {
    throw new ErroBackup('Aguarde a operacao em andamento terminar.', 409);
  }

  const item = await obter(id);
  if (!item) throw new ErroBackup('Backup nao encontrado.', 404);

  await removerArquivos(id);
  log(hub, 'info', `Backup ${id} excluido.`);

  return { id, excluido: true };
}

async function podar({ hub = null } = {}) {
  const p = cfg().retencao || {};
  const manter = Number.isFinite(p.manter) ? p.manter : 10;
  const diarios = Number.isFinite(p.diarios) ? p.diarios : 7;
  const semanais = Number.isFinite(p.semanais) ? p.semanais : 4;

  const todos = await listar();
  const automaticos = todos.filter((b) => b.tipo === 'auto');
  const manterIds = new Set();

  automaticos.slice(0, manter).forEach((b) => manterIds.add(b.id));

  const dias = new Set();
  for (const b of automaticos) {
    const dia = String(b.criadoEm).slice(0, 10);
    if (dias.has(dia)) continue;
    if (dias.size >= diarios) break;
    dias.add(dia);
    manterIds.add(b.id);
  }

  const semanas = new Set();
  for (const b of automaticos) {
    const s = semanaIso(b.criadoEm);
    if (semanas.has(s)) continue;
    if (semanas.size >= semanais) break;
    semanas.add(s);
    manterIds.add(b.id);
  }

  const remover = automaticos.filter((b) => !manterIds.has(b.id));

  for (const b of remover) {
    await removerArquivos(b.id).catch(() => {});
  }

  if (remover.length) {
    log(hub, 'info', `Retencao removeu ${remover.length} backup(s) antigo(s).`);
  }

  return { removidos: remover.length, mantidos: manterIds.size };
}

function portaAberta(host, porta, timeout = 1200) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let encerrado = false;

    const fim = (resultado) => {
      if (encerrado) return;
      encerrado = true;
      socket.destroy();
      resolve(resultado);
    };

    socket.setTimeout(timeout);
    socket.once('connect', () => fim(true));
    socket.once('timeout', () => fim(false));
    socket.once('error', () => fim(false));
    socket.connect(porta, host);
  });
}

// Checa o estado interno e tambem a porta, para nao confiar so no gerenciador.
async function servidorOnline(minecraft) {
  try {
    for (const nome of ['obterEstado', 'getState']) {
      if (minecraft && typeof minecraft[nome] === 'function') {
        const estado = minecraft[nome]();
        if (estado && (estado.status === 'online' || estado.status === 'iniciando')) return true;
      }
    }
  } catch (e) {
    // Cai para a checagem de porta.
  }

  const mc = config.minecraft || {};
  const host = mc.host || '127.0.0.1';
  const porta = Number(mc.port) || 25565;

  return portaAberta(host, porta);
}

async function restaurar(id, { minecraft = null, hub = null } = {}) {
  if (ESTADO.operacao) {
    throw new ErroBackup('Ja existe uma operacao em andamento.', 409);
  }

  const item = await obter(id);
  if (!item) throw new ErroBackup('Backup nao encontrado.', 404);

  const caminhoZip = path.join(dirBackups(), `${id}.zip`);
  if (!fs.existsSync(caminhoZip)) {
    throw new ErroBackup('Arquivo do backup ausente.', 410);
  }

  if (await servidorOnline(minecraft)) {
    throw new ErroBackup('Pare o servidor antes de restaurar.', 409);
  }

  ESTADO.operacao = 'restore';
  ESTADO.tipo = 'restore';
  ESTADO.etapa = 'backup-pre-restore';
  ESTADO.progresso = 0;
  ESTADO.iniciadoEm = new Date().toISOString();

  const raiz = raizServidor();
  const destinoRollback = path.join(dirRollback(), id);
  const movidos = [];

  try {
    log(hub, 'info', 'Criando backup de seguranca antes da restauracao...');
    await executarCriacao({ tipo: 'pre-restore', origem: 'restauracao', minecraft, hub });

    ESTADO.etapa = 'movendo-mundos';
    await fsp.mkdir(destinoRollback, { recursive: true });

    // Move, nunca apaga. Isso e o rollback.
    for (const nome of item.pastas || []) {
      const atual = path.join(raiz, nome);
      if (!fs.existsSync(atual)) continue;

      const guardado = path.join(destinoRollback, nome);
      await fsp.rm(guardado, { recursive: true, force: true }).catch(() => {});
      await fsp.rename(atual, guardado);
      movidos.push({ nome, atual, guardado });
    }

    ESTADO.etapa = 'extraindo';
    log(hub, 'info', `Extraindo ${id} para ${raiz}...`);

    await zip.extrair(caminhoZip, raiz, {
      aoProgredir: (feitos, total) => {
        ESTADO.progresso = Math.round((feitos / total) * 100);
      }
    });

    ESTADO.etapa = 'concluido';
    log(hub, 'sucesso', `Restauracao de ${id} concluida. Inicie o servidor para validar.`);

    return {
      id,
      restaurado: true,
      pastas: item.pastas || [],
      rollback: movidos.map((m) => m.guardado)
    };
  } catch (e) {
    ESTADO.etapa = 'revertendo';
    log(hub, 'erro', `Restauracao falhou: ${e.message}. Revertendo...`);

    for (const m of movidos) {
      try {
        await fsp.rm(m.atual, { recursive: true, force: true }).catch(() => {});
        if (fs.existsSync(m.guardado)) await fsp.rename(m.guardado, m.atual);
      } catch (erro) {
        log(hub, 'erro', `Falha ao reverter ${m.nome}: ${erro.message}`);
      }
    }

    log(hub, 'aviso', 'Itens anteriores devolvidos. Nada foi perdido.');
    throw e;
  } finally {
    ESTADO.operacao = null;
    ESTADO.etapa = null;
    ESTADO.progresso = 0;
    ESTADO.tipo = null;
  }
}

// Rede de seguranca: se o painel caiu com o autosave desligado, religa.
async function garantirAutosave({ minecraft = null, hub = null } = {}) {
  try {
    if (!(await servidorOnline(minecraft))) return false;
    await rcon(minecraft, 'save-on');
    log(hub, 'info', 'Autosave confirmado como ativo.');
    return true;
  } catch (e) {
    log(hub, 'aviso', `Nao foi possivel confirmar o autosave: ${e.message}`);
    return false;
  }
}

async function resumo() {
  await garantirPastas();

  const itens = await listar();
  const total = itens.reduce((soma, b) => soma + (b.bytes || 0), 0);
  const livre = await espacoLivre(dirBackups());

  return {
    quantidade: itens.length,
    totalBytes: total,
    livreBytes: livre,
    ultimo: itens[0] || null
  };
}

module.exports = {
  criar,
  listar,
  obter,
  excluir,
  podar,
  restaurar,
  resumo,
  garantirAutosave,
  limparOrfaos,
  estado: () => ({ ...ESTADO }),
  ErroBackup,
  dirBackups,
  dirRollback
};