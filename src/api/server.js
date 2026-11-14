'use strict';

const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');
const url = require('url');

function createApiServer({ config, hub, minecraft, bot } = {}) {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (req, res) => {
    res.json({
      ok: true,
      seq: hub ? hub.seqAtual : 0,
      minecraft: minecraft ? minecraft.obterEstado() : null,
      discord: bot ? bot.obterEstado() : null
    });
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws/logs' });

  wss.on('connection', (ws, req) => {
    const parsed = url.parse(req.url || '', true);
    const desdeSeq = Number(parsed.query && parsed.query.sinceSeq) || 0;

    if (hub) {
      hub.adicionarCliente(ws);
      ws.send(JSON.stringify({
        tipo: 'hello',
        dados: {
          seqAtual: hub.seqAtual,
          servicos: {
            minecraft: minecraft ? minecraft.obterEstado() : { status: 'offline', stats: {} },
            discord: bot ? bot.obterEstado() : { status: 'offline', stats: {} }
          },
          logs: hub.obterDesdeSeq(desdeSeq, 1500)
        }
      }));
    }
  });

  return { app, server, wss };
}

module.exports = { createApiServer };