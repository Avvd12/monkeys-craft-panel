'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');

const backup = require('../minecraft/backup');
const zip = require('../backup/zip');

function calcularMetricasDiscoEBackups() {
  const dir = backup.dirBackups();
  let livreBytes = 0;
  let totalBytes = 0;
  let ocupadoBackupsBytes = 0;

  try {
    const stat = fs.statfsSync('D:/');
    livreBytes = stat.bavail * stat.bsize;
    totalBytes = stat.blocks * stat.bsize;
  } catch {
    try {
      const statFallback = fs.statfsSync(dir);
      livreBytes = statFallback.bavail * statFallback.bsize;
      totalBytes = statFallback.blocks * statFallback.bsize;
    } catch {}
  }

  try {
    if (fs.existsSync(dir)) {
      const arquivos = fs.readdirSync(dir);
      for (const arq of arquivos) {
        if (arq.toLowerCase().endsWith('.zip')) {
          try {
            const st = fs.statSync(path.join(dir, arq));
            if (st.isFile()) ocupadoBackupsBytes += st.size;
          } catch {}
        }
      }
    }
  } catch {}

  return { livreBytes, totalBytes, ocupadoBackupsBytes };
}

function criarMinecraftResiliente(minecraft) {
  if (!minecraft) return null;
  const executarSeguro = async (cmd) => {
    try {
      const est = typeof minecraft.obterEstado === 'function' ? minecraft.obterEstado() : null;
      if (est && est.status !== 'online') return '';
      if (typeof minecraft.executar === 'function') return await minecraft.executar(cmd);
      if (typeof minecraft.enviarComando === 'function') return await minecraft.enviarComando(cmd);
    } catch {}
    return '';
  };
  return {
    ...minecraft,
    executar: executarSeguro,
    enviarComando: executarSeguro,
    sendCommand: executarSeguro
  };
}

// proteger: funcao (cargo) => middleware. Se nao for passada, nao ha guarda.
function criarRotas({ proteger = null, minecraft = null, hub = null, onAuditoria = null } = {}) {
  const router = express.Router();
  const mcSeguro = criarMinecraftResiliente(minecraft);

  const guarda = (cargo) => {
    if (typeof proteger === 'function') return proteger(cargo);
    return (req, res, next) => next();
  };

  const ver = guarda('moderador');
  const admin = guarda('admin');

  const tratar = (fn) => async (req, res) => {
    try {
      await fn(req, res);
    } catch (e) {
      const status = e.status || 500;
      if (status >= 500) {
        if (hub) hub.log('backup', 'erro', e.message);
      }
      res.status(status).json({ erro: e.message });
    }
  };

  router.get(
    '/',
    ver,
    tratar(async (req, res) => {
      const lista = await backup.listar();
      const disco = calcularMetricasDiscoEBackups();
      res.json({
        ok: true,
        backups: lista,
        disco
      });
    })
  );

  router.get('/resumo', ver, tratar(async (req, res) => {
    const r = await backup.resumo();
    const disco = calcularMetricasDiscoEBackups();
    res.json({ ...r, disco });
  }));

  router.get('/estado', ver, (req, res) => {
    res.json(backup.estado());
  });

  router.post(
    '/',
    admin,
    tratar(async (req, res) => {
      const tipo = (req.body && req.body.tipo) ? String(req.body.tipo) : 'manual';
      const dados = await backup.criar({ tipo, origem: 'painel', minecraft: mcSeguro, hub });
      const disco = calcularMetricasDiscoEBackups();
      if (typeof onAuditoria === 'function') {
        try { onAuditoria(req, 'BACKUP_CREATE', dados.id || dados.arquivo, `Backup manual (${tipo})`); } catch {}
      }
      res.json({ ok: true, backup: dados, ...dados, disco });
    })
  );

  router.post(
    '/podar',
    admin,
    tratar(async (req, res) => {
      res.json(await backup.podar({ hub }));
    })
  );

  const handlerInspecionarZip = tratar(async (req, res) => {
    const id = String(req.params.id || '').replace(/\.zip$/i, '');
    const caminho = path.join(backup.dirBackups(), `${id}.zip`);
    if (!fs.existsSync(caminho)) {
      return res.status(404).json({ erro: 'Backup nao encontrado.' });
    }

    const entradas = await zip.listarConteudo(caminho);
    const arquivos = entradas.map((e) => ({
      nome: e.nome,
      bytes: e.bytes,
      tamanho: e.bytes,
      data: e.data
    }));
    res.json({ ok: true, id, total: arquivos.length, arquivos });
  });

  router.get('/:id/inspect', ver, handlerInspecionarZip);
  router.get('/:id/conteudo', ver, handlerInspecionarZip);

  router.get(
    '/:id/arquivo',
    ver,
    tratar(async (req, res) => {
      const nome = String(req.query.nome || req.query.path || '').trim();

      if (!nome || nome.includes('..') || nome.startsWith('/')) {
        return res.status(400).json({ erro: 'Caminho invalido.' });
      }

      const id = String(req.params.id || '').replace(/\.zip$/i, '');
      const caminho = path.join(backup.dirBackups(), `${id}.zip`);
      if (!fs.existsSync(caminho)) return res.status(404).json({ erro: 'Backup nao encontrado.' });

      const dados = await zip.lerArquivo(caminho, nome);

      if (dados.length > 2 * 1024 * 1024) {
        return res.status(413).json({ erro: 'Arquivo grande demais para visualizar.' });
      }

      res.json({ ok: true, nome, conteudo: dados.toString('utf8') });
    })
  );

  router.get('/:id/file', ver, (req, res, next) => {
    req.url = `/${encodeURIComponent(req.params.id)}/arquivo?${new URLSearchParams(req.query).toString()}`;
    router.handle(req, res, next);
  });

  router.post(
    '/:id/restaurar',
    admin,
    tratar(async (req, res) => {
      const id = String(req.params.id || '').replace(/\.zip$/i, '');
      const resultado = await backup.restaurar(id, { minecraft: mcSeguro, hub });
      if (typeof onAuditoria === 'function') {
        try { onAuditoria(req, 'BACKUP_RESTORE', id, 'Restauração de backup via painel'); } catch {}
      }
      res.json(resultado);
    })
  );

  router.delete(
    '/:id',
    admin,
    tratar(async (req, res) => {
      const id = String(req.params.id || '').replace(/\.zip$/i, '');
      const resultado = await backup.excluir(id, { hub });
      if (typeof onAuditoria === 'function') {
        try { onAuditoria(req, 'BACKUP_DELETE', id, 'Exclusão de backup via painel'); } catch {}
      }
      res.json(resultado);
    })
  );

  return router;
}

module.exports = { criarRotas, calcularMetricasDiscoEBackups };