
/**
 * Verifica se o usuário é administrador do servidor
 */
function isAdmin(interaction) {
  return interaction.member.permissions.has('Administrator');
}

/**
 * Verifica se o usuário tem um cargo específico
 */
function hasRole(interaction, roleId) {
  return interaction.member.roles.cache.has(roleId);
}

/**
 * Verifica se o usuário tem qualquer um dos cargos
 */
function hasAnyRole(interaction, roleIds) {
  return roleIds.some(roleId => interaction.member.roles.cache.has(roleId));
}

/**
 * Responde com erro de permissão
 */
async function sendPermissionError(interaction) {
  return interaction.reply({
    content: '❌ Você não tem permissão para usar este comando!',
    ephemeral: true,
  });
}

/**
 * Middleware de verificação de admin
 */
async function checkAdmin(interaction) {
  if (!isAdmin(interaction)) {
    await sendPermissionError(interaction);
    return false;
  }
  return true;
}

/**
 * Middleware de verificação de role
 */
async function checkRole(interaction, roleId) {
  if (!hasRole(interaction, roleId)) {
    await interaction.reply({
      content: `❌ Você precisa do cargo <@&${roleId}> para usar este comando!`,
      ephemeral: true,
    });
    return false;
  }
  return true;
}

module.exports = {
  isAdmin,
  hasRole,
  hasAnyRole,
  sendPermissionError,
  checkAdmin,
  checkRole,
};
