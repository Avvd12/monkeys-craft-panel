'use strict';

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { embed } = require('../../util/embeds');

const CERCA = String.fromCharCode(96).repeat(3);

function bloco(texto) {
  return CERCA + '\n' + String(texto == null ? '' : texto).slice(0, 1900) + '\n' + CERCA;
}

module.exports = {
  categoria: 'Minecraft',

  dados: new SlashCommandBuilder()
    .setName('whitelist')
    .setDescription('Gerencia a whitelist do servidor')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      s.setName('add').setDescription('Adiciona um jogador')
        .addStringOption((o) => o.setName('nick').setDescription('Nick do jogador').setRequired(true))
    )
    .addSubcommand((s) =>
      s.setName('remove').setDescription('Remove um jogador')
        .addStringOption((o) => o.setName('nick').setDescription('Nick do jogador').setRequired(true))
    )
    .addSubcommand((s) =>
      s.setName('list').setDescription('Lista os jogadores na whitelist')
    ),

  async executar(interacao, ctx) {
    const sub = interacao.options.getSubcommand();

    if (!ctx.minecraft || typeof ctx.minecraft.executar !== 'function') {
      return interacao.reply({
        embeds: [embed('erro', 'Indisponivel', 'O gerenciador do Minecraft nao esta acessivel.')],
        ephemeral: true
      });
    }

    await interacao.deferReply({ ephemeral: true });

    try {
      if (sub === 'list') {
        const resposta = await ctx.minecraft.executar('whitelist list');
        return interacao.editReply({
          embeds: [embed('minecraft', 'Whitelist', bloco(resposta || 'vazia'))]
        });
      }

      const nick = interacao.options.getString('nick');
      await ctx.minecraft.executar(`whitelist ${sub} ${nick}`);

      return interacao.editReply({
        embeds: [embed('sucesso', sub === 'add' ? 'Jogador adicionado' : 'Jogador removido', `${nick} foi ${sub === 'add' ? 'adicionado a' : 'removido da'} whitelist.`)]
      });
    } catch (e) {
      return interacao.editReply({ embeds: [embed('erro', 'Falha no comando', e.message)] });
    }
  }
};