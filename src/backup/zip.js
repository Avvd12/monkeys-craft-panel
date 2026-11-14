'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { PassThrough } = require('stream');

function carregar(nome) {
  let bruto;

  try {
    bruto = require(nome);
  } catch (e) {
    throw new Error(`Pacote "${nome}" nao instalado. Rode: npm install ${nome}`);
  }

  if (typeof bruto === 'function') return bruto;
  if (bruto && typeof bruto.default === 'function') return bruto.default;

  const tipos = bruto && typeof bruto === 'object'
    ? Object.keys(bruto).join(', ') || '(vazio)'
    : typeof bruto;

  throw new Error(`Pacote "${nome}" invalido. Recebido: ${tipos}.`);
}

const archiver = carregar('archiver');
const StreamZip = carregar('node-stream-zip');

const TRAVADO = ['EBUSY', 'EPERM', 'EACCES', 'EMFILE', 'ENFILE'];
const LIMITE_ARQUIVO = 256 * 1024 * 1024;
const MAX_PENDENTES = 48;

function esperar(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function registrarIgnorado(conta, motivo) {
  conta.ignoradosTotal += 1;
  if (conta.arquivosIgnorados.length < 100) conta.arquivosIgnorados.push(motivo);
}

// Le o arquivo inteiro com novas tentativas.
// Atomico: ou devolve o conteudo completo, ou falha sem ter enviado nada ao zip.
// Ler o buffer inteiro evita zip corrompido quando o arquivo trava no meio.
async function lerDoDisco(abs, tentativas = 5) {
  let ultimo;

  for (let i = 1; i <= tentativas; i++) {
    try {
      const st = await fsp.stat(abs);

      if (st.size > LIMITE_ARQUIVO) {
        const grande = new Error('grande');
        grande.code = 'GRANDE';
        throw grande;
      }

      return await fsp.readFile(abs);
    } catch (e) {
      ultimo = e;
      if (e.code === 'ENOENT' || e.code === 'GRANDE') throw e;
      if (!TRAVADO.includes(e.code)) throw e;
      if (i === tentativas) break;
      await esperar(300 * i);
    }
  }

  throw ultimo;
}

async function compactar({ itens, destino, ignorados = [], aoProgredir = null, limiteParadoMs = 600000 }) {
  const zip = archiver('zip', { zlib: { level: 1 } });
  const saida = fs.createWriteStream(destino);
  const passagem = new PassThrough();
  const hash = crypto.createHash('sha256');
  const conta = { arquivos: 0, bytes: 0, arquivosIgnorados: [], ignoradosTotal: 0 };

  let encerrado = false;
  let erroFatal = null;
  let pendentes = 0;
  let acordarDreno = null;
  let resolverConclusao = null;
  let rejeitarConclusao = null;

  const concluido = new Promise((res, rej) => {
    resolverConclusao = res;
    rejeitarConclusao = rej;
  });

  // Marca a promise como tratada antes de qualquer await,
  // senao uma falha precoce vira unhandledRejection e derruba o processo.
  concluido.catch(() => {});

  const falhar = (erro) => {
    if (encerrado) return;
    encerrado = true;
    erroFatal = erro;

    try { zip.abort(); } catch (e) {}
    try { passagem.destroy(); } catch (e) {}
    try { saida.destroy(); } catch (e) {}

    rejeitarConclusao(erro);
  };

  saida.once('close', () => {
    if (encerrado) return;
    encerrado = true;
    resolverConclusao();
  });

  saida.once('error', (e) => falhar(e));
  passagem.once('error', (e) => falhar(e));
  zip.on('error', (e) => falhar(e));
  zip.on('warning', (e) => registrarIgnorado(conta, e.message));

  zip.on('entry', () => {
    pendentes -= 1;
    if (pendentes <= MAX_PENDENTES / 2 && acordarDreno) {
      const acordar = acordarDreno;
      acordarDreno = null;
      acordar();
    }
  });

  zip.on('progress', (p) => {
    if (aoProgredir) aoProgredir(p.fs.processedBytes);
  });

  passagem.on('data', (bloco) => hash.update(bloco));
  passagem.pipe(saida);
  zip.pipe(passagem);

  async function aguardarDreno() {
    if (pendentes < MAX_PENDENTES) return;
    await new Promise((r) => { acordarDreno = r; });
  }

  async function adicionar(abs, nome) {
    if (encerrado) return;

    let dados;

    try {
      dados = await lerDoDisco(abs);
    } catch (e) {
      if (e.code === 'GRANDE') {
        registrarIgnorado(conta, `${nome} (maior que 256 MB)`);
        return;
      }
      registrarIgnorado(conta, `${nome} (${e.code || e.message})`);
      return;
    }

    await aguardarDreno();

    if (encerrado) return;

    zip.append(dados, { name: nome });
    pendentes += 1;
    conta.arquivos += 1;
    conta.bytes += dados.length;
  }

  async function varrer(abs, prefixo) {
    if (encerrado) return;

    let entradas;

    try {
      entradas = await fsp.readdir(abs, { withFileTypes: true });
    } catch (e) {
      registrarIgnorado(conta, `${prefixo}: ${e.code || e.message}`);
      return;
    }

    for (const entrada of entradas) {
      if (encerrado) return;
      if (ignorados.includes(entrada.name)) continue;

      const filhoAbs = path.join(abs, entrada.name);
      const filhoRel = prefixo ? `${prefixo}/${entrada.name}` : entrada.name;

      if (entrada.isDirectory()) {
        await varrer(filhoAbs, filhoRel);
        continue;
      }

      if (!entrada.isFile()) continue;

      await adicionar(filhoAbs, filhoRel);
    }
  }

  async function varrerItem(item) {
    let st;

    try {
      st = await fsp.stat(item.abs);
    } catch (e) {
      registrarIgnorado(conta, `${item.nome}: ${e.code || e.message}`);
      return;
    }

    if (st.isDirectory()) return varrer(item.abs, item.nome);
    if (st.isFile()) return adicionar(item.abs, item.nome);
  }

  let ultimoBytes = -1;
  let ultimoMovimento = Date.now();

  const vigia = setInterval(() => {
    if (encerrado) return;

    if (conta.bytes !== ultimoBytes) {
      ultimoBytes = conta.bytes;
      ultimoMovimento = Date.now();
      return;
    }

    if (Date.now() - ultimoMovimento > limiteParadoMs) {
      falhar(new Error(`Compactacao parada ha ${Math.round(limiteParadoMs / 60000)} minuto(s).`));
      clearInterval(vigia);
    }
  }, 15000);

  try {
    for (const item of itens) {
      if (encerrado) break;
      await varrerItem(item);
    }

    if (encerrado) {
      await concluido;
      throw erroFatal || new Error('Compactacao abortada.');
    }

    if (conta.arquivos === 0) {
      falhar(new Error(
        `Nenhum arquivo encontrado para compactar. Itens verificados: ${itens.map((i) => i.nome).join(', ')}.`
      ));
      await concluido;
      throw erroFatal || new Error('Sem arquivos.');
    }

    try {
      await zip.finalize();
    } catch (e) {
      falhar(e);
    }

    await concluido;
  } finally {
    clearInterval(vigia);
  }

  const st = await fsp.stat(destino);

  return {
    bytes: st.size,
    sha256: hash.digest('hex'),
    arquivos: conta.arquivos,
    arquivosIgnorados: conta.arquivosIgnorados,
    ignoradosTotal: conta.ignoradosTotal
  };
}

async function listarConteudo(arquivoZip) {
  const zip = new StreamZip.async({ file: arquivoZip });

  try {
    const entradas = await zip.entries();

    return Object.values(entradas)
      .filter((e) => !e.isDirectory)
      .map((e) => ({
        nome: e.name,
        bytes: e.size,
        data: new Date(e.time || Date.now()).toISOString()
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome));
  } finally {
    await zip.close();
  }
}

async function lerArquivo(arquivoZip, nome) {
  const zip = new StreamZip.async({ file: arquivoZip });

  try {
    return await zip.entryData(nome);
  } finally {
    await zip.close();
  }
}

async function extrair(arquivoZip, destino, { aoProgredir = null } = {}) {
  const zip = new StreamZip.async({ file: arquivoZip });
  const base = path.resolve(destino);

  try {
    const entradas = await zip.entries();
    const lista = Object.values(entradas).filter((e) => !e.isDirectory);
    let feitos = 0;

    for (const entrada of lista) {
      const rel = entrada.name.replace(/\\/g, '/');
      const alvo = path.resolve(base, rel);

      if (alvo !== base && !alvo.startsWith(base + path.sep)) {
        throw new Error(`Entrada suspeita no zip: ${entrada.name}`);
      }

      await fsp.mkdir(path.dirname(alvo), { recursive: true });
      await zip.extract(entrada.name, alvo);

      feitos += 1;
      if (aoProgredir) aoProgredir(feitos, lista.length);
    }

    return { total: lista.length };
  } finally {
    await zip.close();
  }
}

module.exports = { compactar, listarConteudo, lerArquivo, extrair };