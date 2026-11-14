'use strict';

const net = require('net');
const config = require('../config.json');

class ClienteRcon {
  constructor(host, porta, senha) {
    this.host = host;
    this.porta = porta;
    this.senha = senha;
    this.socket = null;
    this.autenticado = false;
    this.contadorId = 0;
    this.buffer = Buffer.alloc(0);
  }

  conectar() {
    if (this.socket && !this.socket.destroyed && this.autenticado) {
      return Promise.resolve();
    }

    return new Promise((resolver, rejeitar) => {
      this.desconectar();
      this.socket = net.createConnection({ host: this.host, port: this.porta });
      this.socket.setTimeout(4000);

      this.socket.once('connect', async () => {
        try {
          await this._autenticar();
          this.autenticado = true;
          resolver();
        } catch (erro) {
          this.desconectar();
          rejeitar(erro);
        }
      });

      this.socket.once('timeout', () => {
        this.desconectar();
        rejeitar(new Error('Tempo limite esgotado ao conectar no RCON'));
      });

      this.socket.once('error', (erro) => {
        this.desconectar();
        rejeitar(erro);
      });

      this.socket.once('close', () => {
        this.autenticado = false;
        this.socket = null;
      });
    });
  }

  _autenticar() {
    return this._enviar(3, this.senha);
  }

  enviar(comando) {
    return this._enviar(2, comando);
  }

  _enviar(tipo, payload) {
    return new Promise((resolver, rejeitar) => {
      if (!this.socket || this.socket.destroyed) {
        return rejeitar(new Error('Socket RCON desconectado.'));
      }

      const id = ++this.contadorId;
      const corpo = Buffer.from(String(payload || '') + '\x00', 'utf8');
      const comprimento = 4 + 4 + corpo.length + 1;
      const pacote = Buffer.alloc(comprimento + 4);

      pacote.writeInt32LE(comprimento, 0);
      pacote.writeInt32LE(id, 4);
      pacote.writeInt32LE(tipo, 8);
      corpo.copy(pacote, 12);
      pacote.writeInt8(0, 12 + corpo.length);

      const timer = setTimeout(() => {
        if (this.socket) this.socket.removeListener('data', aoReceber);
        rejeitar(new Error('Timeout aguardando resposta do comando RCON'));
      }, 4500);

      const aoReceber = (bloco) => {
        this.buffer = Buffer.concat([this.buffer, bloco]);
        while (this.buffer.length >= 4) {
          const len = this.buffer.readInt32LE(0);
          if (this.buffer.length < len + 4) break;

          const pkt = this.buffer.subarray(4, len + 4);
          this.buffer = this.buffer.subarray(len + 4);

          const idPkt = pkt.readInt32LE(0);
          const corpoStr = pkt.subarray(8, pkt.length - 2).toString('utf8');

          if (idPkt === -1) {
            clearTimeout(timer);
            if (this.socket) this.socket.removeListener('data', aoReceber);
            return rejeitar(new Error('Falha na autenticacao RCON (senha incorreta).'));
          }

          if (idPkt === id) {
            clearTimeout(timer);
            if (this.socket) this.socket.removeListener('data', aoReceber);
            return resolver(corpoStr);
          }
        }
      };

      this.socket.on('data', aoReceber);
      this.socket.write(pacote);
    });
  }

  desconectar() {
    this.autenticado = false;
    if (this.socket) {
      try { this.socket.destroy(); } catch {}
      this.socket = null;
    }
  }
}

let instanciaPadrao = null;

function obterInstancia() {
  if (!instanciaPadrao) {
    const cfg = config.rcon || {};
    instanciaPadrao = new ClienteRcon(
      cfg.host || '127.0.0.1',
      Number(cfg.port) || 25575,
      String(cfg.password || '')
    );
  }
  return instanciaPadrao;
}

async function connectRcon() {
  const cliente = obterInstancia();
  await cliente.conectar();
  return cliente;
}

async function executeCommand(comando) {
  const cliente = await connectRcon();
  return cliente.enviar(comando);
}

function disconnectRcon() {
  if (instanciaPadrao) {
    instanciaPadrao.desconectar();
    instanciaPadrao = null;
  }
}

module.exports = {
  ClienteRcon,
  connectRcon,
  executeCommand,
  disconnectRcon
};