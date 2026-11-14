'use strict';

const { PermissionFlagsBits } = require('discord.js');

const NIVEIS = { todos: 0, jogador: 1, moderador: 2, admin: 3 };

// Preencha com os IDs dos cargos do seu servidor, se usar cargo em vez de permissao.
const CARGOS = { moderador: [], admin: [] };

function nivelDoMembro(interacao) {
  const membro = interacao.member;
  if (!membro) return NIVEIS.todos;

  const perm = interacao.memberPermissions || membro.permissions;

  if (perm && perm.has(PermissionFlagsBits.Administrator)) return NIVEIS.admin;
  if (CARGOS.admin.some((id) => membro.roles.cache.has(id))) return NIVEIS.admin;

  if (perm && (
    perm.has(PermissionFlagsBits.ModerateMembers) ||
    perm.has(PermissionFlagsBits.BanMembers) ||
    perm.has(PermissionFlagsBits.KickMembers) ||
    perm.has(PermissionFlagsBits.ManageMessages)
  )) return NIVEIS.moderador;

  if (CARGOS.moderador.some((id) => membro.roles.cache.has(id))) return NIVEIS.moderador;

  return NIVEIS.jogador;
}

function podeUsar(interacao, exigido) {
  const minimo = NIVEIS[exigido] ?? NIVEIS.admin;
  return nivelDoMembro(interacao) >= minimo;
}

module.exports = { NIVEIS, CARGOS, nivelDoMembro, podeUsar };