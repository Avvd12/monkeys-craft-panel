
const { Rcon } = require('rcon-client');
const config = require('../config.json');

let rcon = null;

async function getRconConnection() {
  if (rcon && rcon.socket && !rcon.socket.destroyed) {
    return rcon;
  }

  rcon = new Rcon({
    host: config.rcon.host,
    port: config.rcon.port,
    password: config.rcon.password,
  });

  await rcon.connect();
  console.log('✅ RCON conectado!');

  rcon.on('error', (err) => {
    console.error('⚠️ Erro RCON:', err.message);
    rcon = null;
  });

  rcon.on('end', () => {
    console.log('🔌 Conexão RCON encerrada');
    rcon = null;
  });

  return rcon;
}

async function connectRcon() {
  try {
    await getRconConnection();
    return true;
  } catch (error) {
    console.error('❌ Falha ao conectar RCON:', error.message);
    return false;
  }
}

async function executeCommand(command) {
  try {
    const connection = await getRconConnection();
    const response = await connection.send(command);
    console.log(`📤 [RCON] ${command} -> ${response}`);
    return response;
  } catch (error) {
    rcon = null; // força reconectar na próxima chamada
    throw new Error(`Falha ao executar "${command}" via RCON: ${error.message}`);
  }
}

async function disconnectRcon() {
  if (rcon) {
    await rcon.end();
    rcon = null;
  }
}

module.exports = { connectRcon, executeCommand, disconnectRcon };
