'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { embed } = require('../../util/embeds');
const banco = require('../../util/banco');

const UNIDADES = { m: 60000, h: 3600000, d: 86400000 };

function interpretarTempo(texto) {
  const achado = String(texto).trim().toLowerCase().match(/^(\d+)\s*([mhd])$/);
  if (!achado) return null;

  const valor = Number(achado[1]);
  const unidade = UNIDADES[achado[2]];

  if (!valor || valor < 1) return null;

  const ms = valor * unidade;
  if (ms > 30 * 86400000) return null;

  return ms;
}

module.exports = {
  categoria: 'Utilidade',

  dados: new SlashCommandBuilder()
    .setName('lembrete')
    .setDescription('Lembretes pessoais')
    .addSubcommand((s) =>
      s.setName('criar').setDescription('Cria um lembrete')
        .addStringOption((o) => o.setName('tempo').setDescription('Ex: 30m, 2h, 1d').setRequired(true))
        .addStringOption((o) => o.setName('texto').setDescription('O que devo lembrar').setRequired(true))
    )
    .addSubcommand((s) =>
      s.setName('lista').setDescription('Mostra os seus lembretes')
    )
    .addSubcommand((s) =>
      s.setName('apagar').setDescription('Apaga um lembrete')
        .addIntegerOption((o) => o.setName('id').setDescription('Numero do lembrete').setRequired(true).setMinValue(1))
    ),

  async executar(interacao) {
    const sub = interacao.options.getSubcommand();

    if (sub === 'criar') {
      const tempo = interpretarTempo(interacao.options.getString('tempo'));

      if (!tempo) {
        return interacao.reply({
          embeds: [embed('erro', 'Tempo invalido', 'Use um numero seguido de m, h ou d. Exemplos: 30m, 2h, 1d. Maximo de 30 dias.')],
          ephemeral: true
        });
      }

      const texto = interacao.options.getString('texto');
      const quando = Date.now() + tempo;

      banco.criarLembrete(interacao.guildId, interacao.channelId, interacao.user.id, texto, quando);

      return interacao.reply({
        embeds: [embed('sucesso', 'Lembrete criado', `Vou te avisar <t:${Math.floor(quando / 1000)}:R>.\n**${texto}**`)],
        ephemeral: true
      });
    }

    if (sub === 'lista') {
      const lista = banco.listarLembretes(interacao.user.id);

      if (!lista.length) {
        return interacao.reply({
          embeds: [embed('info', 'Sem lembretes', 'Voce nao tem nenhum lembrete ativo.')],
          ephemeral: true
        });
      }

      const linhas = lista.map((l) => `**#${l.id}** · <t:${Math.floor(l.quando / 1000)}:R> · ${l.texto}`);

      return interacao.reply({
        embeds: [embed('info', 'Seus lembretes', linhas.join('\n').slice(0, 4000))],
        ephemeral: true
      });
    }

    const id = interacao.options.getInteger('id');
    const apagados = banco.apagarLembrete(interacao.user.id, id);

    if (!apagados) {
      return interacao.reply({
        embeds: [embed('erro', 'Nao encontrado', `Voce nao tem lembrete com o numero **${id}**.`)],
        ephemeral: true
      });
    }

    await interacao.reply({
      embeds: [embed('sucesso', 'Lembrete apagado', `O lembrete **#${id}** foi removido.`)],
      ephemeral: true
    });
  }
};