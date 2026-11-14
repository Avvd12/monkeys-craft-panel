const fs = require('fs');

const arquivo = 'server.js';
let t = fs.readFileSync(arquivo, 'utf8');
const antes = t;
const avisos = [];

// 1. Rota de servicos: exige admin
const r1a = "app.post('/api/services/:servico/:acao', async (req, res) => {";
const r1b = "app.post('/api/services/:servico/:acao', exigirCargo('admin'), async (req, res) => {";
if (t.includes(r1a)) t = t.replace(r1a, r1b);
else if (!t.includes(r1b)) avisos.push('rota /api/services nao encontrada');

// 2. Console do Minecraft: exige admin
const r2a = "app.post('/api/console/minecraft', jsonAuth, async (req, res) => {";
const r2b = "app.post('/api/console/minecraft', jsonAuth, exigirCargo('admin'), async (req, res) => {";
if (t.includes(r2a)) t = t.replace(r2a, r2b);
else if (!t.includes(r2b)) avisos.push('rota /api/console nao encontrada');

// 3. Recolocar as rotas de backup
if (!t.includes("'/api/backups'")) {
  const marcador = '/* ---------- proxy ---------- */';

  const bloco = [
    '/* =========================================================',
    '   8c. BACKUPS',
    '   ========================================================= */',
    "const { criarRotas: criarRotasBackups } = require('./src/api/backups');",
    'const CARGOS_BACKUP = {',
    "  visualizador: ['admin', 'moderador', 'visualizador'],",
    "  moderador: ['admin', 'moderador'],",
    "  admin: ['admin']",
    '};',
    'app.use(',
    "  '/api/backups',",
    '  criarRotasBackups({',
    "    proteger: (cargo) => exigirCargo(...(CARGOS_BACKUP[cargo] || ['admin'])),",
    '    minecraft,',
    '    hub',
    '  })',
    ');',
    '',
    ''
  ].join('\n');

  if (t.includes(marcador)) {
    t = t.replace(marcador, bloco + marcador);
  } else {
    avisos.push('marcador do proxy nao encontrado');
  }
}

if (t === antes) {
  console.log('NADA MUDOU — nenhum padrao encontrado');
} else {
  fs.writeFileSync(arquivo + '.bak', antes, 'utf8');
  fs.writeFileSync(arquivo, t, 'utf8');
  console.log('OK — arquivo corrigido. Backup em server.js.bak');
}

if (avisos.length) console.log('AVISOS: ' + avisos.join(' | '));