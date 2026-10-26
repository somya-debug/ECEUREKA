'use strict';
/*
 * judge.js — deterministic hardware judge (prototype)
 *
 * Pipeline:  circuit (netlist) + firmware (JS with Arduino API) + hidden tests  ->  verdict + score
 *
 * Circuit model (digital level):
 *   - wires merge pins into nets (union-find)
 *   - resistors and pressed buttons are edges between nets
 *   - 5V and driven-HIGH pins are "H" sources, GND and driven-LOW pins are "L" sources
 *   - an LED/buzzer is ON when its anode is reachable from H and its cathode from L
 *   - it BURNS if both sides are reachable with no resistor in the path
 *   - H and L meeting through zero resistance is a SHORT
 *
 * This file runs in the browser (inside a Web Worker built from toString()) and in Node (tests).
 * Keep judge() and pressedAt() self-contained: they are stringified into the worker.
 */

// ---- input model: when is the (single) button pressed at time t (ms)? ----------------------
// spec = { windows: [[start,end], ...], bounce: ms, seg: ms }   (bounce = contact chatter length)
function pressedAt(spec, t) {
  if (!spec) return false;
  var windows = spec.windows || [], bounce = spec.bounce || 0, seg = spec.seg || 2;
  for (var i = 0; i < windows.length; i++) {
    var s = windows[i][0], e = windows[i][1];
    if (t >= s && t < e + bounce) {
      if (t < s + bounce) return Math.floor((t - s) / seg) % 2 === 0;   // press chatter
      if (t < e) return true;                                          // steady press
      return Math.floor((t - e) / seg) % 2 === 0;                      // release chatter
    }
  }
  return false;
}

function scoreFor(used, ref) {
  if (used <= 0) return 0;
  return Math.min(100, Math.round((ref / used) * 100));
}
function ratingFor(score) { return score >= 100 ? 3 : score >= 70 ? 2 : 1; }

// ---- the judge ------------------------------------------------------------------------------
function judge(job) {
  var circuit = job.circuit || { parts: [], wires: [] };
  var code = job.code || '';
  var tests = job.tests || [];
  var limits = job.limits || {};
  var parts = circuit.parts || [], wires = circuit.wires || [];

  var res = { verdict: 'Accepted', issues: [], warnings: [], tests: [], used: parts.length };

  // 1. component limits -----------------------------------------------------------------------
  var counts = {};
  parts.forEach(function (p) { counts[p.type] = (counts[p.type] || 0) + 1; });
  Object.keys(counts).forEach(function (type) {
    var allowed = limits[type] || 0;
    if (counts[type] > allowed) {
      res.verdict = 'Invalid Circuit';
      res.issues.push('Too many ' + type + ': ' + counts[type] + ' used, ' + allowed + ' allowed');
    }
  });
  if (res.verdict !== 'Accepted') return res;

  // 2. netlist --------------------------------------------------------------------------------
  var parent = {};
  function find(k) {
    if (parent[k] === undefined) parent[k] = k;
    while (parent[k] !== k) { parent[k] = parent[parent[k]]; k = parent[k]; }
    return k;
  }
  wires.forEach(function (w) { parent[find(w[0])] = find(w[1]); });

  var PINS = { LED: ['A', 'K'], BUZ: ['A', 'K'], RES: ['1', '2'], BTN: ['1', '2'] };
  var wired = {};
  wires.forEach(function (w) { wired[w[0]] = 1; wired[w[1]] = 1; });
  parts.forEach(function (p) {
    (PINS[p.type] || []).forEach(function (pn) {
      if (!wired[p.id + '.' + pn]) res.warnings.push(p.id + ' pin ' + pn + ' is not connected');
    });
  });

  var loads = [], resEdges = [], btnEdges = [];
  parts.forEach(function (p) {
    if (p.type === 'LED' || p.type === 'BUZ') loads.push({ id: p.id, a: find(p.id + '.A'), k: find(p.id + '.K') });
    if (p.type === 'RES') resEdges.push({ a: find(p.id + '.1'), b: find(p.id + '.2'), r: true });
    if (p.type === 'BTN') btnEdges.push({ a: find(p.id + '.1'), b: find(p.id + '.2'), r: false });
  });

  // reach(): which nets can a set of source nets reach, and with zero resistance (noR)?
  function reach(sources, edges) {
    var m = new Map();
    function set(n, noR) {
      var c = m.get(n);
      if (!c) { m.set(n, { noR: noR }); return true; }
      if (noR && !c.noR) { c.noR = true; return true; }
      return false;
    }
    sources.forEach(function (n) { set(n, true); });
    var changed = true;
    while (changed) {
      changed = false;
      for (var i = 0; i < edges.length; i++) {
        var e = edges[i], s;
        if ((s = m.get(e.a)) && set(e.b, e.r ? false : s.noR)) changed = true;
        if ((s = m.get(e.b)) && set(e.a, e.r ? false : s.noR)) changed = true;
      }
    }
    return m;
  }

  // 3. firmware compile -----------------------------------------------------------------------
  var API = ['pinMode', 'digitalWrite', 'digitalRead', 'delay', 'millis', 'Serial', 'HIGH', 'LOW', 'INPUT', 'OUTPUT', 'INPUT_PULLUP'];
  var BLOCKED = ['fetch', 'XMLHttpRequest', 'importScripts', 'postMessage', 'self', 'globalThis', 'WebSocket', 'indexedDB', 'localStorage', 'document', 'window'];
  var factory;
  try {
    factory = new Function(API.concat(BLOCKED).join(','),
      code + '\n;return { setup: typeof setup === "function" ? setup : null, loop: typeof loop === "function" ? loop : null };');
  } catch (e) {
    res.verdict = 'Compile Error';
    res.issues.push(String(e && e.message || e));
    return res;
  }

  // 4. run every test -------------------------------------------------------------------------
  function runTest(t) {
    var check = (new Function('return (' + t.check + ')'))();
    var duration = t.duration;
    var mode = {}, val = {};            // pin name -> mode / output value
    var time = 0, ops = 0, ver = 0;
    var snaps = [], reads = {}, logs = [], floating = null, error = null;
    var cache = null;

    function solve(pressed) {
      if (cache && cache.ver === ver && cache.pressed === pressed) return cache;
      var hs = [find('mcu.5V')], ls = [find('mcu.GND')];
      Object.keys(mode).forEach(function (p) {
        if (mode[p] === 'OUTPUT') (val[p] ? hs : ls).push(find('mcu.' + p));
      });
      var edges = pressed ? resEdges.concat(btnEdges) : resEdges;
      cache = { ver: ver, pressed: pressed, h: reach(hs, edges), l: reach(ls, edges) };
      return cache;
    }

    function snapshot() {
      var s = solve(pressedAt(t.input, time));
      var leds = {}, burned = [], short = false, pins = {};
      loads.forEach(function (ld) {
        var a = s.h.get(ld.a), k = s.l.get(ld.k), on = !!(a && k);
        leds[ld.id] = on;
        if (on && a.noR && k.noR) burned.push(ld.id);
      });
      s.h.forEach(function (hv, n) { var lv = s.l.get(n); if (lv && hv.noR && lv.noR) short = true; });
      Object.keys(mode).forEach(function (p) { if (mode[p] === 'OUTPUT') pins[p] = val[p] ? 1 : 0; });
      var key = JSON.stringify([leds, burned, short, pins]);
      var last = snaps[snaps.length - 1];
      if (!last || last.key !== key) snaps.push({ t: time, leds: leds, burned: burned, short: short, pins: pins, key: key });
    }

    function advance(ms) {
      var rem = ms;
      while (rem > 0) {
        var step = Math.min(rem, 1);
        var before = pressedAt(t.input, time);
        time += step; rem -= step;
        if (pressedAt(t.input, time) !== before) snapshot();
      }
    }
    function op() { if (++ops > 1500000) throw new Error('Too many operations (infinite loop without delay()?)'); }
    function pinName(p) {
      if (typeof p !== 'number' || p < 2 || p > 13 || p % 1) throw new Error('Invalid pin ' + p + ' (use 2..13)');
      return 'D' + p;
    }

    var api = {
      pinMode: function (p, m) { op(); var n = pinName(p); mode[n] = m; if (m !== 'OUTPUT') delete val[n]; else val[n] = 0; ver++; advance(0.01); snapshot(); },
      digitalWrite: function (p, v) {
        op(); var n = pinName(p);
        if (mode[n] === 'OUTPUT') { val[n] = v ? 1 : 0; ver++; }
        advance(0.01); snapshot();
      },
      digitalRead: function (p) {
        op(); var n = pinName(p); reads[n] = 1; advance(0.01);
        if (mode[n] === 'OUTPUT') return val[n];
        var s = solve(pressedAt(t.input, time)), net = find('mcu.' + n);
        if (s.l.has(net)) return 0;
        if (s.h.has(net)) return 1;
        if (mode[n] === 'INPUT_PULLUP') return 1;
        if (!floating) floating = n;
        return 0;
      },
      delay: function (ms) { op(); advance(Math.max(0, +ms || 0)); snapshot(); },
      millis: function () { op(); advance(0.01); return Math.floor(time); },
      Serial: {
        begin: function () {},
        print: function (x) { logs.push(String(x)); },
        println: function (x) { logs.push(String(x)); }
      },
      HIGH: 1, LOW: 0, INPUT: 'INPUT', OUTPUT: 'OUTPUT', INPUT_PULLUP: 'INPUT_PULLUP'
    };

    try {
      var prog = factory.apply(null, API.map(function (k) { return api[k]; }));
      snapshot();
      if (prog.setup) prog.setup();
      var idle = 0;
      while (time < duration) {
        if (!prog.loop) { advance(duration - time); break; }
        var t0 = time;
        prog.loop();
        if (time === t0) { if (++idle >= 3) { advance(duration - time); break; } } else idle = 0;
      }
      snapshot();
    } catch (e) {
      error = String(e && e.message || e);
    }

    // helpers handed to the hidden check functions
    function at(tm) {
      var s = snaps[0];
      for (var i = 0; i < snaps.length; i++) { if (snaps[i].t <= tm) s = snaps[i]; else break; }
      return s;
    }
    var ids = loads.map(function (l) { return l.id; });
    var H = {
      ids: ids,
      on: function (id, tm) { return !!at(tm).leds[id]; },
      anyOn: function (tm) { return ids.some(function (i) { return at(tm).leds[i]; }); },
      lit: function (tm) { var l = ids.filter(function (i) { return at(tm).leds[i]; }); return l.length ? l.join('+') : 'none'; },
      count: function (tm) { return ids.filter(function (i) { return at(tm).leds[i]; }).length; },
      pin: function (p, tm) { return at(tm).pins['D' + p] || 0; },
      read: function (p) { return !!reads['D' + p]; },
      logs: logs
    };

    var pass = true, message = '', kind = '';
    if (error) {
      pass = false; message = 'Runtime error: ' + error;
      kind = /Too many operations/.test(error) ? 'Time Limit Exceeded' : 'Runtime Error';
    } else {
      var burn = snaps.filter(function (s) { return s.burned.length; })[0];
      var sh = snaps.filter(function (s) { return s.short; })[0];
      if (sh) { pass = false; kind = 'Wrong Answer'; message = 'Short circuit at t=' + Math.round(sh.t) + 'ms: a supply path reaches ground with no resistance.'; }
      else if (burn) { pass = false; kind = 'Wrong Answer'; message = burn.burned.join(', ') + ' burned out at t=' + Math.round(burn.t) + 'ms: no current-limiting resistor.'; }
      else if (floating) { pass = false; kind = 'Wrong Answer'; message = 'D' + floating.slice(1) + ' was read while floating. Add a pull-up/pull-down or use INPUT_PULLUP.'; }
      else {
        var m;
        try { m = check(H); } catch (e) { m = 'Checker error: ' + e.message; }
        if (m) { pass = false; kind = 'Wrong Answer'; message = t.hidden ? 'Failed a hidden test case.' : String(m); }
      }
    }

    // LED on-intervals for the timeline view
    var tl = {};
    ids.forEach(function (id) {
      var iv = [], start = null;
      snaps.forEach(function (s) {
        if (s.leds[id] && start === null) start = s.t;
        if (!s.leds[id] && start !== null) { iv.push([start, s.t]); start = null; }
      });
      if (start !== null) iv.push([start, duration]);
      tl[id] = iv;
    });

    return { name: t.name, hidden: !!t.hidden, pass: pass, kind: kind, message: message, timeline: { duration: duration, leds: tl, input: t.input || null } };
  }

  tests.forEach(function (t) { res.tests.push(runTest(t)); });
  var failed = res.tests.filter(function (r) { return !r.pass; })[0];
  if (failed) res.verdict = failed.kind || 'Wrong Answer';
  return res;
}

if (typeof module !== 'undefined') module.exports = { judge: judge, pressedAt: pressedAt, scoreFor: scoreFor, ratingFor: ratingFor };
