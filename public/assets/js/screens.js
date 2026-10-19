/* Alento · conceitos de interface (telas de apresentação de marca, não funcionalidades comprovadas).
   Uso: <div class="phone" data-screen="home"></div> */
(function () {
  const A = window.Alento;

  // Ícones da barra de abas: desenhados com as próprias peças do símbolo
  const I = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="12" cy="7.5" r="2.6"/><path d="M4 16 C 8.5 13.6, 15.5 13.6, 20 16"/><path d="M8 20 C 10.5 19, 13.5 19, 16 20"/></svg>',
    plan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M4 8 C 8.5 5.6, 15.5 5.6, 20 8"/><path d="M4 13 C 8.5 10.6, 15.5 10.6, 20 13"/><path d="M4 18 C 8.5 15.6, 15.5 15.6, 20 18"/></svg>',
    breath: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M8 13.4 C 10 12.4, 14 12.4, 16 13.4"/></svg>',
    you: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="12" cy="8" r="3.4"/><path d="M5 19 C 8.5 15.6, 15.5 15.6, 19 19"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="#0A0F3C" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 12.5l3.2 3.2L17 9"/></svg>',
    play: '<svg viewBox="0 0 24 24"><path d="M9 7v10l8.5-5z" fill="#0A0F3C"/></svg>'
  };
  A.ICONS = I;

  // Textos traduzíveis (o site injeta A.L com o idioma escolhido; a apresentação usa o padrão em português)
  const L = (k, d) => (A.L && A.L[k]) || d;
  const tabbar = on => `<div class="tabbar">${[['home', L('tab.home', 'Início')], ['plan', L('tab.plan', 'Plano')], ['breath', L('tab.breath', 'Respirar')], ['you', L('tab.you', 'Você')]]
    .map(([k, l]) => `<span class="${k === on ? 'on' : ''}">${I[k]}${l}</span>`).join('')}</div>`;

  // Progresso como o sol caminhando sobre a curva do horizonte (proporções exatas do símbolo)
  function horizonProgress(p, { track = 'rgba(255,255,255,.22)', fill = '#FFFFFF', sun = A.C.mint } = {}) {
    const P = [[10, 60], [91, 23], [209, 23], [290, 60]];
    const b = (t, k) => (1 - t) ** 3 * P[0][k] + 3 * (1 - t) ** 2 * t * P[1][k] + 3 * (1 - t) * t ** 2 * P[2][k] + t ** 3 * P[3][k];
    const x = b(p, 0), y = b(p, 1);
    const d = 'M10 60 C 91 23, 209 23, 290 60';
    return `<svg viewBox="0 0 300 72" style="width:100%;display:block;margin:14px 0 8px;overflow:visible"><path d="${d}" fill="none" stroke="${track}" stroke-width="9" stroke-linecap="round"/><path d="${d}" pathLength="1" stroke-dasharray="${p} 1" fill="none" stroke="${fill}" stroke-width="9" stroke-linecap="round"/><circle cx="${x.toFixed(1)}" cy="${(y - 21).toFixed(1)}" r="11" fill="${sun}"/></svg>`;
  }
  A.horizonProgress = horizonProgress;

  const dot = (state, label = '') => {
    const s = { done: 'background:var(--mint)', today: 'border:2px solid var(--blue)', next: 'border:1.5px solid var(--line)', again: 'border:2px solid var(--wave);background:#F1F3FF' }[state];
    return `<span style="width:30px;height:30px;border-radius:50%;display:grid;place-items:center;flex:none;${s}">${state === 'done' ? `<span style="width:18px;height:18px">${I.check}</span>` : label}</span>`;
  };

  const S = {
    home: () => `
      <div class="ui" style="padding-bottom:100px">
        <div class="row" style="justify-content:space-between;align-items:center;margin-top:4px">
          <div style="width:94px">${A.logo('cor')}</div>
          <div style="width:36px;height:36px;border-radius:50%;background:var(--air);display:grid;place-items:center;font-weight:500;font-size:14px;color:var(--blue)">A</div>
        </div>
        <div style="margin-top:6px"><div class="cap">${L('ph.date', 'Quinta, 15 de outubro')}</div><h4 style="margin-top:8px">${L('ph.greet', 'Bom dia, Ana.')}</h4></div>
        <div class="ui-card ui-card--blue" style="padding:20px 20px 16px">
          <div class="row" style="justify-content:space-between;align-items:flex-start">
            <div><div style="font:400 66px/.88 var(--varela);letter-spacing:-.03em">12</div><div style="margin-top:8px;font-size:15px;color:var(--mist)">${L('ph.days', 'dias sem fumar')}</div></div>
            <span class="ui-chip" style="background:rgba(255,255,255,.14);color:#fff">${L('ph.week', 'Semana 2')}</span>
          </div>
          ${horizonProgress(.4)}
          <div class="row" style="justify-content:space-between;font-size:12px;color:var(--mist)"><span>${L('ph.start', 'Início')}</span><span>${L('ph.prog', '12 de 30 dias')}</span><span>${L('ph.end', 'Dia 30')}</span></div>
        </div>
        <div class="row" style="gap:10px">
          <div class="ui-card" style="flex:1"><div class="stat"><b>${L('ph.money', 'R$ 186')}</b><span>${L('ph.saved', 'economizados')}</span></div></div>
          <div class="ui-card" style="flex:1"><div class="stat"><b>144</b><span>${L('ph.avoided', 'cigarros evitados')}</span></div></div>
        </div>
        <div class="ui-card ui-card--line row" style="align-items:center;gap:14px">
          <div style="width:46px;height:46px;border-radius:50%;background:var(--mint);display:grid;place-items:center;flex:none"><span style="width:24px;height:24px">${I.play}</span></div>
          <div><h5>${L('ph.breath', 'Respiro de 1 minuto')}</h5><p style="font-size:13px;color:var(--muted);margin-top:3px">${L('ph.breathSub', 'Para quando a vontade apertar.')}</p></div>
        </div>
        <div class="ui-card" style="background:#F6F8FF"><div class="cap">${L('ph.tip', 'Dica de hoje')}</div><p style="margin-top:7px;font-size:14px">${L('ph.tipText', 'A vontade vem em ondas. Respire com ela, que ela passa.')}</p></div>
      </div>${tabbar('home')}`,

    plan: () => `
      <div class="ui">
        <div class="cap" style="margin-top:6px">Seu plano</div>
        <h4>Um plano no<br>seu ritmo.</h4>
        <p style="color:var(--muted);font-size:14px">Redução gradual até o seu Dia D. Dá para ajustar quando quiser.</p>
        <div class="ui-card ui-card--night" style="padding:18px 18px 20px">
          <div class="cap" style="color:var(--mist)">Seu Dia D</div>
          <div style="font:400 30px/1.1 var(--varela);margin-top:8px">3 de novembro</div>
          <div class="row" style="justify-content:space-between;margin-top:16px;font-size:11px;color:var(--mist)">
            ${['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map((d, k) => `<div class="col" style="align-items:center;gap:6px"><span style="width:26px;height:26px;border-radius:50%;${k < 4 ? 'background:var(--mint)' : k === 4 ? 'border:2px solid #fff' : 'border:1.5px solid rgba(185,200,255,.35)'}"></span>${d}</div>`).join('')}
          </div>
        </div>
        <div class="cap" style="margin-top:6px">Semana 2 · Reduzir</div>
        ${[['done', 'Adiar o primeiro cigarro em 30 minutos'], ['done', 'Trocar o cigarro do café por um respiro'], ['today', 'Caminhar 10 minutos depois do almoço'], ['next', 'Contar para alguém próximo sobre o Dia D']]
          .map(([s, t]) => `<div class="row" style="gap:12px;align-items:center;padding:4px 0;${s === 'done' ? 'color:var(--muted)' : ''}">${dot(s)}<span style="font-size:14.5px;${s === 'today' ? 'font-weight:500' : ''}">${t}</span></div>`).join('')}
      </div>${tabbar('plan')}`,

    progress: () => `
      <div class="ui">
        <div class="cap" style="margin-top:6px">Progresso</div>
        <h4>12 dias</h4>
        <p style="color:var(--muted);font-size:14px;margin-top:-6px">Seu melhor trecho até agora.</p>
        <div class="ui-card ui-card--line" style="padding:16px">
          <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:8px;justify-items:center">
            ${Array.from({ length: 28 }, (_, k) => k < 3 ? dot('done') : k === 3 ? dot('again') : k < 13 ? dot('done') : k === 13 ? dot('today') : dot('next')).join('')}
          </div>
          <div class="row" style="gap:16px;margin-top:14px;font-size:11.5px;color:var(--muted)"><span class="row" style="gap:6px;align-items:center"><i class="swatch-chip" style="background:var(--mint);width:10px;height:10px"></i>Sem fumar</span><span class="row" style="gap:6px;align-items:center"><i class="swatch-chip" style="border:2px solid var(--wave);width:10px;height:10px"></i>Recomeço</span></div>
        </div>
        ${[['Economia', 'R$ 186'], ['Cigarros evitados', '144'], ['Respiros guiados', '21']].map(([k, v]) => `<div class="row" style="justify-content:space-between;align-items:baseline;border-bottom:1px solid var(--line);padding:9px 2px"><span style="font-size:14px;color:var(--muted)">${k}</span><span style="font:400 22px/1 var(--varela)">${v}</span></div>`).join('')}
      </div>${tabbar('you')}`,

    wins: () => `
      <div class="ui">
        <div class="cap" style="margin-top:6px">Conquistas</div>
        <h4>Pequenas vitórias,<br>todo dia.</h4>
        <div class="ui-card ui-card--blue row" style="gap:16px;align-items:center;padding:18px">
          <div style="width:74px;height:74px;border-radius:50%;background:var(--mint);color:var(--night);display:grid;place-items:center;font:400 34px/1 var(--varela);flex:none">7</div>
          <div><h5>Uma semana inteira.</h5><p style="font-size:13.5px;color:var(--mist);margin-top:4px">Seu fôlego já sentiu.</p></div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px 8px;margin-top:6px;text-align:center">
          ${[['1', 'dia', 1], ['3', 'dias', 1], ['7', 'dias', 1], ['14', 'dias', 0], ['30', 'dias', 0], ['90', 'dias', 0]].map(([n, l, on]) => `<div class="col" style="align-items:center;gap:7px"><div style="width:66px;height:66px;border-radius:50%;display:grid;place-items:center;font:400 24px/1 var(--varela);${on ? 'background:var(--air);color:var(--blue);box-shadow:inset 0 0 0 3px var(--mint)' : 'border:1.5px dashed var(--line);color:#A6ADD4'}">${n}</div><span style="font-size:12px;color:var(--muted)">${n} ${l}</span></div>`).join('')}
        </div>
        <div class="ui-btn ui-btn--ghost" style="border:1.5px solid var(--line);margin-top:auto;margin-bottom:84px">Contar para alguém</div>
      </div>${tabbar('you')}`,

    daily: () => `
      <div class="ui" style="padding:66px 26px 44px;justify-content:space-between">
        <div class="row" style="justify-content:space-between;align-items:center"><div style="width:92px">${A.logo('branco')}</div><span style="font-size:22px;color:var(--mist)">×</span></div>
        <div class="col" style="gap:22px">
          <div class="breathe" style="width:150px;transform-origin:50% 60%">${A.symbol('branco')}</div>
          <div class="cap" style="color:var(--mint)">Incentivo do dia · Dia 13</div>
          <div style="font:400 33px/1.18 var(--varela);letter-spacing:-.01em">Você não precisa vencer o dia todo. Só os próximos minutos.</div>
        </div>
        <div class="col" style="gap:8px"><div class="ui-btn ui-btn--mint">Respirar comigo · 1 min</div><div class="ui-btn" style="background:transparent;color:var(--mist)">Agora não</div></div>
      </div>`,

    onb1: () => `
      <div class="ui" style="padding:120px 28px 44px;justify-content:space-between">
        <div class="draw" style="width:200px;--d:.6s">${A.symbol('branco')}</div>
        <div class="col" style="gap:14px">
          <div style="font:400 44px/1.02 var(--varela);letter-spacing:-.02em">Respire<br>de novo.</div>
          <p style="color:var(--mist);font-size:16px">Um app para largar o cigarro no seu ritmo, um dia de cada vez.</p>
        </div>
        <div class="col" style="gap:8px"><div class="ui-btn ui-btn--mint">Começar</div><div class="ui-btn" style="background:transparent;color:#fff">Já tenho conta</div></div>
      </div>`,

    onb2: () => `
      <div class="ui" style="padding:70px 28px 44px">
        <div style="height:340px;margin:0 -28px;background:var(--air);position:relative;overflow:hidden">
          <svg viewBox="0 0 390 340" style="position:absolute;inset:0;width:100%;height:100%">
            <circle cx="195" cy="128" r="46" fill="#3EE0B5"/>
            <path d="M58 248 C 137 212, 253 212, 332 248" fill="none" stroke="#1E3FFF" stroke-width="40" stroke-linecap="round"/>
            <path d="M115 306 C 166 288, 224 288, 275 306" fill="none" stroke="#8E9DFF" stroke-width="40" stroke-linecap="round"/>
          </svg>
        </div>
        <div class="col" style="gap:12px;margin-top:24px">
          <h4>Sem julgamento.</h4>
          <p style="color:var(--muted);font-size:16px">Recaída faz parte do caminho. Aqui, a gente recomeça junto.</p>
        </div>
        <div class="row" style="gap:6px;margin-top:auto;margin-bottom:18px"><i style="width:22px;height:6px;border-radius:3px;background:var(--blue)"></i><i style="width:6px;height:6px;border-radius:3px;background:var(--line)"></i><i style="width:6px;height:6px;border-radius:3px;background:var(--line)"></i></div>
        <div class="ui-btn">Continuar</div>
      </div>`,

    onb3: () => `
      <div class="ui" style="padding:66px 24px 44px;gap:18px">
        <div class="row" style="justify-content:space-between;align-items:center"><div style="width:96px">${A.logo('cor')}</div><span style="color:var(--muted);font-size:14px">3/18</span></div>
        <div class="ui-progress"><b style="width:17%"></b></div>
        <div style="font:400 29px/1.18 var(--varela);margin-top:10px">Há quanto tempo você fuma?</div>
        <p style="color:var(--muted);font-size:15px">Sem julgamento. Isso só ajuda a montar um plano no seu ritmo.</p>
        <div class="col" style="gap:10px">
          <div class="ui-opt">Menos de 1 ano</div><div class="ui-opt is-on">De 1 a 5 anos</div><div class="ui-opt">De 5 a 10 anos</div><div class="ui-opt">Mais de 10 anos</div>
        </div>
        <div class="ui-btn" style="margin-top:auto">Continuar</div>
      </div>`,

    onb4: () => `
      <div class="ui" style="padding:80px 26px 44px;gap:18px">
        <div style="width:64px;height:64px;border-radius:50%;background:var(--mint)"></div>
        <div style="font:400 38px/1.05 var(--varela);letter-spacing:-.02em">Seu plano<br>está pronto.</div>
        <p style="color:var(--muted);font-size:15px">Feito a partir das suas respostas. Dá para mudar tudo depois.</p>
        <div class="ui-card" style="background:#fff;padding:6px 18px">
          ${[['Seu Dia D', '3 de novembro'], ['Redução gradual', '18 dias'], ['Respiros guiados', '3 por dia']].map(([k, v], n) => `<div class="row" style="justify-content:space-between;align-items:baseline;padding:14px 0;${n < 2 ? 'border-bottom:1px solid var(--line)' : ''}"><span style="font-size:14px;color:var(--muted)">${k}</span><span style="font:400 19px/1 var(--varela)">${v}</span></div>`).join('')}
        </div>
        <div class="ui-btn" style="margin-top:auto">Ver meu plano</div>
      </div>`,

    appstore: () => `
      <div class="ui" style="padding:62px 20px 30px;gap:16px">
        <div style="font-size:15px;color:var(--blue)">‹ Buscar</div>
        <div class="row" style="gap:16px;align-items:center">
          <div style="width:104px;height:104px;flex:none">${A.icon('mint')}</div>
          <div class="col" style="gap:4px;flex:1">
            <div style="font:600 22px/1.1 var(--figtree)">Alento</div>
            <div style="font-size:14px;color:var(--muted)">Respire de novo.</div>
            <div class="row" style="margin-top:10px;align-items:center;gap:10px"><span class="store-btn" style="background:var(--blue);color:#fff">Obter</span><span style="font-size:11px;color:var(--muted)">Compras no app</span></div>
          </div>
        </div>
        <div class="row" style="justify-content:space-between;border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:10px 4px;font-size:11px;color:var(--muted);text-align:center">
          <span>CATEGORIA<br><b style="font:500 14px/2 var(--figtree);color:var(--night)">Saúde</b></span><span>IDIOMA<br><b style="font:500 14px/2 var(--figtree);color:var(--night)">PT</b></span><span>DESENVOLVEDOR<br><b style="font:500 14px/2 var(--figtree);color:var(--night)">Alento</b></span>
        </div>
        <div class="row" style="gap:9px">${A.shot('a')}${A.shot('b')}${A.shot('c')}</div>
        <p style="font-size:13.5px;color:var(--night)">Pare de fumar no seu ritmo, um dia de cada vez. Um plano feito para você, com acolhimento e sem julgamentos.</p>
      </div>`,

    play: () => `
      <div class="ui" style="padding:62px 20px 30px;gap:16px">
        <div class="row" style="justify-content:space-between;font-size:18px;color:var(--muted)"><span>←</span><span>⋮</span></div>
        <div class="row" style="gap:16px;align-items:center">
          <div style="width:84px;height:84px;flex:none">${A.icon('mint')}</div>
          <div class="col" style="gap:4px"><div style="font:500 23px/1.1 var(--figtree)">Alento</div><div style="font-size:13px;color:var(--blue);font-weight:500">Alento</div><div style="font-size:12px;color:var(--muted)">Contém compras no app</div></div>
        </div>
        <div class="store-btn" style="background:var(--blue);color:#fff;padding:13px;border-radius:24px">Instalar</div>
        <div class="row" style="gap:9px">${A.shot('b')}${A.shot('c')}${A.shot('a')}</div>
        <div style="font:500 16px/1 var(--figtree);margin-top:2px">Sobre este app <span style="color:var(--muted)">›</span></div>
        <p style="font-size:13.5px;color:var(--muted)">Um plano no seu ritmo para parar de fumar. Respiros guiados, pequenas conquistas e incentivo todo dia.</p>
        <div class="row" style="gap:8px"><span class="ui-chip" style="border:1px solid var(--line);background:#fff;color:var(--night)">Saúde</span><span class="ui-chip" style="border:1px solid var(--line);background:#fff;color:var(--night)">Hábitos</span></div>
      </div>`,

    profile: () => `
      <div class="ui" style="padding:60px 0 0;gap:0;font-size:13px">
        <div class="row" style="justify-content:space-between;align-items:center;padding:0 18px 12px;font:600 18px/1 var(--figtree)"><span>alento</span><span style="font-size:20px">≡</span></div>
        <div class="row" style="align-items:center;gap:22px;padding:4px 18px 12px">
          <div style="width:86px;height:86px;border-radius:50%;padding:3px;background:conic-gradient(var(--mint),var(--blue),var(--wave),var(--mint));flex:none"><div style="width:100%;height:100%;border-radius:50%;border:3px solid #fff;overflow:hidden">${A.icon('mint')}</div></div>
          <div class="row" style="flex:1;justify-content:space-around;text-align:center">${['publicações', 'seguidores', 'seguindo'].map(l => `<div><b style="display:block;font:600 17px/1.4 var(--figtree)">—</b><span style="font-size:12px">${l}</span></div>`).join('')}</div>
        </div>
        <div style="padding:0 18px 12px;line-height:1.45"><b style="font-weight:600">Alento</b><br>Respire de novo.<br>Um app para largar o cigarro no seu ritmo, um dia de cada vez.<br><span style="color:var(--blue)">alento.app</span></div>
        <div class="row" style="gap:6px;padding:0 18px 14px"><span class="ui-btn" style="flex:1;padding:9px;font-size:13px;border-radius:9px">Seguir</span><span class="ui-btn" style="flex:1;padding:9px;font-size:13px;border-radius:9px;background:var(--air);color:var(--night)">Mensagem</span></div>
        <div class="row" style="gap:14px;padding:0 18px 14px">${[['Comece', 'sun'], ['Respiros', 'breath'], ['Dicas', 'h'], ['Histórias', 'you'], ['Programas', 'prog']].map(([l, k]) => `<div class="col" style="align-items:center;gap:6px;font-size:11px"><div style="width:58px;height:58px;border-radius:50%;border:1.5px solid var(--line);padding:3px"><div style="width:100%;height:100%;border-radius:50%;background:${k === 'sun' ? 'var(--blue)' : k === 'breath' ? 'var(--air)' : k === 'h' ? 'var(--night)' : k === 'you' ? 'var(--mint)' : 'var(--air)'};display:grid;place-items:center;color:${k === 'h' || k === 'sun' ? '#fff' : 'var(--blue)'}"><span style="width:24px;height:24px">${k === 'sun' ? '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="6" fill="#3EE0B5"/></svg>' : k === 'prog' ? '<svg viewBox="0 0 24 24"><circle cx="7" cy="12" r="3" fill="#3EE0B5"/><circle cx="12" cy="12" r="3" fill="#9B8CFF"/><circle cx="17" cy="12" r="3" fill="#FF7A59"/></svg>' : I[k === 'h' ? 'home' : k]}</span></div></div>${l}</div>`).join('')}</div>
        <div class="row" style="border-top:1px solid var(--line);justify-content:space-around;padding:9px 0;color:var(--muted)"><span style="width:22px;height:22px;color:var(--night)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 9.3h16M4 14.7h16M9.3 4v16M14.7 4v16"/></svg></span><span style="width:22px;height:22px"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="3" width="14" height="18" rx="3"/><path d="M10 9.5v5l4-2.5z" fill="currentColor"/></svg></span></div>
        <div class="ig-grid">
          <div class="ig ig-blue"><span>Respire<br>de novo.</span></div>
          <div class="ig" data-asset="IMG_011_FREEDOM" data-ph="compact"></div>
          <div class="ig ig-pattern" data-pattern="waves" data-w="300" data-h="400" data-opts='{"scale":.7,"bg":"#EEF3FF","stroke":"#1E3FFF"}'></div>
          <div class="ig" data-asset="IMG_013_STILLNESS" data-ph="compact"></div>
          <div class="ig ig-mint"><span>Um dia<br>de cada vez.</span></div>
          <div class="ig" data-asset="IMG_008_SOCIAL_CAMPAIGN" data-ph="compact"></div>
          <div class="ig ig-pattern" data-pattern="crop" data-w="300" data-h="400" data-opts='{"k":7,"x":200,"y":300}'></div>
          <div class="ig" data-asset="IMG_014_SELFCARE" data-ph="compact"></div>
          <div class="ig" data-pattern="symbols" data-w="300" data-h="300" data-opts='{"cell":90}'></div>
        </div>
      </div>`
  };

  // Screenshots de loja (miniaturas em HTML)
  A.shot = k => {
    const v = {
      a: ['var(--blue)', '#fff', 'Um plano no<br>seu ritmo.', 'home'],
      b: ['var(--air)', 'var(--night)', 'Cada dia<br>conta.', 'progress'],
      c: ['var(--night)', '#fff', 'Respire<br>comigo.', 'daily']
    }[k];
    return `<div style="width:110px;height:238px;flex:none;border-radius:14px;background:${v[0]};color:${v[1]};padding:14px 12px 0;overflow:hidden;display:flex;flex-direction:column;gap:12px"><div style="font:400 15px/1.08 var(--varela)">${v[2]}</div><div style="flex:1;border-radius:16px 16px 0 0;background:${k === 'c' ? 'var(--blue)' : '#fff'};box-shadow:0 0 0 4px ${k === 'b' ? '#fff' : 'rgba(255,255,255,.18)'};padding:12px 9px;display:flex;flex-direction:column;gap:7px">${
      k === 'a' ? `<div style="height:8px;width:50%;border-radius:4px;background:var(--line)"></div><div style="border-radius:10px;background:var(--blue);padding:9px 8px 4px"><div style="font:400 20px/1 var(--varela);color:#fff">12</div>${horizonProgress(.4)}</div><div class="row" style="gap:5px"><i style="flex:1;height:30px;border-radius:7px;background:var(--air)"></i><i style="flex:1;height:30px;border-radius:7px;background:var(--air)"></i></div>`
      : k === 'b' ? `<div style="font:400 18px/1 var(--varela);color:var(--night)">12 dias</div><div style="display:grid;grid-template-columns:repeat(5,1fr);gap:5px">${Array.from({ length: 15 }, (_, n) => `<i style="aspect-ratio:1;border-radius:50%;${n < 12 ? 'background:var(--mint)' : 'border:1px solid var(--line)'}"></i>`).join('')}</div>`
      : `<div style="width:56px;margin:12px auto 0">${A.symbol('branco')}</div><div style="height:22px;border-radius:11px;background:var(--mint);margin-top:auto;margin-bottom:12px"></div>`
    }</div></div>`;
  };

  const BLUE = { onb1: 1, daily: 1 };
  A.hydrateScreens = (root = document) => {
    root.querySelectorAll('[data-screen]').forEach(el => {
      const k = el.dataset.screen;
      if (!S[k]) return;
      el.innerHTML = `<div class="phone__screen${BLUE[k] ? ' on-blue-screen' : ''}" style="${BLUE[k] ? 'background:var(--blue);color:#fff' : k === 'onb4' ? 'background:var(--air)' : ''}"><div class="phone__island"></div><div class="status"><span>9:41</span><i></i></div>${S[k]()}<div class="home-ind"></div></div>`;
    });
  };
})();
