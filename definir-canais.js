'use strict';

const banco = require('./src/bot/util/banco');

const guildId = process.argv[2];
const tipo = process.argv[3];
const canalId = process.argv[4];

if (!guildId || !tipo || !canalId) {
  console.log('Uso: node definir-canais.js ID_DO_SERVIDOR boas_vindas|despedida ID_DO_CANAL');
  process.exit(1);
}

if (!['boas_vindas', 'despedida'].includes(tipo)) {
  console.log('Tipo invalido. Use boas_vindas ou despedida.');
  process.exit(1);
}

banco.abrir();
banco.definir(guildId, tipo + '_canal', canalId);
console.log('Canal de ' + tipo + ' definido: ' + canalId);