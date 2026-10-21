'use strict';

const { embed } = require('./embeds');
const banco = require('./banco');

function iniciarAgendador(client) {
  setInterval(async () => {
    let vencidos = [];

    try {
      vencidos = banco.lembretesVencidos(Date.now());
    } catch (e) {
      return;
    }

    for (const lembrete of vencidos) {
      try {
        const canal = await client.channels.fetch(lembrete.canal_id);
        if (canal && canal.isTextBased()) {
          await canal.send({
            content: `<@${lembrete.usuario_id}>`,
            embeds: [embed('info', 'Lembrete', lembrete.texto)]
          });
        }
      } catch (e) {
        // canal apagado ou sem permissao: o lembrete e descartado mesmo assim
      }

      banco.apagarLembretePorId(lembrete.id);
    }
  }, 30000).unref();
}

module.exports = { iniciarAgendador };