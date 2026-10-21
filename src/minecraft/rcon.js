'use strict';

const net = require('net');

// Cliente do protocolo RCON do Minecraft (envio de comandos)
class ClienteRcon {
  constructor(host, porta, senha) {
    this.host = host;
    this.porta = porta;
    this.senha = senha;
    this.socket = null;
    this.contadorId = 0;
    this.buffer = Buffer.alloc(0);
  }

  conectar() {
    return new Promise((resolver, rejeitar) => {
      this.socket = net.createConnection({ host: this.host, port: this.porta });
      this.socket.on('connect', async () => {
        try { await this._autenticar(); resolver(); }
        catch (erro) { rejeitar(erro); }
      });
      this.socket.on('error', rejeitar);
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
      const id = ++this.contadorId;
      const corpo = Buffer.from(payload + '\x00', 'utf8');
      const comprimento = 4 + 4 + corpo.length + 1;
      const pacote = Buffer.alloc(comprimento + 4);
      pacote.writeInt32LE(comprimento, 0);
      pacote.writeInt32LE(id, 4);
      pacote.writeInt32LE(tipo, 8);
      corpo.copy(pacote, 12);
      pacote.writeInt8(0, 12 + corpo.length);

      const aoReceber = (bloco) => {
        this.buffer = Buffer.concat([this.buffer, bloco]);
        while (this.buffer.length >= 4) {
          const len = this.buffer.readInt32LE(0);
          if (this.buffer.length < len + 4) break;
          const pkt = this.buffer.subarray(4, len + 4);
          this.buffer = this.buffer.subarray(len + 4);
          const idPkt = pkt.readInt32LE(0);
          const tipoPkt = pkt.readInt32LE(4);
          const corpoStr = pkt.subarray(8, pkt.length - 2).toString('utf8');
          if (idPkt === id) {
            this.socket.removeListener('data', aoReceber);
            if (idPkt === -1) rejeitar(new Error('Falha na autenticação RCON'));
            else resolver(corpoStr);
          }
        }
      };
      this.socket.on('data', aoReceber);
      this.socket.write(pacote);
    });
  }

  desconectar() {
    if (this.socket) { this.socket.destroy(); this.socket = null; }
  }
}

module.exports = { ClienteRcon };