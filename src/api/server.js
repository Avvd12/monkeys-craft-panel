'use strict';

const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');

function createApiServer({ config, hub, minecraft, bot }) {
  const app = express();
  app.use(express.json());

  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  app.use(express.static(config.panel.publicDir));

  const servicos = { minecraft, discord: bot };

  app.get('/api/status', (req, res) => {
    res.json({ minecraft: minecraft.getState(), discord: bot.getState() });
  });

  // Rotas explícitas de start e stop
  app.post('/api/services/minecraft/start', async (req, res) => {
    try { await minecraft.start(); res.json(minecraft.getState()); }
    catch (e) { res.status(500).json({ erro: e.message }); }
  });

  app.post('/api/services/minecraft/stop', async (req, res) => {
    try { await minecraft.stop(); res.json(minecraft.getState()); }
    catch (e) { res.status(500).json({ erro: e.message }); }
  });

  app.post('/api/services/discord/start', async (req, res) => {
    try { await bot.start(); res.json(bot.getState()); }
    catch (e) { res.status(500).json({ erro: e.message }); }
  });

  app.post('/api/services/discord/stop', async (req, res) => {
    try { await bot.stop(); res.json(bot.getState()); }
    catch (e) { res.status(500).json({ erro: e.message }); }
  });

  // Reinício: para, espera liberar e sobe de novo.
  // A espera acontece no backend porque só ele sabe quando a porta liberou.
  app.post('/api/services/:nome/restart', async (req, res) => {
    const alvo = servicos[req.params.nome];

    if (!alvo) {
      return res.status(404).json({ erro: 'Serviço não encontrado' });
    }

    if (typeof alvo.restart !== 'function') {
      return res.status(400).json({ erro: 'Serviço não suporta reinício' });
    }

    try {
      await alvo.restart();
      res.json(alvo.getState());
    } catch (e) {
      res.status(500).json({ erro: e.message });
    }
  });

  app.post('/api/console/minecraft', async (req, res) => {
    const { comando } = req.body || {};
    if (!comando || typeof comando !== 'string') {
      return res.status(400).json({ erro: 'Comando inválido' });
    }
    try {
      const resposta = await minecraft.sendCommand(comando);
      res.json({ ok: true, resposta });
    } catch (e) {
      res.status(500).json({ erro: e.message });
    }
  });

  app.post('/api/console/discord', async (req, res) => {
    const { mensagem } = req.body || {};
    if (!mensagem || typeof mensagem !== 'string') {
      return res.status(400).json({ erro: 'Mensagem inválida' });
    }
    try {
      await bot.sendMessage(mensagem);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ erro: e.message });
    }
  });

  app.get('/api/logs', (req, res) => {
    const limite = Math.min(parseInt(req.query.limite, 10) || 100, 1000);
    res.json(hub.obterRecentes(limite));
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws/logs' });

  wss.on('connection', (ws) => {
    ws.send(JSON.stringify({
      tipo: 'hello',
      dados: {
        servicos: { minecraft: minecraft.getState(), discord: bot.getState() },
        logs: hub.obterRecentes(100)
      }
    }));
    hub.adicionarCliente(ws);
  });

  return { app, server, wss };
}

module.exports = { createApiServer };