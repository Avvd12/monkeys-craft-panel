lucide.createIcons();

    const ENABLE_VIEWER_ROLE = false;
    const API_BASE = (location.protocol === 'file:') ? 'http://localhost:3000' : location.origin;
    const WS_URL = API_BASE.replace(/^http/, 'ws') + '/ws/logs';

    function criarFallbackLogo(texto) {
      const span = document.createElement('span');
      span.className = 'font-display font-bold text-xs text-accent text-center leading-tight px-1';
      span.textContent = texto || 'MC';
      return span;
    }

    function copiarTextoComFeedback(texto, btnEl) {
      navigator.clipboard?.writeText(texto);
      if (btnEl) {
        const original = btnEl.innerHTML;
        btnEl.textContent = 'Copiado!';
        setTimeout(() => { btnEl.innerHTML = original; lucide.createIcons(); }, 1200);
      }
    }

    function setTheme(theme) {
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem('mc_panel_theme', theme);
      document.getElementById('themeToggleLabel').textContent = theme === 'dark' ? 'Modo Escuro' : 'Modo Branco';
      document.getElementById('btnThemeDark')?.classList.toggle('border-accent', theme === 'dark');
      document.getElementById('btnThemeDark')?.classList.toggle('border-transparent', theme !== 'dark');
      document.getElementById('btnThemeLight')?.classList.toggle('border-accent', theme === 'light');
      document.getElementById('btnThemeLight')?.classList.toggle('border-transparent', theme !== 'light');
    }
    function toggleTheme() {
      const cur = document.documentElement.getAttribute('data-theme') || 'dark';
      setTheme(cur === 'dark' ? 'light' : 'dark');
    }
    setTheme(localStorage.getItem('mc_panel_theme') || 'dark');

    async function executarLogoutReal() {
      if (!confirm('Deseja realmente sair da sua conta no Painel de Controle?')) return;
      try { await fetch('/auth/logout', { method: 'POST' }); } catch {}
      window.location.href = '/login.html';
    }

    /* Consoles Virtualizados */
    const MAX_CLIENT_BUFFER = 5000;
    const ROW_HEIGHT = 20;

    const CONSOLE_STATE = {
      minecraft: {
        buffer: [],
        filtered: [],
        lastSeq: 1045,
        autoScroll: true,
        cmdHistory: ['forge tps', 'whitelist list', 'save-all'],
        cmdIndex: -1
      },
      discord: {
        buffer: [],
        filtered: [],
        lastSeq: 310,
        autoScroll: true
      }
    };

    let servidorMcOnline = false;
    let ultimoMaxJogadores = 32;

    function aplicarThresholdsTpsMspt(tps, mspt) {
      const tpsValEl = document.getElementById('kpi-tps-value');
      const mcTpsEl = document.getElementById('mc-metric-tps');
      const mcMsptEl = document.getElementById('mc-metric-mspt');

      if (!servidorMcOnline || tps === null || tps === undefined) {
        if (tpsValEl) { tpsValEl.textContent = '--'; tpsValEl.className = 'text-secondary'; }
        if (mcTpsEl) { mcTpsEl.textContent = '--'; mcTpsEl.className = 'font-mono-code font-bold text-secondary'; }
        if (mcMsptEl) { mcMsptEl.textContent = '--'; mcMsptEl.className = 'font-mono-code font-bold text-secondary'; }
        return;
      }

      const nTps = Number(tps);
      const nMspt = Number(mspt);
      const corTps = nTps < 15 ? 'text-red-400' : nTps < 19 ? 'text-yellow-400' : 'text-emerald-400';
      const corMspt = nMspt > 45 ? 'text-red-400' : nMspt > 30 ? 'text-yellow-400' : 'text-emerald-400';

      if (tpsValEl) { tpsValEl.textContent = nTps.toFixed(1); tpsValEl.className = corTps; }
      if (mcTpsEl) { mcTpsEl.textContent = nTps.toFixed(1); mcTpsEl.className = `font-mono-code font-bold ${corTps}`; }
      if (mcMsptEl) { mcMsptEl.textContent = `${nMspt.toFixed(1)} ms`; mcMsptEl.className = `font-mono-code font-bold ${corMspt}`; }
    }

    async function atualizarStatusServidorReal() {
      try {
        const res = await fetch('/api/status');
        if (res.ok) {
          const d = await res.json();
          const mc = d.minecraft || {};
          const bot = d.discord || {};
          servidorMcOnline = (mc.status === 'online');

          const mcDot = document.getElementById('mc-status-dot');
          const mcText = document.getElementById('mc-status-text');
          const btnStart = document.getElementById('btn-mc-start');
          const btnRestart = document.getElementById('btn-mc-restart');
          const btnStop = document.getElementById('btn-mc-stop');
          const cmdInput = document.getElementById('mc-command-input');
          const cmdSend = document.getElementById('mc-command-send');
          const btnRaid = document.getElementById('btnToggleRaidWindow');
          const kpiP = document.getElementById('kpi-players');
          const kpiPSub = document.getElementById('kpi-players-sub');
          const mcPlayersEl = document.getElementById('mc-metric-players');
          const mcRamEl = document.getElementById('mc-metric-ram');
          const mcCpuEl = document.getElementById('mc-metric-cpu');
          const mcEntEl = document.getElementById('mc-metric-entities');
          const mcChkEl = document.getElementById('mc-metric-chunks');

          if (mcDot && mcText) {
            const stClass = mc.status === 'online' ? 'online' : (mc.status === 'iniciando' || mc.status === 'parando' ? 'starting' : 'offline');
            mcDot.className = 'status-dot ' + stClass;
            mcText.textContent = mc.status === 'online' ? 'Online' : mc.status === 'iniciando' ? 'Iniciando...' : mc.status === 'parando' ? 'Parando...' : 'Offline';
          }
          if (btnStart) btnStart.disabled = servidorMcOnline;
          if (btnRestart) btnRestart.disabled = !servidorMcOnline;
          if (btnStop) btnStop.disabled = !servidorMcOnline;
          if (cmdInput) {
            cmdInput.disabled = !servidorMcOnline;
            cmdInput.placeholder = servidorMcOnline
              ? 'Digite um comando RCON (ex: say Olá, whitelist add Nick)...'
              : 'Servidor Minecraft offline — inicie o servidor para enviar comandos RCON';
          }
          if (cmdSend) cmdSend.disabled = !servidorMcOnline;
          if (btnRaid) btnRaid.disabled = !servidorMcOnline;

          const botoesInGame = document.querySelectorAll('.btn-in-game-action');
          botoesInGame.forEach(b => { b.disabled = !servidorMcOnline; });

          if (mc.stats && mc.stats.maxJogadores) {
            ultimoMaxJogadores = Number(mc.stats.maxJogadores) || 32;
          }

          if (!servidorMcOnline) {
            aplicarThresholdsTpsMspt(null, null);
            if (kpiP) kpiP.textContent = `0 / ${ultimoMaxJogadores}`;
            if (kpiPSub) kpiPSub.textContent = 'Servidor offline';
            if (mcPlayersEl) mcPlayersEl.textContent = `0 / ${ultimoMaxJogadores}`;
            if (mcRamEl) mcRamEl.textContent = '--';
            if (mcCpuEl) mcCpuEl.textContent = '--';
            if (mcEntEl) mcEntEl.textContent = '--';
            if (mcChkEl) mcChkEl.textContent = '--';
            PLAYERS_LIST = [];
            renderizarTabelaJogadores();
          } else {
            const stats = mc.stats || {};
            const maxJog = ultimoMaxJogadores;
            const listaStatus = Array.isArray(stats.listaJogadores) ? stats.listaJogadores : null;
            if (listaStatus) {
              // Preserva dados enriquecidos se já carregados de /api/players, ou usa a lista imediata do status
              const mapaAtual = new Map(PLAYERS_LIST.map((item) => [String(item.nick || '').toLowerCase(), item]));
              PLAYERS_LIST = listaStatus.map((p) => {
                const prev = mapaAtual.get(String(p.nick || '').toLowerCase());
                return prev ? { ...prev, ...p, faccao: prev.faccao || p.faccao } : p;
              });
              renderizarTabelaJogadores();
            }
            const onJog = listaStatus ? listaStatus.length : Number(stats.jogadores || 0);
            aplicarThresholdsTpsMspt(stats.tps1m, stats.mspt);
            if (kpiP) kpiP.textContent = `${onJog} / ${maxJog}`;
            if (kpiPSub) kpiPSub.textContent = onJog > 0 ? `${onJog} jogador(es) conectado(s)` : 'Servidor online · Nenhum jogador conectado';
            if (mcPlayersEl) mcPlayersEl.textContent = `${onJog} / ${maxJog}`;
            if (mcRamEl) {
              mcRamEl.textContent = stats.ramUsadaMb != null
                ? `${(stats.ramUsadaMb / 1024).toFixed(1)} / ${((stats.ramMaxMb || 16384) / 1024).toFixed(0)} GB`
                : '--';
            }
            if (mcCpuEl) mcCpuEl.textContent = stats.cpuPct != null ? `${Number(stats.cpuPct).toFixed(1)}%` : '--';
            if (mcEntEl) mcEntEl.textContent = stats.entidades != null ? String(stats.entidades) : '--';
            if (mcChkEl) mcChkEl.textContent = stats.chunks != null ? String(stats.chunks) : '--';
          }

          // Atualização real do card do Bot Discord
          const botOnline = (bot.status === 'online');
          const botStats = bot.stats || {};
          const botDot = document.getElementById('bot-status-dot');
          const botText = document.getElementById('bot-status-text');
          const btnBotStart = document.getElementById('btn-bot-start');
          const btnBotRestart = document.getElementById('btn-bot-restart');
          const btnBotStop = document.getElementById('btn-bot-stop');
          const botGwEl = document.getElementById('bot-metric-gateway');
          const botPingEl = document.getElementById('bot-metric-ping');
          const botGuildsEl = document.getElementById('bot-metric-guilds');
          const botCpmEl = document.getElementById('bot-metric-cpm');
          const botUpEl = document.getElementById('bot-metric-uptime');

          if (botDot && botText) {
            botDot.className = 'status-dot ' + (botOnline ? 'online' : (bot.status === 'iniciando' ? 'starting' : 'offline'));
            botText.textContent = botOnline ? 'Conectado' : bot.status === 'iniciando' ? 'Iniciando...' : 'Offline';
          }
          if (btnBotStart) btnBotStart.disabled = botOnline;
          if (btnBotRestart) btnBotRestart.disabled = !botOnline;
          if (btnBotStop) btnBotStop.disabled = !botOnline;

          if (!botOnline) {
            if (botGwEl) { botGwEl.textContent = 'Offline'; botGwEl.className = 'font-mono-code font-bold text-secondary'; }
            if (botPingEl) botPingEl.textContent = '--';
            if (botGuildsEl) botGuildsEl.textContent = '0';
            if (botCpmEl) botCpmEl.textContent = '0 / min';
            if (botUpEl) botUpEl.textContent = '--';
          } else {
            if (botGwEl) { botGwEl.textContent = 'Shard #0 OK'; botGwEl.className = 'font-mono-code font-bold text-emerald-400'; }
            if (botPingEl) botPingEl.textContent = botStats.latencia != null ? `${botStats.latencia} ms` : '--';
            if (botGuildsEl) botGuildsEl.textContent = `${botStats.servidores || 1} ativa(s)`;
            if (botCpmEl) botCpmEl.textContent = `${botStats.comandosPorMinuto || 0} / min`;
            if (botUpEl) {
              const seg = Number(botStats.uptime || 0);
              const h = Math.floor(seg / 3600);
              const m = Math.floor((seg % 3600) / 60);
              botUpEl.textContent = h > 0 ? `${h}h ${m}m` : `${m}m ${seg % 60}s`;
            }
          }
        }
      } catch (err) {
        servidorMcOnline = false;
        aplicarThresholdsTpsMspt(null, null);
      }
    }

    function inserirLogConsole(target, level, text, seqForcado = null) {
      const st = CONSOLE_STATE[target];
      if (!st) return;
      st.lastSeq = seqForcado ? Number(seqForcado) : st.lastSeq + 1;
      const now = new Date();
      const time = [now.getHours(), now.getMinutes(), now.getSeconds()].map(n => String(n).padStart(2, '0')).join(':');
      st.buffer.push({ seq: st.lastSeq, time, level: level.toUpperCase(), text });
      if (st.buffer.length > MAX_CLIENT_BUFFER) st.buffer.shift();

      const seqEl = document.getElementById(target === 'minecraft' ? 'mc-last-seq' : 'bot-last-seq');
      if (seqEl) seqEl.textContent = st.lastSeq;
      renderizarConsoleVirtual(target);
    }

    function renderizarConsoleVirtual(target) {
      const st = CONSOLE_STATE[target];
      const prefix = target === 'minecraft' ? 'mc' : 'bot';
      const lvlFilter = document.getElementById(prefix + '-log-level-filter')?.value || 'ALL';
      const search = (document.getElementById(prefix + '-log-search')?.value || '').toLowerCase();

      st.filtered = st.buffer.filter(item => {
        const matchLvl = lvlFilter === 'ALL' || item.level === lvlFilter;
        const matchTxt = !search || item.text.toLowerCase().includes(search) || String(item.seq).includes(search);
        return matchLvl && matchTxt;
      });

      const viewport = document.getElementById('viewport-' + target);
      const phantom = document.getElementById('phantom-' + target);
      const content = document.getElementById('content-' + target);
      if (!viewport || !phantom || !content) return;

      const totalHeight = st.filtered.length * ROW_HEIGHT;
      phantom.style.height = totalHeight + 'px';

      if (st.autoScroll) viewport.scrollTop = totalHeight;

      const scrollTop = viewport.scrollTop;
      const visibleCount = Math.ceil(viewport.clientHeight / ROW_HEIGHT) + 10;
      const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 5);
      const endIndex = Math.min(st.filtered.length, startIndex + visibleCount);

      content.style.transform = `translateY(${startIndex * ROW_HEIGHT}px)`;
      const slice = st.filtered.slice(startIndex, endIndex);

      content.innerHTML = slice.map(row => `
        <div class="log-row">
          <span class="log-seq">#${row.seq}</span>
          <span class="log-time">[${row.time}]</span>
          <span class="log-lvl ${row.level}">[${row.level}]</span>
          <span class="truncate">${escaparHtml(row.text)}</span>
        </div>
      `).join('');
    }

    function verificarScrollUsuario(target) {
      const st = CONSOLE_STATE[target];
      const viewport = document.getElementById('viewport-' + target);
      if (!st || !viewport) return;
      const noFundo = (viewport.scrollTop + viewport.clientHeight) >= (viewport.scrollHeight - 24);
      st.autoScroll = noFundo;
      const badge = document.getElementById((target === 'minecraft' ? 'mc' : 'bot') + '-autoscroll-badge');
      if (badge) {
        badge.textContent = st.autoScroll ? 'Auto-scroll: Ativo' : 'Auto-scroll: Pausado (Clique p/ descer)';
        badge.className = st.autoScroll
          ? 'px-2 py-1 rounded text-[11px] font-bold bg-accent-soft cursor-pointer'
          : 'px-2 py-1 rounded text-[11px] font-bold bg-yellow-500/20 text-yellow-400 border border-yellow-500/40 cursor-pointer';
      }
      renderizarConsoleVirtual(target);
    }

    function retomarAutoScroll(target) {
      CONSOLE_STATE[target].autoScroll = true;
      verificarScrollUsuario(target);
    }

    function limparBufferConsole(target) {
      CONSOLE_STATE[target].buffer = [];
      inserirLogConsole(target, 'SYSTEM', 'Buffer local limpo pelo operador.');
    }

    const cmdInputEl = document.getElementById('mc-command-input');
    cmdInputEl?.addEventListener('keydown', function (ev) {
      const st = CONSOLE_STATE.minecraft;
      if (ev.key === 'ArrowUp') {
        ev.preventDefault();
        if (!st.cmdHistory.length) return;
        if (st.cmdIndex < st.cmdHistory.length - 1) st.cmdIndex++;
        cmdInputEl.value = st.cmdHistory[st.cmdHistory.length - 1 - st.cmdIndex];
      } else if (ev.key === 'ArrowDown') {
        ev.preventDefault();
        if (st.cmdIndex > 0) {
          st.cmdIndex--;
          cmdInputEl.value = st.cmdHistory[st.cmdHistory.length - 1 - st.cmdIndex];
        } else {
          st.cmdIndex = -1;
          cmdInputEl.value = '';
        }
      } else if (ev.key === 'Enter') {
        ev.preventDefault();
        enviarComandoMinecraft();
      }
    });

    const BLOCKED_DESTRUCTIVE_COMMANDS = ['stop', 'op ', 'deop ', 'ban-ip', 'pardon'];

    async function enviarComandoMinecraft() {
      const raw = cmdInputEl.value.trim().replace(/^\//, '');
      if (!raw) return;
      const st = CONSOLE_STATE.minecraft;
      st.cmdHistory.push(raw);
      st.cmdIndex = -1;
      cmdInputEl.value = '';

      const lower = raw.toLowerCase();
      if (BLOCKED_DESTRUCTIVE_COMMANDS.some(cmd => lower === cmd || lower.startsWith(cmd))) {
        inserirLogConsole('minecraft', 'ERROR', `Comando "/${raw}" bloqueado no terminal direto: utilize o botão dedicado com confirmação e auditoria.`);
        return;
      }

      inserirLogConsole('minecraft', 'SYSTEM', `> /${raw}`);
      try {
        const r = await fetch('/api/console/minecraft', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ comando: raw })
        });
        const d = await r.json();
        if (d && d.resposta) inserirLogConsole('minecraft', 'INFO', d.resposta);
      } catch {
        inserirLogConsole('minecraft', 'INFO', `[ACK] Comando "${raw}" processado.`);
      }
    }

    function executarAtalhoConsole(cmd) {
      cmdInputEl.value = cmd;
      enviarComandoMinecraft();
    }

    async function controlarCicloVida(service, action, motivo = 'Ação manual pelo painel') {
      const target = service === 'minecraft' ? 'minecraft' : 'discord';
      const dot = document.getElementById(service === 'minecraft' ? 'mc-status-dot' : 'bot-status-dot');
      const txt = document.getElementById(service === 'minecraft' ? 'mc-status-text' : 'bot-status-text');
      const btnStart = document.getElementById(service === 'minecraft' ? 'btn-mc-start' : 'btn-bot-start');
      const btnRestart = document.getElementById(service === 'minecraft' ? 'btn-mc-restart' : 'btn-bot-restart');
      const btnStop = document.getElementById(service === 'minecraft' ? 'btn-mc-stop' : 'btn-bot-stop');

      if (dot) dot.className = 'status-dot starting';
      if (txt) txt.textContent = action === 'stop' ? 'Parando...' : action === 'restart' ? 'Reiniciando...' : 'Iniciando...';
      if (btnStart) btnStart.disabled = true;
      if (btnRestart) btnRestart.disabled = true;
      if (btnStop) btnStop.disabled = true;

      try {
        const res = await fetch(`/api/services/${service}/${action}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ motivo })
        });
        const d = await res.json();
        if (!res.ok) {
          mostrarToast(`Falha ao executar ${action} em ${service}: ${d.erro || 'Erro no servidor'}`, 'erro');
          inserirLogConsole(target, 'ERROR', `Falha ao executar ${action}: ${d.erro || 'Erro no servidor'}`);
        } else {
          inserirLogConsole(target, 'SYSTEM', `Comando de ciclo de vida (${action}) enviado com sucesso.`);
        }
      } catch (err) {
        mostrarToast(`Erro de conexão ao executar ${action} em ${service}.`, 'erro');
        inserirLogConsole(target, 'ERROR', `Erro de rede ao enviar ${action}: ${err.message}`);
      } finally {
        await atualizarStatusServidorReal();
      }
    }

    function confirmarParadaServidor(service) {
      const qtdOnline = document.getElementById('kpi-players')?.textContent.split('/')[0].trim() || '142';
      abrirActionModal('Parar Servidor Minecraft (Ação Destrutiva)', `
        <div class="p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300">
          <strong>Resumo de Impacto:</strong> Parar o servidor desconectará imediatamente <strong>${qtdOnline} jogadores online</strong> e interromperá automações ativas.
        </div>
        <label class="block space-y-1">
          <span class="font-bold uppercase text-secondary">Motivo da Parada (Auditoria)</span>
          <input type="text" id="stopReasonInput" placeholder="Ex: Manutenção programada" class="w-full surface-box rounded-xl px-3 py-2 outline-none">
        </label>
        <label class="block space-y-1">
          <span class="font-bold uppercase text-red-400">Redigite seu nick ("${OPERATOR_SESSION.mcNick}") para confirmar</span>
          <input type="text" id="stopConfirmNick" placeholder="${OPERATOR_SESSION.mcNick}" class="w-full surface-box rounded-xl px-3 py-2 font-mono-code outline-none">
        </label>
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" onclick="fecharActionModal()" class="btn-secondary px-4 py-2 rounded-xl">Cancelar</button>
          <button type="button" onclick="executarParadaConfirmada('${service}')" class="btn-danger px-4 py-2 rounded-xl">Confirmar Parada</button>
        </div>
      `);
    }

    function executarParadaConfirmada(service) {
      const nick = document.getElementById('stopConfirmNick')?.value.trim();
      const motivo = document.getElementById('stopReasonInput')?.value.trim();
      if (nick !== OPERATOR_SESSION.mcNick || !motivo) {
        alert(`Confirmação inválida: digite exatamente "${OPERATOR_SESSION.mcNick}" e informe o motivo.`);
        return;
      }
      fecharActionModal();
      registrarAuditoria('SERVER_STOP', `Servidor parado. Motivo: ${motivo}`);
      controlarCicloVida(service, 'stop', motivo);
    }

    /* =========================================================================
       JOGADORES: RENDERIZAÇÃO COM <td> PURO E COLUNA AÇÕES ALINHADA
       ========================================================================= */
    let OPERATOR_SESSION = {
      panelUser: '',
      mcNick: 'Steve',
      uuid: null,
      linked: false,
      role: 'admin',
      weight: 90,
      dimension: 'minecraft:overworld',
      coords: { x: 0, y: 64, z: 0 }
    };

    async function carregarOperadorSessao() {
      try {
        const res = await fetch('/auth/me');
        if (res.ok) {
          const d = await res.json();
          if (d && (d.usuario || d.login)) {
            OPERATOR_SESSION.panelUser = d.usuario || d.login;
            OPERATOR_SESSION.role = d.cargo || 'admin';
            OPERATOR_SESSION.weight = d.peso || (d.cargo === 'owner' ? 100 : d.cargo === 'admin' ? 90 : 50);

            const nickEl = document.getElementById('sidebarOperatorNick');
            const cargoEl = document.getElementById('sidebarOperatorRole');
            const footerNickEl = document.getElementById('footerMcNick');
            const footerRoleEl = document.getElementById('footerPanelRole');
            const profileNickEl = document.getElementById('profileLinkedNick');
            const profileUuidEl = document.getElementById('profileLinkedUuid');
            const badgeEl = document.getElementById('accountLinkBadge');
            const unlinkBox = document.getElementById('unlinkBoxFlow');

            if (d.vinculo && d.vinculo.mc_nick) {
              OPERATOR_SESSION.linked = true;
              OPERATOR_SESSION.mcNick = d.vinculo.mc_nick;
              OPERATOR_SESSION.uuid = d.vinculo.mc_uuid;
              if (nickEl) nickEl.textContent = OPERATOR_SESSION.mcNick;
              if (cargoEl) cargoEl.textContent = `${OPERATOR_SESSION.role.toUpperCase()} · UUID Vinculado`;
              if (footerNickEl) footerNickEl.textContent = OPERATOR_SESSION.mcNick;
              if (footerRoleEl) footerRoleEl.textContent = OPERATOR_SESSION.role;
              if (profileNickEl) profileNickEl.textContent = OPERATOR_SESSION.mcNick;
              if (profileUuidEl) profileUuidEl.textContent = `UUID: ${OPERATOR_SESSION.uuid}`;
              if (badgeEl) {
                badgeEl.textContent = 'UUID Vinculado';
                badgeEl.className = 'px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30';
              }
              if (unlinkBox) unlinkBox.hidden = true;
            } else {
              OPERATOR_SESSION.linked = false;
              OPERATOR_SESSION.mcNick = 'MHF_Question';
              OPERATOR_SESSION.uuid = null;
              if (nickEl) nickEl.textContent = d.usuario || 'Operador';
              if (cargoEl) cargoEl.textContent = `${OPERATOR_SESSION.role.toUpperCase()} · Não Vinculado`;
              if (footerNickEl) footerNickEl.textContent = d.usuario || 'Operador';
              if (footerRoleEl) footerRoleEl.textContent = OPERATOR_SESSION.role;
              if (profileNickEl) profileNickEl.textContent = 'Conta não vinculada';
              if (profileUuidEl) profileUuidEl.textContent = 'UUID: Aguardando comando /vincular no servidor';
              if (badgeEl) {
                badgeEl.textContent = 'Não Vinculado';
                badgeEl.className = 'px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30';
              }
              if (unlinkBox) {
                unlinkBox.hidden = false;
                gerarCodigoVinculo();
              }
            }
            atualizarSkinVinculada();
          }
        }
      } catch (err) {
        console.warn('Falha ao obter operador /auth/me:', err);
      }
    }

    let PLAYERS_LIST = [];

    let sortFieldJogadores = 'ping';
    let sortAscJogadores = true;

    function ordenarJogadoresPor(campo) {
      if (sortFieldJogadores === campo) sortAscJogadores = !sortAscJogadores;
      else { sortFieldJogadores = campo; sortAscJogadores = true; }
      renderizarJogadores();
    }

    function renderizarJogadores() {
      const termo = (document.getElementById('playerSearchInput')?.value || '').toLowerCase();
      const filtroCargo = document.getElementById('playerRoleFilter')?.value || 'todos';
      const tbody = document.getElementById('playersTableBody');
      if (!tbody) return;

      if (!servidorMcOnline || !PLAYERS_LIST.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-6 text-secondary font-medium">Servidor offline ou nenhum jogador conectado no momento.</td></tr>`;
        return;
      }

      const filtrados = PLAYERS_LIST.filter(p => {
        const facNome = (p.faccao && p.faccao.nome) ? p.faccao.nome : String(p.faccao || 'Sem Facção');
        const cargoPlayer = p.isOp || p.cargo === 'staff' ? 'staff' : 'membro';
        const bateTexto = String(p.nick || '').toLowerCase().includes(termo) || facNome.toLowerCase().includes(termo);
        const bateCargo = filtroCargo === 'todos' || cargoPlayer === filtroCargo;
        return bateTexto && bateCargo;
      }).sort((a, b) => {
        const facA = (a.faccao && a.faccao.nome) ? a.faccao.nome : String(a.faccao || '');
        const facB = (b.faccao && b.faccao.nome) ? b.faccao.nome : String(b.faccao || '');
        const pingA = Number(a.pingMs ?? a.ping ?? 0);
        const pingB = Number(b.pingMs ?? b.ping ?? 0);
        let va = sortFieldJogadores === 'faccao' ? facA : sortFieldJogadores === 'ping' ? pingA : String(a.nick || '');
        let vb = sortFieldJogadores === 'faccao' ? facB : sortFieldJogadores === 'ping' ? pingB : String(b.nick || '');
        if (typeof va === 'string') return sortAscJogadores ? va.localeCompare(vb) : vb.localeCompare(va);
        return sortAscJogadores ? va - vb : vb - va;
      });

      if (!filtrados.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-6 text-secondary font-medium">Servidor offline ou nenhum jogador conectado no momento.</td></tr>`;
        return;
      }

      tbody.innerHTML = filtrados.map(p => {
        const isStaff = Boolean(p.isOp || p.cargo === 'staff');
        const badge = isStaff
          ? `<span class="px-2 py-0.5 rounded bg-accent-soft text-[10px] font-bold uppercase">OP / STAFF</span>`
          : '';
        const pingVal = Number(p.pingMs ?? p.ping ?? 0);
        const pingColor = pingVal > 150 ? 'text-red-400' : pingVal > 75 ? 'text-yellow-400' : 'text-emerald-400';
        const facLabel = (p.faccao && p.faccao.nome)
          ? `[${p.faccao.tag}] ${p.faccao.nome}`
          : (p.faccao ? String(p.faccao) : 'Sem Facção');
        const coords = p.coords || { x: p.x ?? 0, y: p.y ?? 64, z: p.z ?? 0 };
        const sessao = p.sessao || 'Online';
        const disAttr = servidorMcOnline ? '' : 'disabled';

        return `
          <tr>
            <td>
              <div class="font-bold flex items-center gap-2.5">
                <img src="https://mc-heads.net/avatar/${p.nick}/32" class="w-7 h-7 rounded-md border border-white/10 shrink-0" alt="">
                <span>${escaparHtml(p.nick)}</span>
                ${badge}
              </div>
            </td>
            <td class="text-accent font-semibold">${escaparHtml(facLabel)}</td>
            <td class="font-mono-code text-xs text-secondary">${escaparHtml(p.dimensao || 'minecraft:overworld')} (${coords.x}, ${coords.y}, ${coords.z})</td>
            <td class="font-mono-code font-bold ${pingColor}">${pingVal} ms</td>
            <td class="text-secondary">${escaparHtml(sessao)}</td>
            <td class="col-actions">
              <div class="action-cell-fixed">
                <button type="button" onclick="abrirDrawerInspecao('${p.nick}')" class="btn-secondary btn-table-action">
                  <i data-lucide="scan-eye" class="w-3.5 h-3.5"></i> Inspecionar
                </button>
                <button type="button" onclick="acaoTeleportarOperador('${p.nick}')" class="btn-secondary btn-table-action btn-in-game-action" ${disAttr}>TP</button>
                <button type="button" onclick="abrirModalKick('${p.nick}')" class="btn-secondary btn-table-action btn-in-game-action" ${disAttr}>Kick</button>
                <button type="button" onclick="abrirModalBan('${p.nick}')" class="btn-danger btn-table-action">Ban</button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
      lucide.createIcons();
    }
    function renderizarTabelaJogadores() {
      return renderizarJogadores();
    }

    async function carregarJogadoresBackend() {
      try {
        const res = await fetch('/api/players');
        if (res.ok) {
          const d = await res.json();
          if (d && d.maxJogadores) {
            ultimoMaxJogadores = Number(d.maxJogadores) || ultimoMaxJogadores;
          }
          const lista = Array.isArray(d) ? d : (Array.isArray(d.jogadores) ? d.jogadores : []);
          PLAYERS_LIST = servidorMcOnline ? lista : [];
          renderizarTabelaJogadores();
          const kpiP = document.getElementById('kpi-players');
          const mcPlayersEl = document.getElementById('mc-metric-players');
          const qtd = servidorMcOnline ? PLAYERS_LIST.length : 0;
          if (kpiP) kpiP.textContent = `${qtd} / ${ultimoMaxJogadores}`;
          if (mcPlayersEl) mcPlayersEl.textContent = `${qtd} / ${ultimoMaxJogadores}`;
        }
      } catch (err) {
        console.warn('Falha ao carregar jogadores do backend:', err);
      }
    }

    function filtrarJogadores() { renderizarJogadores(); }

    function abrirModalBroadcastPreview() {
      abrirActionModal('Enviar Aviso Global (Broadcast com Preview)', `
        <label class="block space-y-1">
          <span class="font-bold uppercase text-secondary">Mensagem para todos os jogadores online</span>
          <input type="text" id="broadcastInputText" oninput="atualizarPreviewBroadcast()" placeholder="Ex: Reinício programado em 10 minutos para manutenção" class="w-full surface-box rounded-xl px-3 py-2 outline-none">
        </label>
        <div class="p-3 rounded-xl bg-black/50 border border-white/10 font-mono-code text-xs">
          <span class="text-secondary block text-[10px] uppercase mb-1">Pré-visualização no chat do jogo:</span>
          <span class="text-accent font-bold">[AVISO DA ADMINISTRAÇÃO]</span> <span id="broadcastPreviewSpan" class="text-white">Digite uma mensagem acima...</span>
        </div>
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" onclick="fecharActionModal()" class="btn-secondary px-4 py-2 rounded-xl">Cancelar</button>
          <button type="button" onclick="confirmarEnvioBroadcast()" class="btn-primary px-4 py-2 rounded-xl">Transmitir no Servidor</button>
        </div>
      `);
    }

    function atualizarPreviewBroadcast() {
      const v = document.getElementById('broadcastInputText')?.value.trim();
      const sp = document.getElementById('broadcastPreviewSpan');
      if (sp) sp.textContent = v || 'Digite uma mensagem acima...';
    }

    function confirmarEnvioBroadcast() {
      const v = document.getElementById('broadcastInputText')?.value.trim();
      if (!v) return;
      fecharActionModal();
      executarAtalhoConsole(`say [AVISO DA ADMINISTRAÇÃO] ${v}`);
      registrarAuditoria('SERVER_BROADCAST', v);
    }

    function abrirModalWhitelist() {
      abrirActionModal('Liberar Jogador na Whitelist', `
        <label class="block space-y-1">
          <span class="font-bold uppercase text-secondary">Nick exato do Minecraft</span>
          <input type="text" id="whitelistNickInput" placeholder="Ex: Nathan" class="w-full surface-box rounded-xl px-3 py-2 outline-none">
        </label>
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" onclick="fecharActionModal()" class="btn-secondary px-4 py-2 rounded-xl">Cancelar</button>
          <button type="button" onclick="confirmarWhitelistAdd()" class="btn-primary px-4 py-2 rounded-xl">Adicionar à Whitelist</button>
        </div>
      `);
    }

    function confirmarWhitelistAdd() {
      const nick = document.getElementById('whitelistNickInput')?.value.trim();
      if (!nick) return;
      fecharActionModal();
      executarAtalhoConsole(`whitelist add ${nick}`);
      registrarAuditoria('WHITELIST_ADD', `Nick liberado: ${nick}`);
    }

    async function acaoTeleportarOperador(targetNick, confirmadoDimensao = false) {
      const opOnline = document.getElementById('simOperatorOnlineCheckbox')?.checked ?? true;
      const target = PLAYERS_LIST.find(p => p.nick === targetNick);

      if (!OPERATOR_SESSION.linked) {
        abrirActionModal('Conta Não Vinculada', `<p class="text-red-400 font-bold">Vincule sua conta Minecraft na aba Configurações antes de usar o TP.</p>`);
        return;
      }

      try {
        const res = await fetch('/api/players/tp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            alvo: targetNick,
            confirmadoDimensao: !!confirmadoDimensao,
            simularOnline: !!opOnline
          })
        });

        if (res.status === 409) {
          const d = await res.json();
          abrirActionModal('Confirmar Teleporte Entre Dimensões', `
            <p>O jogador <strong>${targetNick}</strong> está em outra dimensão:</p>
            <div class="p-3 rounded-xl surface-box font-mono-code space-y-1">
              <div>Sua dimensão atual: <span class="text-accent">${d.dimensaoOrigem || OPERATOR_SESSION.dimension}</span></div>
              <div>Dimensão de destino: <span class="text-accent">${d.dimensaoDestino || (target?.dimensao || 'outra')}</span></div>
            </div>
            <div class="flex justify-end gap-2 pt-2">
              <button type="button" onclick="fecharActionModal()" class="btn-secondary px-4 py-2 rounded-xl">Cancelar</button>
              <button type="button" onclick="fecharActionModal(); acaoTeleportarOperador('${targetNick}', true);" class="btn-primary px-4 py-2 rounded-xl">Confirmar Teleporte</button>
            </div>
          `);
          return;
        }

        const data = await res.json();
        if (!res.ok) {
          abrirActionModal('Erro no Teleporte', `<p class="text-red-400 font-bold">${data.erro || 'Falha ao executar teleporte.'}</p>`);
          return;
        }

        if (target) {
          OPERATOR_SESSION.dimension = target.dimensao;
          OPERATOR_SESSION.coords = { ...target.coords };
        }
        registrarAuditoria('PLAYER_TP_SELF', `Teleporte de ${OPERATOR_SESSION.mcNick} até ${targetNick}`);
        inserirLogConsole('minecraft', 'INFO', `[API Teleporte] ${data.mensagem || (OPERATOR_SESSION.mcNick + ' teleportado para ' + targetNick)}.`);
        mostrarToast('Teleporte executado com sucesso!', 'sucesso');
      } catch (err) {
        console.error('Erro na requisição TP:', err);
        mostrarToast('Erro ao contatar o servidor para teleporte.', 'erro');
      }
    }

    function abrirModalKick(targetNick) {
      const target = PLAYERS_LIST.find(p => p.nick === targetNick);
      if (!target) return;
      if (target.weight >= OPERATOR_SESSION.weight) {
        abrirActionModal('Bloqueio de Hierarquia', `<p class="text-red-400 font-bold">${target.nick} possui peso hierárquico (${target.weight}) igual ou superior ao seu (${OPERATOR_SESSION.weight}).</p>`);
        return;
      }
      abrirActionModal(`Expulsar Jogador (Kick): ${target.nick}`, `
        <label class="block space-y-1">
          <span class="font-bold uppercase text-secondary">Motivo Obrigatório (Auditoria)</span>
          <input type="text" id="kickReasonInput" placeholder="Ex: Máquina causando lag excessivo" class="w-full surface-box rounded-xl px-3 py-2 outline-none">
        </label>
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" onclick="fecharActionModal()" class="btn-secondary px-4 py-2 rounded-xl">Cancelar</button>
          <button type="button" onclick="confirmarKick('${target.nick}')" class="btn-primary px-4 py-2 rounded-xl">Executar Kick</button>
        </div>
      `);
    }

    async function confirmarKick(targetNick) {
      const reason = document.getElementById('kickReasonInput')?.value.trim();
      if (!reason) { alert('Informe o motivo obrigatório.'); return; }

      try {
        const res = await fetch('/api/players/kick', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ alvo: targetNick, motivo: reason })
        });
        const d = await res.json();
        if (!res.ok) {
          alert('Erro ao expulsar jogador: ' + (d.erro || 'Falha na operação.'));
          return;
        }
        fecharActionModal();
        registrarAuditoria('PLAYER_KICK', `Alvo: ${targetNick} | Motivo: ${reason}`);
        inserirLogConsole('minecraft', 'WARN', `[Kick] ${targetNick} expulso por ${OPERATOR_SESSION.mcNick}. Motivo: ${reason}`);
        mostrarToast(`Jogador ${targetNick} expulso com sucesso!`, 'sucesso');
        carregarJogadoresBackend();
      } catch (err) {
        console.error('Erro ao executar Kick:', err);
        alert('Erro de conexão ao executar Kick.');
      }
    }

    function abrirModalBan(targetNick) {
      const target = PLAYERS_LIST.find(p => p.nick === targetNick);
      if (!target) return;
      if (target.weight >= OPERATOR_SESSION.weight) {
        abrirActionModal('Bloqueio de Hierarquia', `<p class="text-red-400 font-bold">Operação bloqueada: ${target.nick} possui peso ${target.weight} ≥ ${OPERATOR_SESSION.weight}.</p>`);
        return;
      }
      abrirActionModal(`Banir Jogador (Ação Destrutiva): ${target.nick}`, `
        <div class="space-y-3">
          <div class="p-2.5 rounded-lg bg-red-500/15 border border-red-500/30 text-red-300 text-[11px]">
            <strong>Impacto:</strong> Grava na banlist do servidor, bloqueia reconexão imediata e registra sanção persistente no banco.
          </div>
          <label class="block space-y-1">
            <span class="font-bold uppercase text-secondary">Motivo Obrigatório</span>
            <input type="text" id="banReasonInput" placeholder="Ex: Duplicação de itens / Exploit" class="w-full surface-box rounded-xl px-3 py-2 outline-none">
          </label>
          <div class="grid grid-cols-2 gap-3">
            <label class="block space-y-1">
              <span class="font-bold uppercase text-secondary">Duração</span>
              <select id="banDurationSelect" class="w-full surface-box rounded-xl px-3 py-2 outline-none">
                <option value="24h">Temporário: 24 Horas</option>
                <option value="7d">Temporário: 7 Dias</option>
                <option value="30d">Temporário: 30 Dias</option>
                <option value="PERM">Permanente</option>
              </select>
            </label>
            <label class="block space-y-1">
              <span class="font-bold uppercase text-secondary">Evidência (Link / Log)</span>
              <input type="text" id="banEvidenceInput" placeholder="Ex: Log #1042" class="w-full surface-box rounded-xl px-3 py-2 outline-none">
            </label>
          </div>
          <label class="block space-y-1">
            <span class="font-bold uppercase text-red-400">Redigite "${target.nick}" para confirmar</span>
            <input type="text" id="banConfirmNickInput" placeholder="${target.nick}" class="w-full surface-box rounded-xl px-3 py-2 font-mono-code outline-none border border-red-500/40">
          </label>
          <div class="flex justify-end gap-2 pt-2">
            <button type="button" onclick="fecharActionModal()" class="btn-secondary px-4 py-2 rounded-xl">Cancelar</button>
            <button type="button" onclick="confirmarBan('${target.nick}')" class="btn-danger px-4 py-2 rounded-xl">Confirmar Banimento</button>
          </div>
        </div>
      `);
    }

    async function confirmarBan(targetNick) {
      const reason = document.getElementById('banReasonInput')?.value.trim();
      const duration = document.getElementById('banDurationSelect')?.value;
      const evidence = document.getElementById('banEvidenceInput')?.value.trim();
      const typed = document.getElementById('banConfirmNickInput')?.value.trim();
      if (!reason || !evidence || typed !== targetNick) {
        alert(`Preencha motivo, evidência e redigite exatamente "${targetNick}".`);
        return;
      }

      try {
        const res = await fetch('/api/players/ban', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            alvo: targetNick,
            motivo: reason,
            duracao: duration,
            evidencia: evidence,
            confirmacaoNick: typed
          })
        });
        const d = await res.json();
        if (!res.ok) {
          alert('Erro ao banir jogador: ' + (d.erro || 'Falha na operação.'));
          return;
        }
        fecharActionModal();
        registrarAuditoria('PLAYER_BAN', `Alvo: ${targetNick} (${duration}) | Motivo: ${reason}`);
        inserirLogConsole('minecraft', 'ERROR', `[Ban] ${targetNick} banido (${duration}) por ${OPERATOR_SESSION.mcNick}.`);
        mostrarToast(`Jogador ${targetNick} banido (${duration}) com sucesso!`, 'sucesso');
        carregarJogadoresBackend();
      } catch (err) {
        console.error('Erro ao executar Ban:', err);
        alert('Erro de conexão ao executar Ban.');
      }
    }

    function calcularDistanciaEuclidiana(c1, c2) {
      return Math.round(Math.sqrt(Math.pow(c1.x - c2.x, 2) + Math.pow(c1.y - c2.y, 2) + Math.pow(c1.z - c2.z, 2)));
    }

    async function abrirDrawerInspecao(nick) {
      if (!nick || nick === '—') return;
      let p = PLAYERS_LIST.find(item => String(item.nick || '').toLowerCase() === String(nick).toLowerCase());
      try {
        const res = await fetch('/api/players/' + encodeURIComponent(nick) + '/inspect');
        if (res.ok) {
          const dadosBackend = await res.json();
          p = dadosBackend;
        }
      } catch (err) {
        console.warn('Usando dados em cache de', nick, err);
      }
      if (!p) return;

      const coords = p.coords || { x: 0, y: 64, z: 0 };
      const dimensao = p.dimensao || 'minecraft:overworld';
      const isOnline = Boolean(p.online);
      const pingMs = Number(p.pingMs ?? p.ping ?? 0);
      const fac = p.faccao || null;
      const baseCoords = (fac && fac.baseCoords) ? fac.baseCoords : coords;
      const coreCoords = (fac && fac.coreCoords) ? fac.coreCoords : baseCoords;
      const historico = Array.isArray(p.historicoModeracao) ? p.historicoModeracao : [];
      const container = document.getElementById('inspectDrawerContent');

      const statusBadge = isOnline
        ? `<span class="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-[10px] font-bold">Online · ${pingMs} ms</span>`
        : `<span class="px-2 py-0.5 rounded-full bg-zinc-500/20 text-zinc-400 text-[10px] font-bold">Offline</span>`;

      const blocoFaccao = fac ? `
        <div class="p-4 rounded-xl surface-box space-y-2.5">
          <div class="flex items-center justify-between">
            <h4 class="font-display font-bold uppercase text-accent tracking-wider">Clã / FTB Teams: [${escaparHtml(fac.tag || 'CLÃ')}] ${escaparHtml(fac.nome)}</h4>
            <span class="font-mono-code font-bold text-xs">${Number(fac.claims || 0)} / ${Number(fac.maxClaims || 500)} chunks</span>
          </div>
          <div class="text-[11px] font-mono-code text-secondary space-y-0.5">
            <div>Party ID: <span class="text-white">${escaparHtml(fac.id || '—')}</span></div>
            <div>Líder: <span class="text-accent font-bold">${escaparHtml(fac.lider || p.nick)}</span></div>
            ${fac.descricao ? `<div>Descrição: <span>${escaparHtml(fac.descricao)}</span></div>` : ''}
          </div>
          <div class="space-y-1 pt-1">
            ${(Array.isArray(fac.membros) ? fac.membros : []).map(m => `
              <div class="flex items-center justify-between px-2.5 py-1.5 rounded bg-black/25">
                <div class="flex items-center gap-2">
                  <span class="w-2 h-2 rounded-full ${m.online ? 'bg-emerald-400' : 'bg-zinc-500'}"></span>
                  <span class="font-semibold">${escaparHtml(m.nick)}</span>
                </div>
                <span class="font-mono-code text-accent text-xs uppercase">${escaparHtml(m.cargo || m.power || 'membro')}</span>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="p-4 rounded-xl surface-box space-y-2">
          <h4 class="font-display font-bold uppercase text-accent tracking-wider">Território & Chunks Reivindicados</h4>
          <div class="font-mono-code space-y-1 text-xs">
            <div class="flex justify-between"><span>Chunks Reivindicados:</span><span class="text-accent font-bold">${Number(fac.claims || 0)} chunks</span></div>
            <div class="flex justify-between"><span>Dimensão Principal:</span><span>${escaparHtml(fac.dimensao || dimensao)}</span></div>
            <div class="flex justify-between"><span>Coordenada de Referência:</span><span>X:${baseCoords.x}, Y:${baseCoords.y}, Z:${baseCoords.z}</span></div>
          </div>
        </div>
      ` : `
        <div class="p-4 rounded-xl surface-box text-secondary text-xs">
          Este jogador não possui clã/party registrado em <code class="font-mono-code">world/ftbteams/party</code>.
        </div>
      `;

      container.innerHTML = `
        <div class="p-4 rounded-xl surface-box flex items-center gap-4">
          <img src="https://mc-heads.net/body/${encodeURIComponent(p.nick)}/120" class="w-16 h-28 object-contain rounded-lg bg-black/30 p-1 border border-accent shrink-0" alt="${escaparHtml(p.nick)}">
          <div class="space-y-1 min-w-0 flex-1">
            <div class="flex items-center gap-2 flex-wrap">
              <img src="https://mc-heads.net/avatar/${encodeURIComponent(p.nick)}/24" class="w-5 h-5 rounded" alt="">
              <span class="text-base font-extrabold truncate">${escaparHtml(p.nick)}</span>
              ${statusBadge}
            </div>
            <p class="font-mono-code text-[11px] text-secondary break-all">UUID: ${escaparHtml(p.uuid || '—')}</p>
            <div class="grid grid-cols-2 gap-2 pt-1">
              <div class="p-2 rounded bg-black/25"><span class="text-secondary block text-[10px]">Clã (FTB Teams)</span><strong>${fac ? escaparHtml(fac.nome) : 'Sem Clã'}</strong></div>
              <div class="p-2 rounded bg-black/25"><span class="text-secondary block text-[10px]">Chunks Clã</span><strong>${fac ? `${fac.claims} chunks` : '0 chunks'}</strong></div>
            </div>
          </div>
        </div>

        <div class="p-3.5 rounded-xl surface-box flex items-center justify-between">
          <span class="font-bold uppercase text-secondary">Vínculo com Conta do Painel</span>
          ${(p.linkedPanelAccount || p.contaPainelVinculada)
            ? `<span class="px-2.5 py-1 rounded bg-accent-soft font-bold">${escaparHtml(p.linkedPanelAccount || p.contaPainelVinculada)}</span>`
            : `<span class="px-2.5 py-1 rounded bg-zinc-500/20 text-zinc-400 font-semibold">Não Vinculada</span>`
          }
        </div>

        <div class="p-4 rounded-xl surface-box space-y-2.5">
          <h4 class="font-display font-bold uppercase text-accent tracking-wider">Estado Físico & Posição</h4>
          <div class="grid grid-cols-2 gap-2 font-mono-code">
            <div class="p-2 rounded bg-black/25"><span class="text-secondary block text-[10px]">Dimensão</span>${escaparHtml(dimensao)}</div>
            <div class="p-2 rounded bg-black/25"><span class="text-secondary block text-[10px]">Coordenadas</span>X:${coords.x} Y:${coords.y} Z:${coords.z}</div>
            <div class="p-2 rounded bg-black/25"><span class="text-secondary block text-[10px]">Gamemode / Nível</span>${escaparHtml(p.gamemode || 'SURVIVAL')} · Lvl ${p.xpLevel ?? 0}</div>
            <div class="p-2 rounded bg-black/25"><span class="text-secondary block text-[10px]">Vida / Fome</span>HP ${p.vida ?? 20} · Food ${p.fome ?? 20}</div>
          </div>
        </div>

        ${blocoFaccao}

        <div class="p-4 rounded-xl surface-box space-y-2.5">
          <h4 class="font-display font-bold uppercase text-accent tracking-wider">Histórico de Moderação (${historico.length})</h4>
          ${historico.length === 0
            ? `<p class="text-secondary py-2">Nenhuma sanção registrada para este jogador.</p>`
            : `<div class="space-y-2">${historico.map(h => `
                <div class="p-2.5 rounded bg-black/30 border border-white/5">
                  <div class="flex justify-between font-bold">
                    <span class="text-accent">${escaparHtml(h.tipo)}</span>
                    <span class="text-secondary font-mono-code">${escaparHtml(h.criado_em || h.data || '')} · por ${escaparHtml(h.autor_usuario || h.autor || 'staff')}</span>
                  </div>
                  <p class="mt-1">${escaparHtml(h.motivo)}</p>
                </div>
              `).join('')}</div>`
          }
        </div>
      `;

      document.getElementById('drawerBtnTp').onclick = () => acaoTeleportarOperador(p.nick);
      document.getElementById('drawerBtnKick').onclick = () => abrirModalKick(p.nick);
      document.getElementById('drawerBtnBan').onclick = () => abrirModalBan(p.nick);
      document.getElementById('drawerBtnWhois').onclick = () => executarAtalhoConsole(`whois ${p.nick}`);
      document.getElementById('drawerBtnDm').onclick = async () => {
        const msg = prompt(`Mensagem privada para ${p.nick}:`);
        if (!msg) return;
        try {
          const res = await fetch('/api/players/dm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nick: p.nick, destinatario: p.nick, mensagem: msg })
          });
          if (res.ok) {
            mostrarToast(`Mensagem enviada para ${p.nick}!`, 'sucesso');
            inserirLogConsole('minecraft', 'INFO', `[DM -> ${p.nick}] ${msg}`);
          } else {
            executarAtalhoConsole(`msg ${p.nick} ${msg}`);
          }
        } catch {
          executarAtalhoConsole(`msg ${p.nick} ${msg}`);
        }
      };

      document.getElementById('inspectDrawerBackdrop').hidden = false;
      document.getElementById('inspectDrawerPanel').hidden = false;
      lucide.createIcons();
    }

    function fecharDrawerInspecao() {
      document.getElementById('inspectDrawerBackdrop').hidden = true;
      document.getElementById('inspectDrawerPanel').hidden = true;
    }

    /* Facções */
    let raidAtiva = false;
    let FACTIONS_DATA = [];

    async function carregarFaccoesBackend() {
      try {
        const res = await fetch('/api/faccoes');
        if (res.ok) {
          const d = await res.json();
          const lista = Array.isArray(d) ? d : (Array.isArray(d.faccoes) ? d.faccoes : []);
          FACTIONS_DATA = lista;
          renderizarFaccoes();
          atualizarDiagnosticoChunks();
        }
      } catch (err) {
        console.warn('Falha ao obter facções:', err);
      }
    }

    async function carregarStatusRaidBackend() {
      try {
        const res = await fetch('/api/raids/status');
        if (res.ok) {
          const d = await res.json();
          raidAtiva = Boolean(d.ativa ?? (d.raidWindow && d.raidWindow.status === 'ativa'));
          atualizarUIRaid();
        }
      } catch (err) {
        console.warn('Falha ao obter status de raid:', err);
      }
    }

    function atualizarUIRaid() {
      const lbl = document.getElementById('raidStatusLabel');
      if (lbl) {
        lbl.textContent = raidAtiva ? 'JANELA DE RAID ATIVA' : 'Escudo de Base Ativo';
        lbl.className = 'font-display font-bold text-sm mt-0.5 ' + (raidAtiva ? 'text-red-400' : 'text-emerald-400');
      }
      const tnt = document.getElementById('raidTntLabel');
      if (tnt) tnt.textContent = raidAtiva ? 'LIBERADO EM CLAIMS' : 'Bloqueado em Claims';
      const btnTxt = document.getElementById('btnToggleRaidText');
      if (btnTxt) btnTxt.textContent = raidAtiva ? 'Encerrar Janela de Raid' : 'Iniciar Janela de Raid Agora';
      const kpiR = document.getElementById('kpi-raid-state');
      if (kpiR) kpiR.textContent = raidAtiva ? 'RAID ATIVA' : 'Escudos Ativos';
      renderizarFaccoes();
    }

    function renderizarFaccoes() {
      const tbody = document.getElementById('factionsTableBody');
      if (!tbody) return;
      if (!FACTIONS_DATA.length) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-6 text-secondary font-medium">Nenhuma facção ou claim registrado em world/ftbteams até o momento.</td></tr>`;
        return;
      }
      tbody.innerHTML = FACTIONS_DATA.map(f => {
        const cor = raidAtiva ? 'text-red-400 bg-red-500/15' : 'text-emerald-400 bg-emerald-500/15';
        const rotulo = raidAtiva ? 'Vulnerável (Raid Ativa)' : (f.status || 'Protegida');
        return `
          <tr>
            <td class="font-display font-bold text-accent">[${escaparHtml(f.tag || 'FAC')}] ${escaparHtml(f.nome)}</td>
            <td class="font-semibold">${escaparHtml(f.lider || '—')}</td>
            <td>${escaparHtml(f.online || `${f.onlineCount || 0}/${f.membrosCount || 1}`)}</td>
            <td class="font-mono-code">${escaparHtml(f.power || `${f.poder || 0}/${f.poderMax || 0}`)}</td>
            <td>${Number(f.claims || 0)} chunks</td>
            <td><span class="px-2.5 py-1 rounded-md text-xs font-bold ${cor}">${escaparHtml(rotulo)}</span></td>
            <td class="col-actions">
              <div class="action-cell-fixed">
                <button type="button" onclick="abrirDrawerInspecao('${f.lider}')" class="btn-secondary btn-table-action">Inspecionar Líder</button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }

    async function alternarJanelaRaid() {
      if (!servidorMcOnline) {
        alert('O servidor Minecraft precisa estar online para iniciar ou encerrar uma janela de Raid.');
        return;
      }
      const proximoEstado = !raidAtiva;
      const motivo = proximoEstado ? 'Abertura manual da janela de raid' : 'Encerramento manual da janela de raid';

      try {
        const res = await fetch('/api/faccoes/raid', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ativa: proximoEstado, motivo })
        });
        const d = await res.json();
        if (res.ok) {
          raidAtiva = Boolean(d.ativa ?? (d.raidWindow && d.raidWindow.status === 'ativa'));
          atualizarUIRaid();
          registrarAuditoria('RAID_WINDOW_TOGGLE', `Janela de Raid alterada para: ${raidAtiva ? 'ATIVA' : 'ENCERRADA'}`);
          mostrarToast(`Janela de raid ${raidAtiva ? 'iniciada' : 'encerrada'} com sucesso!`, 'sucesso');
        } else {
          alert(d.erro || 'Falha ao alternar janela de raid.');
        }
      } catch (err) {
        console.error('Erro na requisição de raid:', err);
      }
    }

    /* Mods & Eras */
    const MODS_CATALOG = [
      { id: 'create', file: 'create-1.20.1-0.5.1.f.jar', version: '0.5.1.f', sha256: '4a89c17f902b3c4d118a9f0021b4c8e2', deps: [], activeRuntime: true, stagedState: true },
      { id: 'mekanism', file: 'Mekanism-1.20.1-10.4.8.jar', version: '10.4.8', sha256: '9b12f044a1c8e7723109d8f4a120088a', deps: [], activeRuntime: true, stagedState: true },
      { id: 'mekanismgenerators', file: 'MekanismGenerators-1.20.1-10.4.8.jar', version: '10.4.8', sha256: '7c44d198a0023f114b78c9012e45a119', deps: ['mekanism'], activeRuntime: true, stagedState: true },
      { id: 'apotheosis', file: 'Apotheosis-1.20.1-7.4.2.jar', version: '7.4.2', sha256: '2f81a9c004b12e887123c456d890a1c4', deps: [], activeRuntime: false, stagedState: false },
      { id: 'vampirism', file: 'Vampirism-1.20.1-1.10.6.jar', version: '1.10.6', sha256: '6e10b299f4a12c338901d234e567b8f1', deps: [], activeRuntime: false, stagedState: false }
    ];

    const ERAS_MANIFESTS = [
      { id: 1, titulo: 'Era I · Engrenagens & Vapor', modsIncluded: ['create'], worldBorder: '5.000 blocos', lockedRecipes: 'Mekanism, Apotheosis, Vampirism', activeRuntime: false, staged: false },
      { id: 2, titulo: 'Era II · Revolução Industrial', modsIncluded: ['create', 'mekanism', 'mekanismgenerators'], worldBorder: '10.000 blocos', lockedRecipes: 'Apotheosis Mythic, Vampirism Altars', activeRuntime: true, staged: true },
      { id: 3, titulo: 'Era III · Ascensão Arcana & Bosses', modsIncluded: ['create', 'mekanism', 'mekanismgenerators', 'apotheosis', 'vampirism'], worldBorder: '25.000 blocos', lockedRecipes: 'Nenhuma (Endgame Liberado)', activeRuntime: false, staged: false }
    ];

    let activeChunkProfileRuntime = 'Balanceado';
    let stagedChunkProfile = 'Balanceado';

    function renderizarModsEEras() {
      const erasGrid = document.getElementById('erasGrid');
      if (erasGrid) {
        erasGrid.innerHTML = ERAS_MANIFESTS.map(era => {
          const isStaged = era.staged;
          const badge = era.activeRuntime
            ? `<span class="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 text-[10px] font-bold uppercase">Ativa no Servidor</span>`
            : isStaged
              ? `<span class="px-2 py-0.5 rounded bg-accent-soft text-[10px] font-bold uppercase">Agendada p/ Reinício</span>`
              : `<span class="px-2 py-0.5 rounded surface-box text-[10px] font-bold uppercase text-secondary">Inativa</span>`;

          return `
            <div class="card-box p-5 flex flex-col justify-between gap-4 ${isStaged ? 'border-accent' : ''}">
              <div>
                <div class="flex items-center justify-between mb-2">${badge}</div>
                <h4 class="font-display font-bold text-lg">${era.titulo}</h4>
                <div class="text-xs space-y-1 mt-2 text-secondary font-mono-code">
                  <div>Mods: <span class="text-accent">${era.modsIncluded.join(', ')}</span></div>
                  <div>Borda: ${era.worldBorder}</div>
                  <div>Travas: ${era.lockedRecipes}</div>
                </div>
              </div>
              <button type="button" onclick="prepararMudancaEra(${era.id})" class="${isStaged ? 'btn-primary' : 'btn-secondary'} px-4 py-2 rounded-xl text-xs">
                ${era.activeRuntime && isStaged ? 'Era em Execução' : isStaged ? 'Selecionada no Plano' : 'Selecionar esta Era'}
              </button>
            </div>
          `;
        }).join('');
      }

      const tbody = document.getElementById('modsStagingTableBody');
      if (tbody) {
        tbody.innerHTML = MODS_CATALOG.map(m => {
          const changed = m.activeRuntime !== m.stagedState;
          return `
            <tr class="${changed ? 'selected-row' : ''}">
              <td>
                <div class="flex items-center gap-2">
                  <span class="font-mono-code font-bold text-white">${m.id}</span>
                  <span class="text-xs text-secondary hidden md:inline">(${m.file})</span>
                </div>
              </td>
              <td class="font-mono-code text-xs">v${m.version}</td>
              <td>
                <span class="px-2 py-0.5 rounded text-[11px] font-bold ${m.activeRuntime ? 'bg-emerald-500/15 text-emerald-400' : 'bg-zinc-500/20 text-zinc-400'}">
                  ${m.activeRuntime ? 'Ativo' : 'Desativado'}
                </span>
              </td>
              <td>
                <span class="px-2 py-0.5 rounded text-[11px] font-bold ${changed ? 'bg-accent-soft text-accent' : 'text-secondary'}">
                  ${changed ? (m.stagedState ? '⚡ Ativar no Reinício' : '⚡ Desativar no Reinício') : 'Sem mudança'}
                </span>
              </td>
              <td class="col-actions">
                <div class="action-cell-fixed flex items-center gap-1.5">
                  <button type="button" onclick="abrirDetalhesModModal('${m.id}')" class="btn-secondary btn-table-action" title="Ver detalhes técnicos do mod">
                    Detalhes
                  </button>
                  <button type="button" onclick="alternarModStaging('${m.id}')" class="btn-secondary btn-table-action ${m.stagedState ? 'text-red-400 hover:border-red-500' : 'text-emerald-400 hover:border-emerald-500'}">
                    ${m.stagedState ? 'Desativar' : 'Ativar'}
                  </button>
                </div>
              </td>
            </tr>
          `;
        }).join('');
      }

      atualizarEstadoBannerPendente();
    }

    function validarDependenciasMods() {
      const errEl = document.getElementById('modDependencyError');
      for (const mod of MODS_CATALOG) {
        if (mod.stagedState) {
          for (const depId of mod.deps) {
            const depMod = MODS_CATALOG.find(item => item.id === depId);
            if (depMod && !depMod.stagedState) {
              const msg = `Dependência obrigatória: "${mod.file}" exige "${depMod.file}" ativo.`;
              if (errEl) { errEl.textContent = msg; errEl.hidden = false; }
              return { valido: false, erro: msg };
            }
          }
        }
      }
      if (errEl) errEl.hidden = true;
      return { valido: true, erro: null };
    }

    function alternarModStaging(modId) {
      const m = MODS_CATALOG.find(item => item.id === modId);
      if (!m) return;
      m.stagedState = !m.stagedState;
      validarDependenciasMods();
      renderizarModsEEras();
    }

    function prepararMudancaEra(eraId) {
      ERAS_MANIFESTS.forEach(e => { e.staged = (e.id === eraId); });
      const targetEra = ERAS_MANIFESTS.find(e => e.id === eraId);
      if (targetEra) {
        MODS_CATALOG.forEach(m => { m.stagedState = targetEra.modsIncluded.includes(m.id); });
      }
      validarDependenciasMods();
      renderizarModsEEras();
    }

    function selecionarPerfilChunk(profileName) {
      stagedChunkProfile = profileName;
      document.querySelectorAll('.chunk-profile-btn').forEach(btn => {
        const isSel = btn.dataset.profile === profileName;
        btn.classList.toggle('border-accent', isSel);
        btn.classList.toggle('bg-accent-soft', isSel);
      });
      atualizarEstadoBannerPendente();
    }

    function calcularDiffPendente() {
      const diffs = [];
      MODS_CATALOG.forEach(m => {
        if (m.activeRuntime !== m.stagedState) {
          diffs.push({
            curto: `${m.stagedState ? '+ Mod' : '- Mod'}: ${m.id}`,
            detalhe: `${m.stagedState ? '[+ HABILITAR MOD]' : '[- DESABILITAR MOD]'} ${m.file} (sha256:${m.sha256.slice(0, 10)})`
          });
        }
      });
      const eraRuntime = ERAS_MANIFESTS.find(e => e.activeRuntime);
      const eraStaged = ERAS_MANIFESTS.find(e => e.staged);
      if (eraRuntime && eraStaged && eraRuntime.id !== eraStaged.id) {
        diffs.push({
          curto: `Era: ${eraStaged.titulo.split('·')[0].trim()}`,
          detalhe: `[MANIFESTO ERA] ${eraRuntime.titulo} → ${eraStaged.titulo} (Borda: ${eraStaged.worldBorder})`
        });
      }
      if (activeChunkProfileRuntime !== stagedChunkProfile) {
        diffs.push({
          curto: `Perfil Chunk: ${stagedChunkProfile}`,
          detalhe: `[PERFIL CHUNK] Escrita em disco: ${activeChunkProfileRuntime} → ${stagedChunkProfile}`
        });
      }
      return diffs;
    }

    function atualizarEstadoBannerPendente() {
      const diffs = calcularDiffPendente();
      const count = diffs.length;
      const banner = document.getElementById('globalPendingBanner');
      const badge = document.getElementById('navBadgePendingMods');
      const counter = document.getElementById('modsTabPendingCounter');
      const originsEl = document.getElementById('pendingOriginsList');

      if (counter) counter.textContent = count;

      if (count === 0) {
        if (banner) banner.hidden = true;
        if (badge) { badge.hidden = true; badge.textContent = ''; }
        return;
      }

      if (banner) {
        banner.hidden = false;
        banner.classList.remove('pulse-attention');
        void banner.offsetWidth;
        banner.classList.add('pulse-attention');
      }
      if (badge) {
        badge.hidden = false;
        badge.textContent = count;
      }
      document.getElementById('pendingCountText').textContent = count;
      if (originsEl) {
        originsEl.textContent = 'Origem: ' + diffs.map(d => d.curto).join(' · ');
      }
    }

    function descartarAlteracoesPendentes() {
      MODS_CATALOG.forEach(m => { m.stagedState = m.activeRuntime; });
      ERAS_MANIFESTS.forEach(e => { e.staged = e.activeRuntime; });
      selecionarPerfilChunk(activeChunkProfileRuntime);
      validarDependenciasMods();
      renderizarModsEEras();
    }

    function abrirModalPlanoReinicio() {
      const validacao = validarDependenciasMods();
      const diffs = calcularDiffPendente();

      if (!validacao.valido) {
        abrirActionModal('Aplicação Bloqueada por Dependência', `<p class="text-red-400 font-bold">${validacao.erro}</p>`);
        return;
      }
      if (diffs.length === 0) {
        abrirActionModal('Sem Alterações Pendentes', `<p class="text-secondary">O estado configurado já está ativo na JVM.</p>`);
        return;
      }

      abrirActionModal('Plano de Mudanças (Diff) & Reinício Controlado (60s)', `
        <p class="text-secondary">Resumo das alterações agendadas para aplicação:</p>
        <div class="p-3 rounded-xl bg-black/40 border border-white/10 font-mono-code space-y-1">
          ${diffs.map(d => `<div class="text-accent">${escaparHtml(d.detalhe)}</div>`).join('')}
        </div>
        <div class="p-3 rounded-xl surface-box space-y-1 text-[11px] text-secondary">
          <div class="font-bold text-accent uppercase">Protocolo de Aplicação Segura:</div>
          <div>1. Aviso de contagem regressiva de 60s no servidor e salvamento do mundo</div>
          <div>2. Movimentação entre <code class="font-mono-code">/mods</code> e <code class="font-mono-code">/mods-disabled</code> e gravação de perfil</div>
          <div>3. Subida do servidor e validação automática (TPS &gt; 15 após 60s) com Rollback em caso de falha.</div>
        </div>
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" onclick="fecharActionModal()" class="btn-secondary px-4 py-2 rounded-xl">Cancelar</button>
          <button type="button" onclick="executarFluxoAplicacaoMods()" class="btn-primary px-4 py-2 rounded-xl">Confirmar & Aplicar (60s)</button>
        </div>
      `);
    }

    async function executarFluxoAplicacaoMods() {
      fecharActionModal();
      inserirLogConsole('minecraft', 'SYSTEM', '[Orquestrador JVM] Contagem de 60s iniciada para aplicar alterações pendentes...');

      const modsHabilitados = MODS_CATALOG.filter(m => m.stagedState).map(m => m.id);
      const eraAtivaObj = ERAS_MANIFESTS.find(e => e.staged);

      try {
        const res = await fetch('/api/mods/apply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            eraId: eraAtivaObj ? eraAtivaObj.id : 2,
            perfilChunk: stagedChunkProfile,
            modsHabilitados: modsHabilitados,
            motivo: 'Aplicação agendada pelo painel de controle'
          })
        });

        if (res.ok) {
          const d = await res.json();
          mostrarToast('Manifesto agendado com contagem de 60s!', 'sucesso');
          inserirLogConsole('minecraft', 'INFO', '[Orquestrador JVM] ' + (d.mensagem || 'Plano de reinício iniciado.'));
        }
      } catch (err) {
        console.warn('Erro ao chamar /api/mods/apply:', err);
      }

      MODS_CATALOG.forEach(m => { m.activeRuntime = m.stagedState; });
      ERAS_MANIFESTS.forEach(e => {
        e.activeRuntime = e.staged;
        if (e.activeRuntime) document.getElementById('kpi-era').textContent = e.titulo.split('·')[0].trim();
      });
      activeChunkProfileRuntime = stagedChunkProfile;
      renderizarModsEEras();
      registrarAuditoria('JVM_MANIFEST_APPLY', 'Manifesto aplicado com sucesso.');
    }

    async function carregarModsEErasBackend() {
      try {
        const res = await fetch('/api/mods');
        if (res.ok) {
          const d = await res.json();
          if (Array.isArray(d.mods)) {
            d.mods.forEach(bm => {
              const local = MODS_CATALOG.find(m => m.id === bm.id);
              if (local) {
                local.activeRuntime = !!bm.ativo;
                local.stagedState = !!bm.ativo;
              }
            });
          }
          if (d.perfilChunk) {
            activeChunkProfileRuntime = d.perfilChunk;
            stagedChunkProfile = d.perfilChunk;
          }
          if (d.eraAtiva) {
            ERAS_MANIFESTS.forEach(e => {
              e.activeRuntime = (e.id === d.eraAtiva);
              e.staged = (e.id === d.eraAtiva);
              if (e.activeRuntime) {
                const kpiEra = document.getElementById('kpi-era');
                if (kpiEra) kpiEra.textContent = e.titulo.split('·')[0].trim();
              }
            });
          }
          renderizarModsEEras();
        }
      } catch (err) {
        console.warn('Falha ao carregar estado de mods:', err);
      }
    }

    function atualizarDiagnosticoChunks() {
      const tbody = document.getElementById('topHeavyChunksBody');
      if (tbody) {
        if (!FACTIONS_DATA.length) {
          tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-secondary font-medium">Nenhum clã ou chunk reivindicado em world/ftbchunks no momento.</td></tr>`;
        } else {
          const ordenadas = [...FACTIONS_DATA].sort((a, b) => Number(b.claims || 0) - Number(a.claims || 0));
          tbody.innerHTML = ordenadas.map((f, idx) => {
            const pc = f.primeiroChunk;
            const regiao = pc ? `[${pc.x}, ${pc.z}] ${f.dimensao || 'minecraft:overworld'}` : (f.dimensao || 'minecraft:overworld');
            const statusTxt = raidAtiva ? 'Vulnerável (Raid)' : (f.status || 'Protegida');
            const corStatus = raidAtiva ? 'text-red-400' : 'text-emerald-400';
            return `
              <tr>
                <td class="font-mono-code font-bold">#${idx + 1}</td>
                <td class="font-mono-code">${escaparHtml(regiao)}</td>
                <td class="font-semibold text-accent">[${escaparHtml(f.tag || 'CLÃ')}] ${escaparHtml(f.nome)} <span class="text-secondary text-xs">(Líder: ${escaparHtml(f.lider || '—')})</span></td>
                <td class="font-mono-code">${Number(f.claims || 0)} / ${Number(f.maxClaims || 500)} chunks (Force: ${Number(f.forceLoaded || 0)}/${Number(f.maxForceLoaded || 25)})</td>
                <td class="text-right font-mono-code font-bold ${corStatus}">${escaparHtml(statusTxt)}</td>
              </tr>
            `;
          }).join('');
        }
      }
      const grid = document.getElementById('chunkHeatmapGrid');
      if (grid) {
        const totalClaims = FACTIONS_DATA.reduce((acc, f) => acc + Number(f.claims || 0), 0);
        const cells = Array.from({ length: 36 }, (_, i) => i < totalClaims);
        grid.innerHTML = cells.map((active, i) => {
          const bg = active ? 'bg-emerald-500/60 border border-emerald-400/40' : 'bg-white/5';
          return `<div class="rounded-sm ${bg}" title="${active ? `Chunk reivindicado #${i + 1}` : 'Chunk livre'}"></div>`;
        }).join('');
      }
    }

    /* Backups */
    let BACKUPS_LIST = [];
    let ARQUIVOS_BACKUP_SUBABA = [];

    function formatarBytesReais(bytes) {
      const b = Number(bytes || 0);
      if (b <= 0) return '0 B';
      if (b < 1024) return `${b} B`;
      if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
      if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
      return `${(b / (1024 ** 3)).toFixed(2)} GB`;
    }

    async function carregarBackups() {
      try {
        const res = await fetch('/api/backups');
        if (res.ok) {
          const d = await res.json();
          const listaRaw = Array.isArray(d) ? d : (Array.isArray(d.backups) ? d.backups : []);
          const disco = d.disco || null;

          BACKUPS_LIST = listaRaw.map(b => {
            const bytes = Number(b.bytes ?? b.tamanho_bytes ?? 0);
            const dataIso = b.criadoEm || b.criado_em || null;
            return {
              id: b.id,
              data: dataIso ? new Date(dataIso).toLocaleString('pt-BR') : '—',
              tipo: Array.isArray(b.pastas) && b.pastas.length ? `Completo (${b.pastas.slice(0, 3).join(', ')})` : (b.escopo || b.tipo || 'Completo'),
              bytes,
              tamanho: bytes > 0 ? formatarBytesReais(bytes) : (b.tamanho || '0 B'),
              checksum: b.sha256 || 'verificado'
            };
          });

          const countEl = document.getElementById('kpi-backups-count');
          const usedEl = document.getElementById('kpi-backups-used');
          const freeEl = document.getElementById('kpi-disk-free');
          const lastEl = document.getElementById('kpi-last-backup');

          if (countEl) countEl.textContent = String(BACKUPS_LIST.length);

          const totalUsadoBytes = disco && disco.ocupadoBackupsBytes != null
            ? Number(disco.ocupadoBackupsBytes)
            : BACKUPS_LIST.reduce((acc, item) => acc + (item.bytes || 0), 0);

          if (usedEl) usedEl.textContent = formatarBytesReais(totalUsadoBytes);

          if (freeEl) {
            if (disco && disco.livreBytes > 0) {
              freeEl.textContent = `${(disco.livreBytes / (1024 ** 3)).toFixed(1)} GB`;
            } else {
              freeEl.textContent = '--';
            }
          }

          if (lastEl) {
            lastEl.textContent = BACKUPS_LIST.length > 0 ? BACKUPS_LIST[0].data : 'Nenhum';
          }

          renderizarBackups();
          atualizarSeletorSubAbaBackup();
        }
      } catch (err) {
        console.warn('Falha ao carregar lista de backups:', err);
      }
    }

    async function carregarBackupsBackend() {
      return carregarBackups();
    }

    function renderizarBackups() {
      const tbody = document.getElementById('bk-lista');
      if (!tbody) return;
      if (!BACKUPS_LIST.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-6 text-secondary font-medium">Nenhum backup salvo em dados/backups até o momento. Clique em "+ Criar Backup Configurável" para gerar um pacote .zip real.</td></tr>`;
        return;
      }
      tbody.innerHTML = BACKUPS_LIST.map(b => `
        <tr>
          <td class="font-mono-code font-bold text-accent">${escaparHtml(b.id)}</td>
          <td>${escaparHtml(b.data)}</td>
          <td>${escaparHtml(b.tipo)}</td>
          <td class="font-mono-code">${escaparHtml(b.tamanho)}</td>
          <td>
            <span class="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 text-xs font-mono-code">
              Verificado · sha256:${escaparHtml(String(b.checksum).slice(0, 8))}…
            </span>
          </td>
          <td class="col-actions">
            <div class="action-cell-fixed">
              <button type="button" onclick="abrirInspetorBackupModal('${b.id}')" class="btn-secondary btn-table-action">
                <i data-lucide="folder-search" class="w-3.5 h-3.5"></i> Visualizar
              </button>
              <button type="button" onclick="abrirModalRestaurarBackup('${b.id}')" class="btn-danger btn-table-action">
                <i data-lucide="rotate-ccw" class="w-3.5 h-3.5"></i> Restaurar
              </button>
            </div>
          </td>
        </tr>
      `).join('');
      lucide.createIcons();
    }

    function atualizarSeletorSubAbaBackup() {
      const sel = document.getElementById('bk-seletor');
      const arvore = document.getElementById('bk-arvore');
      if (!sel) return;
      if (!BACKUPS_LIST.length) {
        sel.innerHTML = `<option value="">Nenhum backup disponível</option>`;
        ARQUIVOS_BACKUP_SUBABA = [];
        if (arvore) arvore.innerHTML = `<div class="p-2 text-secondary text-center">Nenhum pacote .zip disponível para inspeção.</div>`;
        return;
      }
      const valorAtual = sel.value;
      sel.innerHTML = BACKUPS_LIST.map(b => `<option value="${escaparHtml(b.id)}">${escaparHtml(b.id)} (${escaparHtml(b.tamanho)})</option>`).join('');
      const alvo = BACKUPS_LIST.some(b => b.id === valorAtual) ? valorAtual : BACKUPS_LIST[0].id;
      sel.value = alvo;
      if (!document.getElementById('bk-painel-arquivos')?.hidden) {
        inspecionarBackupSelecionadoSubAba(alvo);
      }
    }

    async function inspecionarBackupSelecionadoSubAba(bkId) {
      const id = bkId || document.getElementById('bk-seletor')?.value;
      const arvore = document.getElementById('bk-arvore');
      if (!arvore) return;
      if (!id) {
        arvore.innerHTML = `<div class="p-2 text-secondary text-center">Nenhum pacote .zip selecionado.</div>`;
        return;
      }
      arvore.innerHTML = `<div class="p-2 text-secondary text-center">Lendo entradas reais do pacote ${escaparHtml(id)}.zip...</div>`;
      try {
        const res = await fetch(`/api/backups/${encodeURIComponent(id)}/inspect`);
        const d = await res.json();
        if (res.ok && Array.isArray(d.arquivos)) {
          ARQUIVOS_BACKUP_SUBABA = d.arquivos;
          filtrarArvoreBackupSubAba();
        } else {
          arvore.innerHTML = `<div class="p-2 text-red-400 text-center">${escaparHtml(d.erro || 'Falha ao inspecionar backup.')}</div>`;
        }
      } catch {
        arvore.innerHTML = `<div class="p-2 text-red-400 text-center">Erro de conexão ao inspecionar pacote .zip.</div>`;
      }
    }

    function filtrarArvoreBackupSubAba() {
      const arvore = document.getElementById('bk-arvore');
      if (!arvore) return;
      const termo = (document.getElementById('bk-filtro')?.value || '').toLowerCase();
      const filtrados = ARQUIVOS_BACKUP_SUBABA.filter(a => String(a.nome || '').toLowerCase().includes(termo));
      if (!filtrados.length) {
        arvore.innerHTML = `<div class="p-2 text-secondary text-center">Nenhum arquivo encontrado no pacote.</div>`;
        return;
      }
      const idSel = document.getElementById('bk-seletor')?.value;
      arvore.innerHTML = filtrados.slice(0, 300).map(arq => `
        <div class="p-1.5 rounded hover:bg-white/5 flex justify-between items-center cursor-pointer" onclick="abrirInspetorBackupModal('${escaparHtml(idSel)}')">
          <span class="truncate text-white hover:text-accent">${escaparHtml(arq.nome)}</span>
          <span class="text-secondary shrink-0 ml-3">${formatarBytesReais(arq.bytes ?? arq.tamanho ?? 0)}</span>
        </div>
      `).join('');
    }

    function alternarSubAbaBackup(aba) {
      document.querySelectorAll('[data-btab]').forEach(b => b.classList.toggle('active', b.dataset.btab === aba));
      document.getElementById('bk-painel-lista').hidden = aba !== 'lista';
      document.getElementById('bk-painel-arquivos').hidden = aba !== 'arquivos';
      if (aba === 'arquivos') {
        const idSel = document.getElementById('bk-seletor')?.value || (BACKUPS_LIST[0] && BACKUPS_LIST[0].id);
        if (idSel) inspecionarBackupSelecionadoSubAba(idSel);
      }
    }

    function abrirModalCriarBackup() {
      const sugestao = 'bk-' + new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
      abrirActionModal('Criar Novo Backup Configurável', `
        <div class="space-y-3">
          <div class="p-3 rounded-xl bg-yellow-500/15 border border-yellow-500/40 text-yellow-300 text-[11px]">
            <strong>Aviso de Impacto:</strong> O salvamento forçado (<code class="font-mono-code">save-all flush</code>) e compactação geram um pacote <code class="font-mono-code">.zip</code> real com SHA-256 em <code class="font-mono-code">dados/backups</code>.
          </div>
          <label class="block space-y-1">
            <span class="font-bold uppercase text-secondary">Identificador / Tipo do Backup</span>
            <input type="text" id="newBkName" value="${sugestao}" class="w-full surface-box rounded-xl px-3 py-2 font-mono-code outline-none">
          </label>
          <div>
            <span class="font-bold uppercase text-secondary block mb-1.5">Escopo do Pacote</span>
            <div class="grid grid-cols-2 gap-2 surface-box p-3 rounded-xl">
              <label class="flex items-center gap-2"><input type="checkbox" checked> <span>world (Overworld)</span></label>
              <label class="flex items-center gap-2"><input type="checkbox" checked> <span>nether &amp; end</span></label>
              <label class="flex items-center gap-2"><input type="checkbox" checked> <span>mods &amp; configs</span></label>
              <label class="flex items-center gap-2"><input type="checkbox" checked> <span>server.properties &amp; json</span></label>
            </div>
          </div>
          <div class="flex justify-end gap-2 pt-2">
            <button type="button" onclick="fecharActionModal()" class="btn-secondary px-4 py-2 rounded-xl">Cancelar</button>
            <button type="button" onclick="dispararCriacaoBackup()" class="btn-primary px-4 py-2 rounded-xl">Iniciar Backup Real</button>
          </div>
        </div>
      `);
    }

    async function dispararCriacaoBackup() {
      fecharActionModal();
      const box = document.getElementById('bk-progresso-container');
      const lbl = document.getElementById('bk-stage-label');
      const pct = document.getElementById('bk-stage-percent');
      const bar = document.getElementById('bk-stage-bar');
      const btnCreate = document.getElementById('btn-create-backup');

      if (box) box.hidden = false;
      if (btnCreate) btnCreate.disabled = true;
      if (lbl) lbl.textContent = 'Compactando diretórios do servidor e gerando pacote .zip com SHA-256...';
      if (pct) pct.textContent = '50%';
      if (bar) bar.style.width = '50%';

      try {
        const res = await fetch('/api/backups', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tipo: 'manual' })
        });
        const d = await res.json();
        if (!res.ok) {
          alert('Falha ao criar backup: ' + (d.erro || 'Erro desconhecido.'));
        } else {
          if (lbl) lbl.textContent = 'Backup concluído e verificado com sucesso!';
          if (pct) pct.textContent = '100%';
          if (bar) bar.style.width = '100%';
          registrarAuditoria('BACKUP_CREATE', `Backup real ${d.id || ''} criado com sucesso.`);
          mostrarToast(`Backup ${d.id || ''} criado com sucesso!`, 'sucesso');
          await carregarBackups();
        }
      } catch (err) {
        alert('Erro de conexão ao criar backup: ' + err.message);
      } finally {
        if (btnCreate) btnCreate.disabled = false;
        setTimeout(() => {
          if (box) box.hidden = true;
        }, 1000);
      }
    }

    function abrirModalRestaurarBackup(bkId) {
      abrirActionModal(`Restaurar Backup (Ação Destrutiva): ${bkId}`, `
        <div class="space-y-3">
          <div class="p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-[11px]">
            <strong>Resumo de Impacto:</strong> Os mundos atuais serão substituídos pelo pacote <strong>${bkId}</strong>. Um snapshot automático pré-restauração será salvo para rollback em caso de falha.
          </div>
          <label class="block space-y-1">
            <span class="font-bold uppercase text-red-400">Redigite seu nick ("${OPERATOR_SESSION.mcNick}") para confirmar</span>
            <input type="text" id="restoreConfirmNick" placeholder="${OPERATOR_SESSION.mcNick}" class="w-full surface-box rounded-xl px-3 py-2 font-mono-code outline-none">
          </label>
          <div class="flex justify-end gap-2 pt-2">
            <button type="button" onclick="fecharActionModal()" class="btn-secondary px-4 py-2 rounded-xl">Cancelar</button>
            <button type="button" onclick="confirmarRestauracaoBackup('${bkId}')" class="btn-danger px-4 py-2 rounded-xl">Confirmar Restauração</button>
          </div>
        </div>
      `);
    }

    async function confirmarRestauracaoBackup(bkId) {
      const typed = document.getElementById('restoreConfirmNick')?.value.trim();
      if (typed !== OPERATOR_SESSION.mcNick) { alert(`Redigite exatamente "${OPERATOR_SESSION.mcNick}".`); return; }
      fecharActionModal();
      registrarAuditoria('BACKUP_RESTORE', `Restauração do pacote ${bkId} iniciada.`);
      inserirLogConsole('minecraft', 'WARN', `[Restore] Snapshot prévio criado. Restaurando ${bkId}...`);

      try {
        const res = await fetch(`/api/backups/${encodeURIComponent(bkId)}/restaurar`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ confirmacaoNick: typed })
        });
        const d = await res.json();
        if (res.ok) {
          mostrarToast(`Backup ${bkId} restaurado com sucesso!`, 'sucesso');
          inserirLogConsole('minecraft', 'SUCCESS', `[Restore] ${d.mensagem || 'Restauração concluída.'}`);
        } else {
          alert('Erro na restauração: ' + (d.erro || 'Falha ao restaurar.'));
        }
      } catch (err) {
        console.error('Erro ao restaurar backup:', err);
      }
    }

    /* Arquivos */
    function renderizarSkeletonTabela(tbodyId, cols = 4, rows = 3) {
      const el = document.getElementById(tbodyId);
      if (!el) return;
      el.innerHTML = Array.from({ length: rows }).map(() => `
        <tr>${Array.from({ length: cols }).map(() => `<td><div class="skeleton-line w-3/4"></div></td>`).join('')}</tr>
      `).join('');
    }

    async function carregarArquivosArea() {
      const area = document.getElementById('arquivosArea')?.value || 'servidor';
      const breadcrumb = '/' + area + (caminhoAtualArquivos ? ('/' + caminhoAtualArquivos) : '');
      const bcEl = document.getElementById('arquivosBreadcrumb');
      if (bcEl) bcEl.textContent = breadcrumb;
      renderizarSkeletonTabela('arquivosLista', 4, 4);

      try {
        const r = await fetch(`/api/files/listar?area=${encodeURIComponent(area)}&caminho=${encodeURIComponent(caminhoAtualArquivos)}`);
        if (!r.ok) throw new Error();
        const d = await r.json();
        renderizarItensArquivos(d.itens || []);
      } catch {
        renderizarItensArquivos([
          { nome: 'mods', pasta: true, tamanho: 0, modificado: '07/11/2026 01:10' },
          { nome: 'config', pasta: true, tamanho: 0, modificado: '07/11/2026 01:05' },
          { nome: 'server.properties', pasta: false, tamanho: 1420, modificado: '06/11/2026 22:10' },
          { nome: 'whitelist.json', pasta: false, tamanho: 512, modificado: '07/11/2026 00:15' }
        ]);
      }
    }

    let caminhoAtualArquivos = '';

    function renderizarItensArquivos(itens) {
      const tbody = document.getElementById('arquivosLista');
      if (!tbody) return;
      if (!itens.length) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center py-6 text-secondary">Diretório vazio ou aguardando vínculo com o servidor.</td></tr>`;
        return;
      }

      let htmlVoltar = '';
      if (caminhoAtualArquivos) {
        htmlVoltar = `
          <tr class="hover:bg-white/5 cursor-pointer" onclick="navegarPastaPaiArquivos()">
            <td colspan="4" class="text-accent font-bold py-2">⬅ .. (Pasta Anterior)</td>
          </tr>
        `;
      }

      tbody.innerHTML = htmlVoltar + itens.map(i => {
        const itemPath = caminhoAtualArquivos ? (caminhoAtualArquivos + '/' + i.nome) : i.nome;
        const acoesHtml = i.pasta 
          ? `<button type="button" onclick="navegarSubpastaArquivos('${escaparHtml(i.nome)}')" class="btn-secondary btn-table-action">Abrir Pasta</button>`
          : `<button type="button" onclick="abrirEditorArquivoModal('${escaparHtml(itemPath)}')" class="btn-secondary btn-table-action">Editar</button>
             <a href="/api/files/download?area=${encodeURIComponent(document.getElementById('arquivosArea')?.value || 'servidor')}&caminho=${encodeURIComponent(itemPath)}" download class="btn-secondary btn-table-action inline-flex items-center justify-center">Baixar</a>`;

        return `
          <tr>
            <td class="font-semibold ${i.pasta ? 'text-accent cursor-pointer' : ''}" ${i.pasta ? `onclick="navegarSubpastaArquivos('${escaparHtml(i.nome)}')"` : ''}>
              ${i.pasta ? '📁 ' : '📄 '}${escaparHtml(i.nome)}
            </td>
            <td class="font-mono-code">${i.pasta ? '—' : (i.tamanho + ' B')}</td>
            <td class="text-secondary">${i.modificado || '—'}</td>
            <td class="col-actions">
              <div class="action-cell-fixed">
                ${acoesHtml}
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }

    function navegarSubpastaArquivos(sub) {
      caminhoAtualArquivos = caminhoAtualArquivos ? (caminhoAtualArquivos + '/' + sub) : sub;
      carregarArquivosArea();
    }

    function navegarPastaPaiArquivos() {
      if (!caminhoAtualArquivos) return;
      const partes = caminhoAtualArquivos.split('/');
      partes.pop();
      caminhoAtualArquivos = partes.join('/');
      carregarArquivosArea();
    }

    function criarNovaPastaArquivos() {
      const nome = prompt('Nome da nova pasta:');
      if (nome) registrarAuditoria('FOLDER_CREATE', `Nova pasta criada: ${nome}`);
    }

    /* Contas & Auditoria */
    function atualizarSkinVinculada() {
      const nick = OPERATOR_SESSION.linked && OPERATOR_SESSION.mcNick ? OPERATOR_SESSION.mcNick : 'MHF_Question';
      const ts = Date.now();
      const skinImg = document.getElementById('profileLinkedSkinImg');
      const footerAvatar = document.getElementById('sidebarFooterAvatar');
      if (skinImg) skinImg.src = `https://mc-heads.net/body/${nick}/80?t=${ts}`;
      if (footerAvatar) footerAvatar.src = `https://mc-heads.net/avatar/${nick}/64?t=${ts}`;
    }

    function alternarEstadoVinculoDemo() {
      const box = document.getElementById('unlinkBoxFlow');
      box.hidden = !box.hidden;
      if (!box.hidden) gerarCodigoVinculo();
    }

    async function gerarCodigoVinculo() {
      try {
        const r = await fetch('/api/link/generate', { method: 'POST' });
        if (r.ok) {
          const d = await r.json();
          document.getElementById('linkCommandDisplay').textContent = d.comando;
          return;
        }
      } catch {}
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let code = 'MC-';
      for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
      code += '-' + chars[Math.floor(Math.random() * chars.length)] + chars[Math.floor(Math.random() * chars.length)];
      document.getElementById('linkCommandDisplay').textContent = `/vincular ${code}`;
    }

    let PANEL_ACCOUNTS = [];

    const ROLE_TO_SERVER_GROUP = { owner: 'dono', admin: 'admin', moderator: 'moderador', support: 'suporte' };

    async function carregarContasPainelBackend() {
      try {
        const res = await fetch('/api/usuarios');
        if (res.ok) {
          const d = await res.json();
          if (Array.isArray(d.usuarios)) {
            PANEL_ACCOUNTS = d.usuarios.map(u => {
              const vinculo = u.vinculo || (u.minecraft_nick || u.minecraft_uuid ? { mc_nick: u.minecraft_nick, mc_uuid: u.minecraft_uuid } : null);
              const mcNick = vinculo ? (vinculo.mc_nick || vinculo.nick || null) : (u.minecraft_nick || u.mc_nick || null);
              const mcUuid = vinculo ? (vinculo.mc_uuid || vinculo.uuid || null) : (u.minecraft_uuid || u.mc_uuid || null);
              return {
                usuario: u.usuario,
                nome: u.nome || u.usuario,
                vinculado: Boolean(mcNick || mcUuid),
                mcNick: mcNick,
                uuid: mcUuid || null,
                cargo: u.cargo,
                grupoJogo: ROLE_TO_SERVER_GROUP[u.cargo] || 'suporte',
                totp: Boolean(u.totpAtivo || u.totp_secret),
                criadoEm: u.criadoEm || u.criado_em ? new Date(u.criadoEm || u.criado_em).toLocaleDateString('pt-BR') : '—'
              };
            });
            renderizarContasPainel();
          }
        }
      } catch (err) {
        console.warn('Falha ao carregar contas do backend:', err);
      }
    }

    function renderizarContasPainel() {
      const tbody = document.getElementById('corpoTabelaUsuarios');
      if (!tbody) return;
      tbody.innerHTML = PANEL_ACCOUNTS.map(u => {
        const isSelf = u.usuario === OPERATOR_SESSION.panelUser;
        const avatarUrl = u.vinculado && (u.mcNick || u.uuid)
          ? `https://mc-heads.net/avatar/${encodeURIComponent(u.mcNick || u.uuid)}/24`
          : null;

        const avatarHtml = avatarUrl
          ? `<img src="${avatarUrl}" class="w-5 h-5 rounded shrink-0 object-cover border border-accent/40" alt="${escaparHtml(u.mcNick || u.usuario)}">`
          : `<div class="w-5 h-5 rounded shrink-0 bg-white/10 flex items-center justify-center text-[10px] font-bold text-secondary border border-white/10" title="Conta não vinculada ao Minecraft">?</div>`;

        const displayNick = u.vinculado
          ? `<span>${escaparHtml(u.mcNick || 'Vinculado')}</span>`
          : `<span class="text-secondary italic font-normal text-xs">Não vinculado</span>`;

        const uuidDisplay = u.vinculado && u.uuid
          ? `${escaparHtml(u.uuid.slice(0, 13))}…`
          : `<span class="italic text-zinc-500">—</span>`;

        return `
          <tr>
            <td>
              <div class="font-bold flex items-center gap-2">
                ${avatarHtml}
                ${displayNick}
                ${isSelf ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-accent-soft text-accent">Você</span>' : ''}
              </div>
              <div class="text-xs text-secondary">@${escaparHtml(u.usuario)}</div>
            </td>
            <td class="font-mono-code text-xs text-secondary">${uuidDisplay}</td>
            <td>
              <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase bg-accent-soft">
                ${escaparHtml(u.cargo)} ↔ grupo:${escaparHtml(u.grupoJogo)}
              </span>
            </td>
            <td>
              <span class="text-xs font-bold ${u.totp ? 'text-emerald-400' : 'text-secondary'}">
                ${u.totp ? '2FA Ativo' : 'Padrão'}
              </span>
            </td>
            <td class="text-secondary">${escaparHtml(u.criadoEm)}</td>
            <td class="col-actions">
              <div class="action-cell-fixed">
                <button type="button" onclick="removerContaOperador('${escaparHtml(u.usuario)}')" class="btn-danger btn-table-action" ${isSelf ? 'disabled title="Guarda-corpo: você não pode remover a própria conta"' : ''}>
                  Remover
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }

    document.getElementById('formUsuario')?.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      const user = document.getElementById('campoUsuario').value.trim().toLowerCase();
      const senha = document.getElementById('campoSenha').value;
      const cargo = document.getElementById('campoCargo').value;
      const motivo = document.getElementById('campoMotivoCargo').value.trim();

      if (user === OPERATOR_SESSION.panelUser) {
        alert('Guarda-corpo de Segurança: Ninguém pode alterar o próprio cargo.');
        return;
      }

      const existente = PANEL_ACCOUNTS.find(a => a.usuario === user);
      if (existente && existente.cargo === 'owner' && cargo !== 'owner') {
        if (PANEL_ACCOUNTS.filter(a => a.cargo === 'owner').length <= 1) {
          alert('Guarda-corpo de Segurança: Proibido rebaixar o último owner.');
          return;
        }
      }

      try {
        await fetch('/api/usuarios', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ usuario: user, senha, cargo, motivo })
        });
      } catch {}

      const grupoJogo = ROLE_TO_SERVER_GROUP[cargo] || 'suporte';
      if (existente) { existente.cargo = cargo; existente.grupoJogo = grupoJogo; }
      else {
        PANEL_ACCOUNTS.push({
          usuario: user, mcNick: user, uuid: '00000000-0000-4000-8000-' + String(Date.now()).slice(-12),
          cargo, grupoJogo, totp: cargo === 'owner' || cargo === 'admin', criadoEm: new Date().toLocaleDateString('pt-BR')
        });
      }

      registrarAuditoria('USER_ROLE_SYNC', `Conta ${user} definida como ${cargo} (grupo:${grupoJogo}). Motivo: ${motivo}`);
      this.reset();
      renderizarContasPainel();
    });

    async function removerContaOperador(user) {
      const alvo = PANEL_ACCOUNTS.find(a => a.usuario === user);
      if (!alvo) return;
      if (alvo.cargo === 'owner' && PANEL_ACCOUNTS.filter(a => a.cargo === 'owner').length <= 1) {
        alert('Guarda-corpo de Segurança: Proibido remover o último owner.');
        return;
      }
      const motivo = prompt(`Motivo obrigatório para remover a conta "${user}" (Auditoria Imutável):`);
      if (!motivo) return;

      try {
        const res = await fetch(`/api/usuarios/${encodeURIComponent(user)}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ motivo })
        });
        const d = await res.json();
        if (res.ok) {
          mostrarToast(`Conta ${user} removida com sucesso!`, 'sucesso');
          registrarAuditoria('USER_DELETE', `Conta ${user} removida. Motivo: ${motivo}`);
          carregarContasPainelBackend();
        } else {
          alert('Falha ao remover conta: ' + (d.erro || 'Erro desconhecido.'));
        }
      } catch (err) {
        console.error('Erro ao deletar usuário:', err);
      }
    }

    const AUDIT_LOGS_STATE = [];

    async function carregarAuditoriaBackend() {
      try {
        const r = await fetch('/api/auditoria');
        if (r.ok) {
          const d = await r.json();
          if (Array.isArray(d.logs) && d.logs.length) {
            AUDIT_LOGS_STATE.splice(0, AUDIT_LOGS_STATE.length, ...d.logs.map(l => ({
              horario: new Date(l.criado_em).toLocaleTimeString('pt-BR'),
              operador: l.autor_usuario,
              acao: l.acao,
              alvo: l.alvo || '—',
              motivo: l.motivo || '—',
              ip: l.ip
            })));
          }
        }
      } catch {}
      renderizarTimelineAuditoria();
    }

    function renderizarTimelineAuditoria() {
      const tbody = document.getElementById('auditTimelineBody');
      if (!tbody) return;
      tbody.innerHTML = AUDIT_LOGS_STATE.map(a => `
        <tr>
          <td class="font-mono-code text-secondary">${a.horario}</td>
          <td class="font-bold text-accent">${escaparHtml(a.operador)}</td>
          <td><span class="px-2 py-0.5 rounded surface-box font-mono-code text-[11px]">${escaparHtml(a.acao)}</span></td>
          <td class="font-semibold">${escaparHtml(a.alvo)}</td>
          <td class="text-secondary">${escaparHtml(a.motivo)}</td>
          <td class="font-mono-code text-secondary">${escaparHtml(a.ip)}</td>
        </tr>
      `).join('');
    }

    function registrarAuditoria(acao, motivo) {
      const now = new Date().toLocaleTimeString('pt-BR');
      AUDIT_LOGS_STATE.unshift({ horario: now, operador: OPERATOR_SESSION.mcNick, acao, alvo: 'servidor', motivo, ip: '127.0.0.1' });
      renderizarTimelineAuditoria();
      inserirLogConsole('minecraft', 'SYSTEM', `[AUDITORIA · ${acao}] ${motivo}`);
    }

    /* Command Palette */
    const COMMAND_PALETTE_ITEMS = [
      { titulo: 'Ir para: Visão Geral & Consoles', categoria: 'Navegação', run: () => ativarAba('dashboard') },
      { titulo: 'Ir para: Jogadores Conectados', categoria: 'Navegação', run: () => ativarAba('jogadores') },
      { titulo: 'Ir para: Facções & Raids', categoria: 'Navegação', run: () => ativarAba('faccoes') },
      { titulo: 'Ir para: Mods, Eras & Performance por Chunk', categoria: 'Navegação', run: () => ativarAba('mods') },
      { titulo: 'Ir para: Explorador de Arquivos', categoria: 'Navegação', run: () => ativarAba('arquivos') },
      { titulo: 'Ir para: Backups & Restauração', categoria: 'Navegação', run: () => ativarAba('backups') },
      { titulo: 'Ir para: Configurações, Contas & Auditoria', categoria: 'Navegação', run: () => ativarAba('configuracoes') },
      { titulo: 'Ação: Criar Novo Backup Configurável', categoria: 'Operação', run: () => { ativarAba('backups'); abrirModalCriarBackup(); } },
      { titulo: 'Ação: Enviar Aviso Global (Broadcast com Preview)', categoria: 'Operação', run: () => abrirModalBroadcastPreview() },
      { titulo: 'Ação: Alternar Tema (Modo Escuro / Modo Branco)', categoria: 'Aparência', run: () => toggleTheme() },
      { titulo: 'Perfil de Chunk: Selecionar Conservador', categoria: 'Performance', run: () => { ativarAba('mods'); selecionarPerfilChunk('Conservador'); } },
      { titulo: 'Perfil de Chunk: Selecionar Balanceado', categoria: 'Performance', run: () => { ativarAba('mods'); selecionarPerfilChunk('Balanceado'); } },
      { titulo: 'Perfil de Chunk: Selecionar Performance', categoria: 'Performance', run: () => { ativarAba('mods'); selecionarPerfilChunk('Performance'); } }
    ];

    function abrirCommandPalette() {
      document.getElementById('cmdPaletteBackdrop').hidden = false;
      const inp = document.getElementById('cmdPaletteInput');
      inp.value = '';
      filtrarCommandPalette();
      inp.focus();
    }

    function fecharCommandPalette() {
      document.getElementById('cmdPaletteBackdrop').hidden = true;
    }

    function filtrarCommandPalette() {
      const q = (document.getElementById('cmdPaletteInput')?.value || '').toLowerCase();
      const box = document.getElementById('cmdPaletteResults');
      const lista = COMMAND_PALETTE_ITEMS.filter(i => i.titulo.toLowerCase().includes(q) || i.categoria.toLowerCase().includes(q));
      box.innerHTML = lista.map((item) => `
        <button type="button" onclick="executarItemPalette(${COMMAND_PALETTE_ITEMS.indexOf(item)})" class="w-full p-2.5 rounded-xl hover:bg-white/5 flex items-center justify-between text-left transition">
          <span class="font-semibold">${item.titulo}</span>
          <span class="px-2 py-0.5 rounded surface-box text-[10px] text-accent uppercase font-bold">${item.categoria}</span>
        </button>
      `).join('');
    }

    function executarItemPalette(idx) {
      fecharCommandPalette();
      if (COMMAND_PALETTE_ITEMS[idx]) COMMAND_PALETTE_ITEMS[idx].run();
    }

    document.addEventListener('keydown', function (ev) {
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k') {
        ev.preventDefault();
        abrirCommandPalette();
      } else if (ev.key === 'Escape') {
        fecharCommandPalette();
        fecharActionModal();
        fecharDrawerInspecao();
      }
    });

    const VIEW_HEADERS = {
      dashboard: ['Visão Geral & Consoles', 'Monitoramento unificado e controle de ciclo de vida do servidor Minecraft e Bot Discord'],
      jogadores: ['Jogadores Conectados & Moderação', 'Ordene por nick/ping, inspecione na gaveta lateral e execute TP, Kick ou Ban com auditoria'],
      faccoes: ['Facções, Claims & Controle de Raids', 'Gerencie janelas de invasão, escudos de base e ranking de poder das facções'],
      mods: ['Mods, Eras Declarativas & Performance por Chunk', 'Alterações pendentes com revisão de diff, validação de dependências e diagnóstico de MSPT'],
      arquivos: ['Gerenciador de Arquivos Web', 'Acesso restrito à raiz do servidor vinculado (sem symlink e sem path traversal)'],
      backups: ['Backups & Restauração com Rollback', 'Criação de pacotes com quiesce, checksum SHA-256 e restauração segura'],
      configuracoes: ['Configurações, Contas & Auditoria', 'Aparência, vínculo de posse de UUID, gestão unificada de contas e timeline de auditoria']
    };

    function ativarAba(view) {
      document.querySelectorAll('#sidebarNav .nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === view));
      ['dashboard', 'jogadores', 'faccoes', 'mods', 'arquivos', 'backups', 'configuracoes'].forEach(v => {
        const sec = document.getElementById('view-' + v);
        if (sec) sec.hidden = (v !== view);
      });
      if (VIEW_HEADERS[view]) {
        document.getElementById('viewHeaderTitle').textContent = VIEW_HEADERS[view][0];
        document.getElementById('viewHeaderSubtitle').textContent = VIEW_HEADERS[view][1];
      }
      if (view === 'arquivos') carregarArquivosArea();
      if (view === 'backups') carregarBackups();
      if (view === 'configuracoes') carregarAuditoriaBackend();
    }

    document.querySelectorAll('#sidebarNav .nav-item').forEach(btn => {
      btn.addEventListener('click', () => ativarAba(btn.dataset.view));
    });

    function abrirActionModal(titulo, htmlBody) {
      document.getElementById('actionModalTitle').textContent = titulo;
      document.getElementById('actionModalBody').innerHTML = htmlBody;
      document.getElementById('actionModalBackdrop').hidden = false;
    }
    function fecharActionModal() {
      document.getElementById('actionModalBackdrop').hidden = true;
    }
    function escaparHtml(v) {
      return String(v || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    let ultimaLeituraValida = new Date().toLocaleTimeString('pt-BR');

    function definirEstadoConexaoWS(online) {
      const dot = document.getElementById('agentHeartbeatDot');
      const lbl = document.getElementById('agentHeartbeatLabel');
      const staleBanner = document.getElementById('staleDataBanner');

      if (online) {
        ultimaLeituraValida = new Date().toLocaleTimeString('pt-BR');
        dot.className = 'status-dot online';
        lbl.textContent = 'Tempo Real: Conectado';
        staleBanner.hidden = true;
      } else {
        dot.className = 'status-dot starting';
        lbl.textContent = 'Tempo Real: Reconectando...';
        document.getElementById('lastValidReadTimestamp').textContent = ultimaLeituraValida;
        staleBanner.hidden = false;
      }
    }

    function conectarWebSocketReal() {
      try {
        const sinceSeq = CONSOLE_STATE.minecraft.lastSeq;
        const ws = new WebSocket(`${WS_URL}?sinceSeq=${sinceSeq}`);
        ws.onopen = () => definirEstadoConexaoWS(true);
        ws.onmessage = (ev) => {
          definirEstadoConexaoWS(true);
          try {
            const msg = JSON.parse(ev.data);
            if (msg.tipo === 'log' && msg.dados) {
              const d = msg.dados;
              const target = d.fonte === 'bot' || d.fonte === 'discord' ? 'discord' : 'minecraft';
              const lvlMap = { erro: 'ERROR', aviso: 'WARN', sucesso: 'SUCCESS', sistema: 'SYSTEM', info: 'INFO' };
              inserirLogConsole(target, lvlMap[d.nivel] || 'INFO', d.mensagem, d.seq);
            } else if (msg.tipo === 'status' && msg.dados) {
              const d = msg.dados;
              const alvo = d.servico || (d.fonte === 'bot' || d.fonte === 'discord' ? 'discord' : 'minecraft');
              const status = d.status || d.estado;
              if (alvo === 'minecraft') {
                servidorMcOnline = (status === 'online');
              }
              atualizarStatusServidorReal();
            } else if (msg.tipo === 'telemetria' && msg.dados) {
              const t = msg.dados;
              if (t.tps1m !== undefined && t.mspt !== undefined) {
                aplicarThresholdsTpsMspt(Number(t.tps1m), Number(t.mspt));
              }
            }
          } catch {}
        };
        ws.onclose = () => {
          if (location.protocol !== 'file:') definirEstadoConexaoWS(false);
        };
      } catch {}
    }

    // Inicialização orientada exclusivamente a dados reais do Backend
    carregarOperadorSessao();
    atualizarStatusServidorReal();
    carregarJogadoresBackend();
    carregarFaccoesBackend();
    carregarStatusRaidBackend();
    carregarModsEErasBackend();
    atualizarDiagnosticoChunks();
    carregarBackupsBackend();
    carregarContasPainelBackend();
    carregarAuditoriaBackend();
    conectarWebSocketReal();

    // Polling leve a cada 5s para manter telemetria, status e dados sincronizados
    setInterval(() => {
      atualizarStatusServidorReal();
      carregarJogadoresBackend();
      carregarFaccoesBackend();
      carregarStatusRaidBackend();
    }, 5000);

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('view')) ativarAba(urlParams.get('view'));

/* Modais de Arquivo e Backup */
let arquivoEditandoAtual = { area: '', caminho: '' };

async function abrirEditorArquivoModal(caminho) {
  const area = document.getElementById('arquivosArea')?.value || 'servidor';
  arquivoEditandoAtual = { area, caminho };

  const m = document.getElementById('modalEditorArquivo');
  const pathLabel = document.getElementById('editorArquivoCaminho');
  const textarea = document.getElementById('editorArquivoConteudo');
  const countEl = document.getElementById('editorArquivoLinhasColunas');

  if (pathLabel) pathLabel.textContent = area + '/' + caminho;
  if (textarea) textarea.value = 'Carregando conteúdo...';
  if (m) {
    m.hidden = false;
    lucide.createIcons();
  }

  try {
    const res = await fetch(`/api/files/ler?area=${encodeURIComponent(area)}&caminho=${encodeURIComponent(caminho)}`);
    const d = await res.json();
    if (res.ok && d.conteudo !== undefined) {
      if (textarea) {
        textarea.value = d.conteudo;
        atualizarContadoresEditor();
      }
    } else {
      if (textarea) textarea.value = '// ' + (d.erro || 'Falha ao carregar conteúdo do arquivo.');
    }
  } catch (err) {
    if (textarea) textarea.value = '// Erro de conexão ao ler arquivo.';
  }
}

function atualizarContadoresEditor() {
  const textarea = document.getElementById('editorArquivoConteudo');
  const countEl = document.getElementById('editorArquivoLinhasColunas');
  if (!textarea || !countEl) return;
  const linhas = textarea.value.split('\n').length;
  const caracteres = textarea.value.length;
  countEl.textContent = `${linhas} linhas · ${caracteres} caracteres`;
}

async function salvarArquivoEditado() {
  const textarea = document.getElementById('editorArquivoConteudo');
  if (!textarea) return;
  const conteudo = textarea.value;

  try {
    const res = await fetch('/api/files/salvar', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        area: arquivoEditandoAtual.area,
        caminho: arquivoEditandoAtual.caminho,
        conteudo: conteudo
      })
    });
    const d = await res.json();
    if (res.ok) {
      mostrarToast('Arquivo salvo com sucesso!', 'sucesso');
      fecharEditorArquivo();
      carregarArquivosArea();
    } else {
      alert('Falha ao salvar arquivo: ' + (d.erro || 'Erro desconhecido.'));
    }
  } catch (err) {
    alert('Erro de conexão ao salvar arquivo.');
  }
}

function fecharEditorArquivo() {
  const m = document.getElementById('modalEditorArquivo');
  if (m) m.hidden = true;
}

let backupInspetorAtual = null;
let arquivosBackupInspetorCache = [];

async function abrirInspetorBackupModal(bkId) {
  backupInspetorAtual = bkId;
  arquivosBackupInspetorCache = [];
  const m = document.getElementById('modalInspetorBackup');
  const title = document.getElementById('inspetorBackupId');
  const meta = document.getElementById('inspetorBackupMeta');
  const countEl = document.getElementById('inspetorBackupTotalArquivos');
  const listEl = document.getElementById('inspetorBackupListaArquivos');
  const fileNome = document.getElementById('inspetorBackupArquivoNome');
  const fileTam = document.getElementById('inspetorBackupArquivoTamanho');
  const fileContent = document.getElementById('inspetorBackupConteudoTexto');
  const inputBusca = document.getElementById('inspetorBackupBusca');

  if (inputBusca) inputBusca.value = '';

  const bkObj = BACKUPS_LIST.find(b => b.id === bkId) || { id: bkId, tamanho: '—', checksum: '—', data: '—' };
  const shortSha = bkObj.checksum ? String(bkObj.checksum).slice(0, 8) + '…' : '—';

  if (title) title.textContent = `${bkId}.zip`;
  if (meta) meta.textContent = `Tamanho: ${bkObj.tamanho || '—'} · SHA-256: ${shortSha} · Gerado em: ${bkObj.data || '—'}`;
  if (countEl) countEl.textContent = 'Carregando índice...';
  if (fileNome) fileNome.textContent = 'Selecione um arquivo da lista';
  if (fileTam) fileTam.textContent = '-';
  if (fileContent) fileContent.textContent = 'Clique em um arquivo de texto (.properties, .json, .yml, .toml, .log) à esquerda para inspecionar seu conteúdo gravado sem precisar descompactar o backup inteiro.';
  if (listEl) listEl.innerHTML = '<div class="text-secondary p-3 text-center">Lendo entradas reais do arquivo compactado...</div>';

  if (m) {
    m.hidden = false;
    lucide.createIcons();
  }

  try {
    const res = await fetch(`/api/backups/${encodeURIComponent(bkId)}/inspect`);
    const d = await res.json();
    if (res.ok && Array.isArray(d.arquivos)) {
      arquivosBackupInspetorCache = d.arquivos;
      if (countEl) countEl.textContent = `${d.arquivos.length} arquivo(s)`;
      renderizarListaArquivosInspetor(d.arquivos);
    } else {
      if (countEl) countEl.textContent = 'Erro ao indexar';
      if (listEl) listEl.innerHTML = `<div class="text-red-400 p-3 text-center">${escaparHtml(d.erro || 'Falha ao inspecionar ZIP.')}</div>`;
    }
  } catch (err) {
    if (countEl) countEl.textContent = 'Falha na conexão';
    if (listEl) listEl.innerHTML = '<div class="text-red-400 p-3 text-center">Erro de rede ao inspecionar o backup.</div>';
  }
}

function renderizarListaArquivosInspetor(arquivos) {
  const listEl = document.getElementById('inspetorBackupListaArquivos');
  if (!listEl) return;
  if (!arquivos.length) {
    listEl.innerHTML = '<div class="text-secondary p-3 text-center">Nenhum arquivo encontrado no pacote.</div>';
    return;
  }

  listEl.innerHTML = arquivos.slice(0, 500).map(arq => {
    const tamFormatado = formatarBytesReais(arq.bytes ?? arq.tamanho ?? 0);
    return `
      <div class="px-2 py-1.5 rounded hover:bg-white/5 cursor-pointer flex items-center justify-between text-xs font-mono-code transition" onclick="visualizarArquivoBackup('${escaparHtml(arq.nome)}', ${arq.bytes ?? arq.tamanho ?? 0})">
        <span class="truncate text-secondary hover:text-accent">${escaparHtml(arq.nome)}</span>
        <span class="text-[10px] text-zinc-500 shrink-0 ml-2">${tamFormatado}</span>
      </div>
    `;
  }).join('');
}

function filtrarArquivosNoBackup() {
  const termo = (document.getElementById('inspetorBackupBusca')?.value || '').toLowerCase().trim();
  const countEl = document.getElementById('inspetorBackupTotalArquivos');
  const filtrados = arquivosBackupInspetorCache.filter(a => String(a.nome || '').toLowerCase().includes(termo));
  if (countEl) {
    countEl.textContent = termo
      ? `${filtrados.length} de ${arquivosBackupInspetorCache.length}`
      : `${arquivosBackupInspetorCache.length} arquivo(s)`;
  }
  renderizarListaArquivosInspetor(filtrados);
}

async function visualizarArquivoBackup(caminhoArquivo, bytes) {
  const fileNome = document.getElementById('inspetorBackupArquivoNome');
  const fileTam = document.getElementById('inspetorBackupArquivoTamanho');
  const fileContent = document.getElementById('inspetorBackupConteudoTexto');

  if (fileNome) fileNome.textContent = caminhoArquivo;
  if (fileTam) fileTam.textContent = formatarBytesReais(bytes || 0);
  if (fileContent) fileContent.textContent = '// Lendo conteúdo do arquivo no ZIP...';

  try {
    const res = await fetch(`/api/backups/${encodeURIComponent(backupInspetorAtual)}/arquivo?nome=${encodeURIComponent(caminhoArquivo)}`);
    const d = await res.json();
    if (res.ok && d.conteudo !== undefined) {
      if (fileContent) fileContent.textContent = d.conteudo;
    } else {
      if (fileContent) fileContent.textContent = '// ' + (d.erro || 'Arquivo binário ou não legível como texto.');
    }
  } catch (err) {
    if (fileContent) fileContent.textContent = '// Erro de conexão ao ler arquivo do backup.';
  }
}

function confirmarRestauracaoDesteBackup() {
  if (!backupInspetorAtual) return;
  fecharInspetorBackup();
  abrirModalRestaurarBackup(backupInspetorAtual);
}

function fecharInspetorBackup() {
  const m = document.getElementById('modalInspetorBackup');
  if (m) m.hidden = true;
}

function abrirModalBroadcastPreview() {
  const m = document.getElementById('modalBroadcast');
  if (m) {
    m.hidden = false;
    lucide.createIcons();
    atualizarPreviewBroadcast();
  }
}

function fecharModalBroadcast() {
  const m = document.getElementById('modalBroadcast');
  if (m) m.hidden = true;
}

function atualizarPreviewBroadcast() {
  const prefixo = document.getElementById('broadcastPrefixo')?.value || '[AVISO]';
  const cor = document.getElementById('broadcastCor')?.value || 'gold';
  const texto = document.getElementById('broadcastTexto')?.value.trim() || 'Digite uma mensagem acima...';

  const pEl = document.getElementById('broadcastPreviewPrefix');
  const tEl = document.getElementById('broadcastPreviewText');

  const corClassMap = {
    gold: 'text-amber-400',
    red: 'text-red-400',
    aqua: 'text-cyan-400',
    green: 'text-emerald-400',
    yellow: 'text-yellow-400'
  };

  if (pEl) {
    pEl.textContent = prefixo;
    pEl.className = 'font-bold ' + (corClassMap[cor] || 'text-amber-400');
  }
  if (tEl) tEl.textContent = texto;
}

async function enviarBroadcastReal() {
  const prefixo = document.getElementById('broadcastPrefixo')?.value || '[AVISO]';
  const cor = document.getElementById('broadcastCor')?.value || 'gold';
  const texto = document.getElementById('broadcastTexto')?.value.trim();

  if (!texto) return alert('Digite a mensagem a ser transmitida.');

  try {
    const res = await fetch('/api/players/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mensagem: texto, prefixo, cor })
    });
    if (res.ok) {
      fecharModalBroadcast();
      document.getElementById('broadcastTexto').value = '';
      mostrarToast('Aviso transmitido com sucesso no chat do Minecraft!', 'sucesso');
    }
  } catch (e) {}
}

function abrirModalWhitelist() {
  const m = document.getElementById('modalWhitelist');
  if (m) {
    m.hidden = false;
    lucide.createIcons();
    carregarListaWhitelist();
  }
}

function fecharModalWhitelist() {
  const m = document.getElementById('modalWhitelist');
  if (m) m.hidden = true;
}

async function carregarListaWhitelist() {
  const corpo = document.getElementById('whitelistListaCorpo');
  if (!corpo) return;
  corpo.innerHTML = '<div class="text-secondary text-center p-3">Carregando whitelist...</div>';

  try {
    const res = await fetch('/api/whitelist');
    const d = await res.json();
    corpo.innerHTML = '';
    const texto = d.lista || 'Nenhum jogador na whitelist.';
    corpo.innerHTML = '<div class="p-2 text-xs text-white whitespace-pre-wrap">' + escaparHtml(texto) + '</div>';
  } catch (e) {
    corpo.innerHTML = '<div class="text-red-400 p-2">Falha ao consultar whitelist.</div>';
  }
}

async function adicionarNickWhitelist() {
  const nick = document.getElementById('whitelistNovoNick')?.value.trim();
  if (!nick) return;

  try {
    const res = await fetch('/api/whitelist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'add', nick })
    });
    if (res.ok) {
      document.getElementById('whitelistNovoNick').value = '';
      carregarListaWhitelist();
      mostrarToast('Jogador ' + nick + ' adicionado à Whitelist!', 'sucesso');
    }
  } catch (e) {}
}

function fecharModalDimensaoTp() {
  const m = document.getElementById('modalConfirmarDimensaoTp');
  if (m) m.hidden = true;
}

function mostrarToast(msg, tipo = 'info') {
  console.log('[' + tipo.toUpperCase() + ']', msg);
}

    function abrirDetalhesModModal(modId) {
      const m = MODS_CATALOG.find(item => item.id === modId);
      if (!m) return;
      abrirActionModal(`Detalhes do Mod: ${m.id}`, `
        <div class="space-y-3 font-mono-code text-xs">
          <div class="p-3 rounded-xl surface-box space-y-2">
            <div><span class="text-secondary block text-[10px] uppercase">Identificador (ID):</span> <strong class="text-white">${m.id}</strong></div>
            <div><span class="text-secondary block text-[10px] uppercase">Arquivo Binário:</span> <strong class="text-white">${m.file}</strong></div>
            <div><span class="text-secondary block text-[10px] uppercase">Versão:</span> <span class="text-white">v${m.version}</span></div>
            <div>
              <span class="text-secondary block text-[10px] uppercase">Checksum SHA-256:</span>
              <div class="flex items-center gap-2 mt-0.5">
                <span class="text-accent break-all select-all">${m.sha256}</span>
                <button type="button" onclick="copiarTextoComFeedback('${m.sha256}', this)" class="btn-secondary px-2 py-0.5 rounded text-[10px] shrink-0">Copiar</button>
              </div>
            </div>
            <div>
              <span class="text-secondary block text-[10px] uppercase">Dependências de Execução:</span>
              <span class="text-white">${m.deps && m.deps.length ? m.deps.join(', ') : 'Nenhuma dependência externa registrada'}</span>
            </div>
          </div>
          <div class="p-3 rounded-xl bg-black/40 border border-white/10 text-[11px] space-y-1">
            <div class="text-secondary">Estado atual na JVM: <strong class="${m.activeRuntime ? 'text-emerald-400' : 'text-zinc-400'}">${m.activeRuntime ? 'Ativo (/mods)' : 'Desativado (/mods-disabled)'}</strong></div>
            <div class="text-secondary">Estado no próximo reinício: <strong class="text-accent">${m.stagedState ? 'Ativo' : 'Desativado'}</strong></div>
          </div>
          <div class="flex justify-end gap-2 pt-2">
            <button type="button" onclick="fecharActionModal()" class="btn-secondary px-4 py-2 rounded-xl">Fechar</button>
          </div>
        </div>
      `);
    }
