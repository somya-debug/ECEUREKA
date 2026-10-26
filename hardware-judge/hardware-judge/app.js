'use strict';
(function () {
  var app = document.getElementById('app');

  /* ---------- helpers ---------- */
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function md(s) { return esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\*([^*]+)\*/g, '<i>$1</i>'); }
  function stars(n) { var s = ''; for (var i = 1; i <= 3; i++) s += i <= n ? '★' : '<span class="off">★</span>'; return '<span class="stars">' + s + '</span>'; }

  /* ---------- submissions ---------- */
  function allSubs() { return store.get('cc.subs', []); }
  function bestFor(pid) {
    var best = null;
    allSubs().forEach(function (s) { if (s.pid === pid && s.verdict === 'Accepted' && (!best || s.score > best.score)) best = s; });
    return best;
  }

  /* ---------- part definitions & geometry ---------- */
  var PART_DEFS = {
    LED: { label: 'LED', pins: { A: [-28, 0], K: [28, 0] }, pl: { A: 'A', K: 'K' } },
    RES: { label: 'Resistor', pins: { '1': [-28, 0], '2': [28, 0] }, pl: { '1': '1', '2': '2' } },
    BTN: { label: 'Push button', pins: { '1': [-28, 0], '2': [28, 0] }, pl: { '1': '1', '2': '2' } },
    BUZ: { label: 'Buzzer', pins: { A: [-28, 0], K: [28, 0] }, pl: { A: '+', K: '−' } }
  };
  var MCU_PINS = ['D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'D10', 'D11', 'D12', 'D13', '5V', 'GND'];
  var MCU_X = 150, MCU_Y0 = 62, MCU_DY = 24;
  var WIRE_COLORS = ['#58a6ff', '#f5a524', '#3fb950', '#f778ba', '#bc8cff', '#39d0d6', '#ff7b72'];

  function partBody(type) {
    switch (type) {
      case 'LED': return '<polyline class="body" points="-28,0 -10,0"/><polygon class="body" points="-10,-12 -10,12 10,0"/><polyline class="body" points="10,-12 10,12"/><polyline class="body" points="10,0 28,0"/>' +
        '<polyline class="body" points="2,-14 8,-22" style="stroke:#f5a524"/><polyline class="body" points="8,-14 14,-22" style="stroke:#f5a524"/>';
      case 'RES': return '<polyline class="body" points="-28,0 -16,0 -12,-8 -6,8 0,-8 6,8 12,-8 16,0 28,0"/>';
      case 'BTN': return '<polyline class="body" points="-28,0 -10,0"/><polyline class="body" points="-10,0 10,-13"/><polyline class="body" points="10,0 28,0"/><polyline class="body" points="-4,-18 4,-18" /><polyline class="body" points="0,-18 0,-10"/>';
      case 'BUZ': return '<polyline class="body" points="-28,0 -14,0"/><circle class="body" r="14" cx="0" cy="0"/><polyline class="body" points="14,0 28,0"/><text x="0" y="5" text-anchor="middle" style="fill:#c9d1d9;font:14px sans-serif">♪</text>';
    }
    return '';
  }

  /* ---------- editor state ---------- */
  var S = null, drag = null, board = null;

  function mcuPinPos(name) { return [MCU_X, MCU_Y0 + MCU_PINS.indexOf(name) * MCU_DY]; }
  function partById(id) { return S.parts.filter(function (p) { return p.id === id; })[0]; }
  function pinPos(key) {
    var i = key.indexOf('.'), owner = key.slice(0, i), pin = key.slice(i + 1);
    if (owner === 'mcu') return mcuPinPos(pin);
    var p = partById(owner), d = PART_DEFS[p.type].pins[pin];
    return [p.x + d[0], p.y + d[1]];
  }
  function countType(t) { return S.parts.filter(function (p) { return p.type === t; }).length; }
  function nextId(t) { var n = 1; while (partById(t + n)) n++; return t + n; }

  function save() { store.set('cc.p.' + S.problem.id, { parts: S.parts, wires: S.wires, code: S.code }); }

  function draw() {
    var s = '<rect class="mcu" x="20" y="20" width="130" height="' + (MCU_Y0 + 13 * MCU_DY + 30 - 20) + '" rx="10"/>' +
      '<text class="mcu-title" x="85" y="42" text-anchor="middle">ARDUINO UNO</text>';
    MCU_PINS.forEach(function (n) {
      var xy = mcuPinPos(n), key = 'mcu.' + n;
      s += '<text class="pinlbl" x="' + (MCU_X - 14) + '" y="' + (xy[1] + 4) + '" text-anchor="end">' + n + '</text>' +
        '<g class="pin' + (S.pending === key ? ' pending' : '') + '" data-pin="' + key + '"><circle cx="' + xy[0] + '" cy="' + xy[1] + '" r="6"/></g>';
    });
    S.wires.forEach(function (w, i) {
      var a = pinPos(w[0]), b = pinPos(w[1]), dir = b[0] >= a[0] ? 1 : -1, dx = Math.max(40, Math.abs(b[0] - a[0]) / 2);
      var d = 'M' + a[0] + ' ' + a[1] + ' C' + (a[0] + dir * dx) + ' ' + a[1] + ' ' + (b[0] - dir * dx) + ' ' + b[1] + ' ' + b[0] + ' ' + b[1];
      s += '<g class="w" data-wire="' + i + '"><path class="wire" stroke="' + WIRE_COLORS[i % WIRE_COLORS.length] + '" d="' + d + '"/><path class="wire-hit" d="' + d + '"/></g>';
    });
    S.parts.forEach(function (p) {
      var def = PART_DEFS[p.type];
      s += '<g class="part' + (S.sel === p.id ? ' sel' : '') + '" transform="translate(' + p.x + ',' + p.y + ')" data-part="' + p.id + '">' +
        '<rect class="hit" x="-36" y="-30" width="72" height="56" rx="6"/>' + partBody(p.type) +
        '<text class="name" x="0" y="-34">' + p.id + '</text>';
      Object.keys(def.pins).forEach(function (pn) {
        var d = def.pins[pn], key = p.id + '.' + pn;
        s += '<g class="pin' + (S.pending === key ? ' pending' : '') + '" data-pin="' + key + '"><circle cx="' + d[0] + '" cy="' + d[1] + '" r="6"/></g>' +
          '<text class="plbl" x="' + d[0] + '" y="' + (d[1] + 20) + '" text-anchor="middle">' + def.pl[pn] + '</text>';
      });
      s += '</g>';
    });
    board.innerHTML = s;
    var used = document.getElementById('used');
    if (used) used.textContent = S.parts.length;
    var pal = document.querySelectorAll('[data-add]');
    Array.prototype.forEach.call(pal, function (b) {
      var t = b.getAttribute('data-add');
      b.disabled = countType(t) >= S.problem.limits[t];
      b.querySelector('.count').textContent = countType(t) + '/' + S.problem.limits[t];
    });
    document.getElementById('del').disabled = !S.sel;
  }
  function changed() { save(); draw(); }

  function svgPoint(e) {
    var pt = board.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    return pt.matrixTransform(board.getScreenCTM().inverse());
  }
  function clickPin(key) {
    if (!S.pending) { S.pending = key; draw(); return; }
    if (S.pending === key) { S.pending = null; draw(); return; }
    var a = S.pending, dup = S.wires.some(function (w) { return (w[0] === a && w[1] === key) || (w[0] === key && w[1] === a); });
    if (!dup) S.wires.push([a, key]);
    S.pending = null; changed();
  }
  function deleteSel() {
    if (!S || !S.sel) return;
    var id = S.sel;
    S.parts = S.parts.filter(function (p) { return p.id !== id; });
    S.wires = S.wires.filter(function (w) { return w[0].split('.')[0] !== id && w[1].split('.')[0] !== id; });
    S.sel = null; changed();
  }
  document.addEventListener('keydown', function (e) {
    if (!S) return;
    if (e.target && e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'Delete' || e.key === 'Backspace') { deleteSel(); e.preventDefault(); }
    if (e.key === 'Escape') { S.pending = null; draw(); }
  });

  /* ---------- running the judge ---------- */
  function runJudge(job) {
    return new Promise(function (resolve) {
      var src = 'var pressedAt=' + pressedAt.toString() + ';\nvar judge=' + judge.toString() + ';\nonmessage=function(e){postMessage(judge(e.data));};';
      var w = null, timer = null;
      try {
        w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
      } catch (e) {
        // fallback (no timeout protection): run inline
        try { resolve(judge(job)); } catch (err) { resolve({ verdict: 'Runtime Error', issues: [String(err)], warnings: [], tests: [], used: job.circuit.parts.length }); }
        return;
      }
      timer = setTimeout(function () {
        w.terminate();
        resolve({ verdict: 'Time Limit Exceeded', issues: ['Your firmware ran too long without returning (infinite loop?).'], warnings: [], tests: [], used: job.circuit.parts.length });
      }, 8000);
      w.onmessage = function (e) { clearTimeout(timer); w.terminate(); resolve(e.data); };
      w.onerror = function (e) { clearTimeout(timer); w.terminate(); resolve({ verdict: 'Runtime Error', issues: [String(e.message || 'Worker error')], warnings: [], tests: [], used: job.circuit.parts.length }); };
      w.postMessage(job);
    });
  }

  function timelineSvg(tl) {
    var W = 516, X0 = 46, rowH = 16, rows = [], dur = tl.duration;
    if (tl.input && tl.input.windows) rows.push({ label: 'BTN', cls: 'inp', iv: tl.input.windows });
    Object.keys(tl.leds).forEach(function (id) { rows.push({ label: id, cls: 'on', iv: tl.leds[id] }); });
    var h = rows.length * rowH + 16, s = '<svg class="tline" viewBox="0 0 ' + (X0 + W) + ' ' + h + '">';
    rows.forEach(function (r, i) {
      var y = i * rowH;
      s += '<text x="0" y="' + (y + 11) + '">' + r.label + '</text><rect class="track" x="' + X0 + '" y="' + (y + 1) + '" width="' + W + '" height="' + (rowH - 4) + '" rx="2"/>';
      r.iv.forEach(function (iv) {
        var x = X0 + iv[0] / dur * W, w = Math.max(1, (iv[1] - iv[0]) / dur * W);
        s += '<rect class="' + r.cls + '" x="' + x.toFixed(1) + '" y="' + (y + 1) + '" width="' + w.toFixed(1) + '" height="' + (rowH - 4) + '"/>';
      });
    });
    var ay = rows.length * rowH + 10;
    s += '<text x="' + X0 + '" y="' + ay + '">0</text><text x="' + (X0 + W / 2) + '" y="' + ay + '" text-anchor="middle">' + (dur / 2) + 'ms</text><text x="' + (X0 + W) + '" y="' + ay + '" text-anchor="end">' + dur + 'ms</text></svg>';
    return s;
  }

  function showResult(r, submit) {
    var p = S.problem, el = document.getElementById('result');
    var ok = r.verdict === 'Accepted';
    var score = ok ? scoreFor(r.used, p.ref) : 0, rating = ok ? ratingFor(score) : 0;
    var h = '<div class="verdict ' + (ok ? 'ok' : 'bad') + '">' + esc(r.verdict) + '</div>';
    if (!submit) h += '<div class="hint">Practice run — not saved to your submissions.</div>';
    h += '<div class="stats"><div class="stat"><b>' + r.used + '</b><span>Components used</span></div>';
    if (ok) {
      h += '<div class="stat"><b>' + p.ref + '</b><span>Optimal</span></div><div class="stat"><b>' + score + '%</b><span>Score</span></div><div class="stat"><b>' + stars(rating) + '</b><span>Rating</span></div>';
    }
    h += '</div>';
    if (ok && r.used < p.ref) h += '<p class="v-ok">You beat the reference solution — tell the problem setter!</p>';
    if (ok && r.used > p.ref) h += '<p class="hint">A solution with ' + p.ref + ' components exists. Can you remove ' + (r.used - p.ref) + '?</p>';
    (r.issues || []).forEach(function (m) { h += '<p class="v-bad">' + esc(m) + '</p>'; });
    (r.warnings || []).forEach(function (m) { h += '<p class="warn">⚠ ' + esc(m) + '</p>'; });
    if (r.tests.length) {
      h += '<ul class="tests">';
      r.tests.forEach(function (t, i) {
        h += '<li><span class="' + (t.pass ? 'ok' : 'no') + '">' + (t.pass ? '✔' : '✘') + '</span> ' + (t.hidden ? 'Hidden test ' + (i + 1) : esc(t.name));
        if (!t.pass && t.message) h += '<small>' + esc(t.message) + '</small>';
        if (!t.hidden) h += timelineSvg(t.timeline);
        h += '</li>';
      });
      h += '</ul>';
    }
    el.innerHTML = h; el.hidden = false;
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    if (submit) {
      var subs = allSubs();
      subs.unshift({ pid: p.id, ts: Date.now(), verdict: r.verdict, used: r.used, score: score });
      store.set('cc.subs', subs.slice(0, 200));
      renderSubs();
    }
  }

  function renderSubs() {
    var el = document.getElementById('subs'), mine = allSubs().filter(function (s) { return s.pid === S.problem.id; }).slice(0, 6);
    if (!mine.length) { el.innerHTML = '<span class="hint">No submissions yet.</span>'; return; }
    el.innerHTML = '<table class="subs">' + mine.map(function (s) {
      return '<tr><td class="' + (s.verdict === 'Accepted' ? 'v-ok' : 'v-bad') + '">' + esc(s.verdict) + '</td><td>' + s.used + ' parts</td><td>' + (s.verdict === 'Accepted' ? s.score + '%' : '—') +
        '</td><td class="hint">' + new Date(s.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + '</td></tr>';
    }).join('') + '</table>';
  }

  function run(submit) {
    var p = S.problem, btns = document.querySelectorAll('[data-run]');
    var job = {
      circuit: { parts: S.parts.map(function (x) { return { id: x.id, type: x.type }; }), wires: S.wires },
      code: S.code, limits: p.limits,
      tests: p.tests.map(function (t) { return { name: t.name, hidden: !!t.hidden, duration: t.duration, input: t.input || null, check: t.check.toString() }; })
    };
    Array.prototype.forEach.call(btns, function (b) { b.disabled = true; });
    var el = document.getElementById('result'); el.hidden = false; el.innerHTML = '<span class="hint">Judging…</span>';
    runJudge(job).then(function (r) {
      Array.prototype.forEach.call(btns, function (b) { b.disabled = false; });
      showResult(r, submit);
    });
  }

  /* ---------- pages ---------- */
  function renderList() {
    S = null;
    var solved = PROBLEMS.filter(function (p) { return bestFor(p.id); }).length;
    var h = '<h1>Problems</h1><p class="sub">Build the circuit with as few parts as you can, program the board, and get rated. ' + solved + ' / ' + PROBLEMS.length + ' solved.</p>' +
      '<table class="list"><thead><tr><th>#</th><th>Title</th><th>Difficulty</th><th>Parts provided</th><th>Your best</th></tr></thead><tbody>';
    PROBLEMS.forEach(function (p, i) {
      var b = bestFor(p.id), total = Object.keys(p.limits).reduce(function (a, k) { return a + p.limits[k]; }, 0);
      h += '<tr><td>' + (i + 1) + '</td><td><a href="#/p/' + p.id + '">' + esc(p.title) + '</a></td><td><span class="chip ' + p.difficulty + '">' + p.difficulty + '</span></td><td>' + total + '</td>' +
        '<td>' + (b ? '<span class="solved">✔</span> ' + b.used + ' parts · ' + b.score + '% ' + stars(ratingFor(b.score)) : '<span class="hint">—</span>') + '</td></tr>';
    });
    app.innerHTML = h + '</tbody></table>';
  }

  function renderProblem(p) {
    var saved = store.get('cc.p.' + p.id, null);
    S = { problem: p, parts: saved ? saved.parts : [], wires: saved ? saved.wires : [], code: saved ? saved.code : p.starter, sel: null, pending: null };
    var types = Object.keys(p.limits).filter(function (t) { return p.limits[t] > 0; });
    var h = '<div class="problem"><div>' +
      '<div class="card"><a href="#/">← All problems</a><h1 style="margin-top:8px">' + esc(p.title) + '</h1><span class="chip ' + p.difficulty + '">' + p.difficulty + '</span><div style="height:12px"></div>' +
      p.statement.map(function (x) { return '<p>' + md(x) + '</p>'; }).join('') +
      '<h2>Parts provided</h2><div class="parts-list">' + types.map(function (t) { return '<span>' + p.limits[t] + ' × ' + PART_DEFS[t].label + '</span>'; }).join('') + '</div>' +
      '<p class="hint" style="margin-top:12px">Pins: digital 2–13, 5V, GND. Score = optimal parts ÷ your parts (max 100%). Wires are free.</p></div>' +
      '<div class="card"><h2>Your submissions</h2><div id="subs"></div></div></div>' +
      '<div><div class="card"><h2>Circuit</h2><div class="bar">' +
      types.map(function (t) { return '<button data-add="' + t + '">+ ' + PART_DEFS[t].label + ' <span class="count"></span></button>'; }).join('') +
      '<span class="grow"></span><span class="hint">Parts used: <b id="used">0</b></span>' +
      '<button id="del" class="danger">Delete part</button><button id="clearw">Clear wires</button><button id="resetc">Reset</button></div>' +
      '<svg id="board" class="board" viewBox="0 0 720 440"></svg>' +
      '<div class="hint">Click a pin, then another pin to connect them. Click a wire to remove it. Drag parts to move; select + Delete to remove.</div></div>' +
      '<div class="card"><h2>Firmware <span class="hint">(JavaScript with the Arduino API: pinMode, digitalWrite, digitalRead, delay, millis, setup/loop)</span></h2>' +
      '<textarea id="code" class="code" spellcheck="false"></textarea>' +
      '<div class="bar" style="margin:10px 0 0"><button data-run class="primary" id="runbtn">▶ Run tests</button><button data-run class="green" id="subbtn">Submit</button><span class="grow"></span><button id="resetcode">Reset code</button></div></div>' +
      '<div class="card" id="result" hidden></div></div></div>';
    app.innerHTML = h;

    board = document.getElementById('board');
    var ta = document.getElementById('code');
    ta.value = S.code;
    ta.addEventListener('input', function () { S.code = ta.value; save(); });
    ta.addEventListener('keydown', function (e) {
      if (e.key === 'Tab') { e.preventDefault(); ta.setRangeText('  ', ta.selectionStart, ta.selectionEnd, 'end'); S.code = ta.value; save(); }
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-add]'), function (b) {
      b.addEventListener('click', function () {
        var t = b.getAttribute('data-add');
        if (countType(t) >= p.limits[t]) return;
        var n = S.parts.length;
        S.parts.push({ id: nextId(t), type: t, x: 300 + (n % 3) * 130, y: 80 + Math.floor(n / 3) * 95 });
        changed();
      });
    });
    document.getElementById('del').addEventListener('click', deleteSel);
    document.getElementById('clearw').addEventListener('click', function () { S.wires = []; S.pending = null; changed(); });
    document.getElementById('resetc').addEventListener('click', function () { S.parts = []; S.wires = []; S.sel = null; S.pending = null; changed(); });
    document.getElementById('resetcode').addEventListener('click', function () { S.code = p.starter; ta.value = p.starter; save(); });
    document.getElementById('runbtn').addEventListener('click', function () { run(false); });
    document.getElementById('subbtn').addEventListener('click', function () { run(true); });

    board.addEventListener('pointerdown', function (e) {
      var pin = e.target.closest('[data-pin]');
      if (pin) { clickPin(pin.getAttribute('data-pin')); return; }
      var wire = e.target.closest('[data-wire]');
      if (wire) { S.wires.splice(+wire.getAttribute('data-wire'), 1); S.pending = null; changed(); return; }
      var part = e.target.closest('[data-part]');
      if (part) {
        var id = part.getAttribute('data-part'), pp = partById(id), pt = svgPoint(e);
        S.sel = id; S.pending = null; drag = { id: id, dx: pt.x - pp.x, dy: pt.y - pp.y };
        try { board.setPointerCapture(e.pointerId); } catch (err) {}
        draw(); return;
      }
      S.sel = null; S.pending = null; draw();
    });
    board.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var pt = svgPoint(e), pp = partById(drag.id);
      pp.x = Math.max(210, Math.min(690, Math.round((pt.x - drag.dx) / 10) * 10));
      pp.y = Math.max(50, Math.min(410, Math.round((pt.y - drag.dy) / 10) * 10));
      draw();
    });
    board.addEventListener('pointerup', function () { if (drag) { drag = null; save(); } });

    draw(); renderSubs();
  }

  function route() {
    var m = (location.hash || '#/').match(/^#\/p\/(.+)$/);
    var p = m && PROBLEMS.filter(function (x) { return x.id === m[1]; })[0];
    if (p) renderProblem(p); else renderList();
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);
  route();
})();
