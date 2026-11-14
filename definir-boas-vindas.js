'use strict';

const banco = require('./src/bot/util/banco');

const guildId = process.argv[2];
const canalId = process.argv[3];

if (!guildId || !canalId) {
  console.log('Uso: node definir-boas-vindas.js ID_DO_SERVIDOR ID_DO_CANAL');
  process.exit(1);
}

banco.abrir();
banco.definir(guildId, 'boas_vindas_canal', canalId);
console.log('Canal de boas-vindas definido: ' + canalId);