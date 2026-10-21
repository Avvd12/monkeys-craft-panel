'use strict';

const { PermissionsBitField } = require('discord.js');
const { painel } = require('./painel');

const ADMIN = PermissionsBitField.Flags.Administrator;

async function exigirAdmin(interaction) {
  if (interaction.memberPermissions?.has(ADMIN)) return true;

  const payload = {
    embeds: [painel({
      estado: 'erro',
      titulo: 'Sem permissão',
      motivo: 'Este comando exige a permissão de Administrador.'
    })],
    ephemeral: true
  };

  if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
  else await interaction.reply(payload);

  return false;
}

async function validarAlvo(interaction, user, { permitirBot = false, permitirAutor = false } = {}) {
  if (!user) return { ok: false, motivo: 'Usuário não encontrado.' };

  if (!permitirAutor && user.id === interaction.user.id) {
    return { ok: false, motivo: 'Você não pode aplicar esta ação em si mesmo.' };
  }

  if (!permitirBot && user.bot) {
    return { ok: false, motivo: 'Não é possível aplicar esta ação em um bot.' };
  }

  const member = await interaction.guild.members.fetch(user.id).catch(() => null);
  if (!member) return { ok: false, motivo: 'Esse usuário não está mais no servidor.' };

  const eu = await interaction.guild.members.fetchMe();
  if (member.id !== eu.id && member.roles.highest.position >= eu.roles.highest.position) {
    return { ok: false, motivo: 'Meu cargo é inferior ou igual ao desse membro. Suba meu cargo na hierarquia.' };
  }

  const autor = interaction.member;
  if (member.id !== autor.id && autor.roles.highest.position <= member.roles.highest.position) {
    return { ok: false, motivo: 'Você não pode agir sobre alguém com cargo igual ou superior ao seu.' };
  }

  return { ok: true, member };
}

module.exports = { exigirAdmin, validarAlvo };