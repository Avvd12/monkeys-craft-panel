'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { embed } = require('../../util/embeds');
const banco = require('../../util/banco');

module.exports = {
  categoria: 'Informacao',

  dados: new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Mostra a ficha de um membro')
    .addUserOption((o) =>
      o.setName('membro').setDescription('Membro a consultar').setRequired(false)
    ),

  async executar(interacao) {
    const alvo = interacao.options.getMember('membro') || interacao.member;
    const usuario = alvo.user;

    const avisos = banco.contarAvisos(interacao.guildId, usuario.id);
    const nick = banco.nickDe(interacao.guildId, usuario.id);
    const nivel = banco.nivelDe(interacao.guildId, usuario.id);

    const e = embed('info', usuario.username, null)
      .setThumbnail(usuario.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: 'Entrou em', value: alvo.joinedAt ? `<t:${Math.floor(alvo.joinedAt.getTime() / 1000)}:D>` : 'desconhecido', inline: true },
        { name: 'Conta criada', value: `<t:${Math.floor(usuario.createdTimestamp / 1000)}:D>`, inline: true },
        { name: 'Nick no jogo', value: nick || 'nao vinculado', inline: true },
        { name: 'Avisos', value: String(avisos), inline: true },
        { name: 'XP', value: String(nivel.xp), inline: true },
        { name: 'Mensagens', value: String(nivel.mensagens), inline: true }
      );

    await interacao.reply({ embeds: [e] });
  }
};