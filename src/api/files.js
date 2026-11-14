'use strict';

const express = require('express');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const multer = require('multer');

const LIMITE_UPLOAD = 25 * 1024 * 1024;
const LIMITE_TEXTO = 2 * 1024 * 1024;

const EXTENSOES_TEXTO = new Set([
  '.txt', '.log', '.yml', '.yaml', '.json', '.properties', '.toml', '.ini', '.cfg', '.conf',
  '.md', '.csv', '.tsv', '.js', '.mjs', '.cjs', '.ts', '.sh', '.bat', '.ps1', '.py',
  '.html', '.css', '.xml', '.lang', '.mcmeta', '.snbt', '.gitignore'
]);

const NOMES_BLOQUEADOS = new Set([
  '.env', 'usuarios.json', 'acessos.log', 'node_modules', '.git', 'session',
  'package-lock.json', 'painel.log', 'sessoes.db', 'painel.db'
]);

class ErroArquivo extends Error {
  constructor(status, mensagem) {
    super(mensagem);
    this.status = status;
  }
}

function montarAreas(config) {
  const areas = [];
  const cwd = (config && config.minecraft && config.minecraft.cwd)
    || (config && config.server && config.server.cwd);

  if (!cwd || !fs.existsSync(cwd)) return areas;

  const raiz = fs.realpathSync(path.resolve(cwd));
  areas.push({ id: 'servidor', rotulo: 'Servidor', caminho: raiz });

  const comuns = [
    ['plugins', 'Plugins'],
    ['config', 'Configs'],
    ['world', 'Mundo'],
    ['logs', 'Logs'],
    ['mods', 'Mods'],
    ['kubejs', 'KubeJS'],
    ['backups', 'Backups']
  ];

  for (const [pasta, rotulo] of comuns) {
    const alvo = path.join(raiz, pasta);
    try {
      const lstat = fs.lstatSync(alvo);
      if (lstat.isDirectory() && !lstat.isSymbolicLink()) {
        areas.push({ id: pasta, rotulo, caminho: fs.realpathSync(alvo) });
      }
    } catch (e) {}
  }

  return areas;
}

function criarRotasArquivos({ config, registrarLog }) {
  const areas = montarAreas(config);
  const mapa = new Map(areas.map((a) => [a.id, a]));
  const router = express.Router();

  router.use(express.json({ limit: '3mb' }));

  function areaDe(req) {
    const id = String((req.query && req.query.area) || (req.body && req.body.area) || '').trim();
    const area = mapa.get(id);
    if (!area) throw new ErroArquivo(400, 'Área inválida ou servidor ainda não vinculado.');
    return area;
  }

  // Requisito 2.5: Restrição estrita à raiz permitida e proibição total de symlinks
  function resolverSeguro(area, relativo) {
    const base = area.caminho;
    const limpo = String(relativo || '').replace(/^[/\\]+/, '');
    const alvo = path.resolve(base, limpo);
    const rel = path.relative(base, alvo);

    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new ErroArquivo(400, 'Caminho fora da área permitida (Path Traversal bloqueado).');
    }

    const partes = rel.split(path.sep).filter(Boolean);
    let acumulado = base;
    for (const parte of partes) {
      if (NOMES_BLOQUEADOS.has(parte.toLowerCase())) {
        throw new ErroArquivo(403, `O item "${parte}" é protegido e não pode ser acedido.`);
      }
      acumulado = path.join(acumulado, parte);
      if (fs.existsSync(acumulado)) {
        const lst = fs.lstatSync(acumulado);
        if (lst.isSymbolicLink()) {
          throw new ErroArquivo(403, 'Acesso negado: links simbólicos (symlinks) são proibidos por segurança.');
        }
      }
    }

    if (fs.existsSync(alvo)) {
      const real = fs.realpathSync(alvo);
      if (real !== base && !real.startsWith(base + path.sep)) {
        throw new ErroArquivo(403, 'Escape de diretoria detetado e bloqueado.');
      }
    }

    return alvo;
  }

  function relativoDe(area, absoluto) {
    return path.relative(area.caminho, absoluto).split(path.sep).filter(Boolean).join('/');
  }

  function validarNome(nome) {
    const n = String(nome || '').trim();
    if (!n || n === '.' || n === '..' || /[\\/]/.test(n) || /[\x00-\x1f]/.test(n)) {
      throw new ErroArquivo(400, 'Nome inválido.');
    }
    if (NOMES_BLOQUEADOS.has(n.toLowerCase())) {
      throw new ErroArquivo(403, `O nome "${n}" é protegido.`);
    }
    return n;
  }

  router.get('/areas', (req, res) => {
    res.json({ areas: areas.map((a) => ({ id: a.id, rotulo: a.rotulo })) });
  });

  router.get('/listar', async (req, res, next) => {
    try {
      const area = areaDe(req);
      const alvo = resolverSeguro(area, req.query.caminho);
      const stat = await fsp.lstat(alvo);

      if (stat.isSymbolicLink()) throw new ErroArquivo(403, 'Symlinks bloqueados.');
      if (!stat.isDirectory()) throw new ErroArquivo(400, 'O caminho não é uma pasta.');

      const entradas = await fsp.readdir(alvo, { withFileTypes: true });
      const itens = entradas
        .filter((e) => !e.isSymbolicLink() && !NOMES_BLOQUEADOS.has(e.name.toLowerCase()))
        .map((e) => {
          let tamanho = 0;
          let modificado = null;
          try {
            const s = fs.statSync(path.join(alvo, e.name));
            tamanho = s.size;
            modificado = s.mtime.toISOString();
          } catch {}
          return {
            nome: e.name,
            pasta: e.isDirectory(),
            tamanho,
            modificado,
            editavel: !e.isDirectory() && EXTENSOES_TEXTO.has(path.extname(e.name).toLowerCase())
          };
        })
        .sort((a, b) => (a.pasta === b.pasta ? a.nome.localeCompare(b.nome) : a.pasta ? -1 : 1));

      res.json({ area: area.id, caminho: relativoDe(area, alvo), itens });
    } catch (e) { next(e); }
  });

  router.get('/ler', async (req, res, next) => {
    try {
      const area = areaDe(req);
      const alvo = resolverSeguro(area, req.query.caminho);
      const stat = await fsp.lstat(alvo);
      if (stat.isSymbolicLink() || stat.isDirectory()) throw new ErroArquivo(400, 'Ficheiro inválido.');
      if (stat.size > LIMITE_TEXTO) throw new ErroArquivo(413, 'Ficheiro demasiado grande para editar no navegador.');
      if (!EXTENSOES_TEXTO.has(path.extname(alvo).toLowerCase())) throw new ErroArquivo(415, 'Formato binário não editável.');

      const conteudo = await fsp.readFile(alvo, 'utf8');
      res.json({ caminho: relativoDe(area, alvo), conteudo, tamanho: stat.size });
    } catch (e) { next(e); }
  });

  router.put('/salvar', async (req, res, next) => {
    try {
      const area = areaDe(req);
      const alvo = resolverSeguro(area, req.body && req.body.caminho);
      const conteudo = String((req.body && req.body.conteudo) || '');
      if (Buffer.byteLength(conteudo, 'utf8') > LIMITE_TEXTO) throw new ErroArquivo(413, 'Conteúdo excede o limite.');
      if (!EXTENSOES_TEXTO.has(path.extname(alvo).toLowerCase())) throw new ErroArquivo(415, 'Extensão não permitida.');

      await fsp.writeFile(alvo, conteudo, 'utf8');
      registrarLog('arquivo-salvo', req.ip, req.session && req.session.usuario);
      res.json({ ok: true, caminho: relativoDe(area, alvo) });
    } catch (e) { next(e); }
  });

  router.post('/pasta', async (req, res, next) => {
    try {
      const area = areaDe(req);
      const pai = resolverSeguro(area, req.body && req.body.caminho);
      const nome = validarNome(req.body && req.body.nome);
      const destino = resolverSeguro(area, path.join(relativoDe(area, pai), nome));
      await fsp.mkdir(destino, { recursive: false });
      registrarLog('pasta-criada', req.ip, req.session && req.session.usuario);
      res.json({ ok: true, caminho: relativoDe(area, destino) });
    } catch (e) { next(e); }
  });

  router.post('/renomear', async (req, res, next) => {
    try {
      const area = areaDe(req);
      const origem = resolverSeguro(area, req.body && req.body.caminho);
      const nome = validarNome(req.body && req.body.novo);
      const pai = path.dirname(relativoDe(area, origem));
      const destino = resolverSeguro(area, path.join(pai === '.' ? '' : pai, nome));
      if (fs.existsSync(destino)) throw new ErroArquivo(409, 'Já existe um item com esse nome.');
      await fsp.rename(origem, destino);
      registrarLog('arquivo-renomeado', req.ip, req.session && req.session.usuario);
      res.json({ ok: true, caminho: relativoDe(area, destino) });
    } catch (e) { next(e); }
  });

  router.delete('/apagar', async (req, res, next) => {
    try {
      const area = areaDe(req);
      const alvo = resolverSeguro(area, req.body && req.body.caminho);
      if (alvo === area.caminho) throw new ErroArquivo(400, 'Proibido apagar a raiz da área.');
      const stat = await fsp.lstat(alvo);
      if (stat.isDirectory()) await fsp.rm(alvo, { recursive: true, force: true });
      else await fsp.unlink(alvo);
      registrarLog('arquivo-apagado', req.ip, req.session && req.session.usuario);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  router.get('/baixar', async (req, res, next) => {
    try {
      const area = areaDe(req);
      const alvo = resolverSeguro(area, req.query.caminho);
      const stat = await fsp.lstat(alvo);
      if (stat.isDirectory() || stat.isSymbolicLink()) throw new ErroArquivo(400, 'Operação inválida.');
      res.download(alvo, path.basename(alvo));
    } catch (e) { next(e); }
  });

  const upload = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => {
        try {
          const area = areaDe(req);
          cb(null, resolverSeguro(area, req.query.caminho));
        } catch (e) { cb(e); }
      },
      filename: (req, file, cb) => {
        const base = path.basename(file.originalname || 'arquivo');
        cb(null, base.replace(/[^\w.\- ]+/g, '_').slice(0, 120) || 'arquivo');
      }
    }),
    limits: { fileSize: LIMITE_UPLOAD, files: 10 }
  });

  router.post('/upload', upload.array('arquivos', 10), (req, res) => {
    registrarLog('arquivo-enviado', req.ip, req.session && req.session.usuario);
    res.json({ ok: true, enviados: (req.files || []).map((f) => f.filename) });
  });

  router.use((erro, req, res, next) => {
    const status = erro instanceof ErroArquivo ? erro.status : 500;
    const mensagem = erro instanceof ErroArquivo ? erro.message : 'Erro na operação de ficheiros.';
    res.status(status).json({ erro: mensagem });
  });

  return router;
}

module.exports = { criarRotasArquivos };