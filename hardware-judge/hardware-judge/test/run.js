'use strict';
// node test/run.js — reference solutions must be Accepted with the optimal score;
// known-bad attempts must be rejected.
const { judge, scoreFor } = require('../judge.js');
const { PROBLEMS } = require('../problems.js');

const P = Object.fromEntries(PROBLEMS.map(p => [p.id, p]));
const parts = (...a) => a.map(s => ({ id: s, type: s.replace(/\d+$/, '') }));

const led13 = [['mcu.D13', 'RES1.1'], ['RES1.2', 'LED1.A'], ['LED1.K', 'mcu.GND']];
const btn2 = [['mcu.D2', 'BTN1.1'], ['BTN1.2', 'mcu.GND']];

const cases = [
  // --- reference solutions -------------------------------------------------
  { name: 'hello-led reference', pid: 'hello-led', expect: 'Accepted', score: 100,
    circuit: { parts: parts('LED1', 'RES1'), wires: led13 },
    code: 'function setup(){ pinMode(13, OUTPUT); digitalWrite(13, HIGH); }' },
  { name: 'blink reference', pid: 'blink-1hz', expect: 'Accepted', score: 100,
    circuit: { parts: parts('LED1', 'RES1'), wires: led13 },
    code: 'function setup(){pinMode(13,OUTPUT);} function loop(){digitalWrite(13,HIGH);delay(500);digitalWrite(13,LOW);delay(500);}' },
  { name: 'button-light reference', pid: 'button-light', expect: 'Accepted', score: 100,
    circuit: { parts: parts('LED1', 'RES1', 'BTN1'), wires: led13.concat(btn2) },
    code: 'function setup(){pinMode(13,OUTPUT);pinMode(2,INPUT_PULLUP);} function loop(){digitalWrite(13, digitalRead(2)===LOW?HIGH:LOW);}' },
  { name: 'alternate reference (shared resistor)', pid: 'alternate', expect: 'Accepted', score: 100,
    circuit: { parts: parts('LED1', 'LED2', 'RES1'),
      wires: [['mcu.D12', 'LED1.A'], ['mcu.D13', 'LED2.A'], ['LED1.K', 'RES1.1'], ['LED2.K', 'RES1.1'], ['RES1.2', 'mcu.GND']] },
    code: 'function setup(){pinMode(12,OUTPUT);pinMode(13,OUTPUT);} function loop(){digitalWrite(12,HIGH);digitalWrite(13,LOW);delay(250);digitalWrite(12,LOW);digitalWrite(13,HIGH);delay(250);}' },
  { name: 'alternate with 2 resistors scores 75%', pid: 'alternate', expect: 'Accepted', score: 75,
    circuit: { parts: parts('LED1', 'LED2', 'RES1', 'RES2'),
      wires: [['mcu.D12', 'RES1.1'], ['RES1.2', 'LED1.A'], ['LED1.K', 'mcu.GND'], ['mcu.D13', 'RES2.1'], ['RES2.2', 'LED2.A'], ['LED2.K', 'mcu.GND']] },
    code: 'function setup(){pinMode(12,OUTPUT);pinMode(13,OUTPUT);} function loop(){digitalWrite(12,HIGH);digitalWrite(13,LOW);delay(250);digitalWrite(12,LOW);digitalWrite(13,HIGH);delay(250);}' },
  { name: 'toggle reference (debounced)', pid: 'toggle-debounce', expect: 'Accepted', score: 100,
    circuit: { parts: parts('LED1', 'RES1', 'BTN1'), wires: led13.concat(btn2) },
    code: `let led = false, stable = HIGH;
function setup(){ pinMode(13, OUTPUT); pinMode(2, INPUT_PULLUP); }
function loop(){
  const r = digitalRead(2);
  if (r !== stable) {
    delay(30);
    stable = digitalRead(2);
    if (stable === LOW) { led = !led; digitalWrite(13, led ? HIGH : LOW); }
  }
}` },

  // --- things that must be rejected ---------------------------------------
  { name: 'no resistor burns the LED', pid: 'hello-led', expect: 'Wrong Answer', msg: /burned/,
    circuit: { parts: parts('LED1'), wires: [['mcu.D13', 'LED1.A'], ['LED1.K', 'mcu.GND']] },
    code: 'function setup(){ pinMode(13, OUTPUT); digitalWrite(13, HIGH); }' },
  { name: 'hardcoded to the visible test fails hidden tests (blink)', pid: 'blink-1hz', expect: 'Wrong Answer',
    circuit: { parts: parts('LED1', 'RES1'), wires: led13 },
    code: 'function setup(){pinMode(13,OUTPUT);} function loop(){digitalWrite(13,HIGH);delay(500);digitalWrite(13,LOW);delay(520);}' },
  { name: 'LED on forever fails blink', pid: 'blink-1hz', expect: 'Wrong Answer',
    circuit: { parts: parts('LED1', 'RES1'), wires: led13 },
    code: 'function setup(){pinMode(13,OUTPUT);digitalWrite(13,HIGH);}' },
  { name: 'button wired straight to the LED (no MCU read) is rejected', pid: 'button-light', expect: 'Wrong Answer', msg: /pin 2/,
    circuit: { parts: parts('LED1', 'RES1', 'BTN1'),
      wires: [['mcu.5V', 'BTN1.1'], ['BTN1.2', 'RES1.1'], ['RES1.2', 'LED1.A'], ['LED1.K', 'mcu.GND']] },
    code: 'function setup(){pinMode(2,INPUT_PULLUP);}' },
  { name: 'slow polling (delay 50) fails the fast-response hidden test', pid: 'button-light', expect: 'Wrong Answer',
    circuit: { parts: parts('LED1', 'RES1', 'BTN1'), wires: led13.concat(btn2) },
    code: 'function setup(){pinMode(13,OUTPUT);pinMode(2,INPUT_PULLUP);} function loop(){digitalWrite(13, digitalRead(2)===LOW?HIGH:LOW);delay(50);}' },
  { name: 'floating input is flagged', pid: 'button-light', expect: 'Wrong Answer', msg: /floating/,
    circuit: { parts: parts('LED1', 'RES1', 'BTN1'), wires: led13.concat(btn2) },
    code: 'function setup(){pinMode(13,OUTPUT);pinMode(2,INPUT);} function loop(){digitalWrite(13, digitalRead(2)===LOW?HIGH:LOW);}' },
  { name: 'naive edge-detect toggle (no debounce) fails', pid: 'toggle-debounce', expect: 'Wrong Answer',
    circuit: { parts: parts('LED1', 'RES1', 'BTN1'), wires: led13.concat(btn2) },
    code: `let led=false,last=HIGH;
function setup(){pinMode(13,OUTPUT);pinMode(2,INPUT_PULLUP);}
function loop(){const r=digitalRead(2); if(last===HIGH&&r===LOW){led=!led;digitalWrite(13,led?HIGH:LOW);} last=r;}` },
  { name: 'too many parts is an invalid circuit', pid: 'hello-led', expect: 'Invalid Circuit',
    circuit: { parts: parts('LED1', 'LED2', 'RES1'), wires: [] }, code: '' },
  { name: 'syntax error is a compile error', pid: 'hello-led', expect: 'Compile Error',
    circuit: { parts: parts('LED1', 'RES1'), wires: led13 }, code: 'function setup( {' },
  { name: 'busy loop that never drives the LED is wrong (but not hung)', pid: 'blink-1hz', expect: 'Wrong Answer',
    circuit: { parts: parts('LED1', 'RES1'), wires: led13 },
    code: 'function setup(){pinMode(13,OUTPUT);} function loop(){ let x=digitalRead(13); }' },
  { name: 'shorting a driven pin to GND is a short', pid: 'hello-led', expect: 'Wrong Answer', msg: /[Ss]hort/,
    circuit: { parts: parts('LED1', 'RES1'), wires: led13.concat([['mcu.D12', 'mcu.GND']]) },
    code: 'function setup(){ pinMode(12, OUTPUT); digitalWrite(12, HIGH); pinMode(13,OUTPUT); digitalWrite(13,HIGH); }' }
];

let fails = 0;
for (const c of cases) {
  const p = P[c.pid];
  const t0 = Date.now();
  const r = judge({
    circuit: c.circuit, code: c.code, limits: p.limits,
    tests: p.tests.map(t => ({ name: t.name, hidden: !!t.hidden, duration: t.duration, input: t.input || null, check: t.check.toString() }))
  });
  const score = r.verdict === 'Accepted' ? scoreFor(r.used, p.ref) : 0;
  let ok = r.verdict === c.expect;
  if (ok && c.score !== undefined) ok = score === c.score;
  if (ok && c.msg) ok = r.tests.some(t => c.msg.test(t.message || '')) || (r.issues || []).some(m => c.msg.test(m));
  if (!ok) fails++;
  const extra = r.verdict === 'Accepted' ? ` score=${score}` : '';
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${c.name}  -> ${r.verdict}${extra}  (${Date.now() - t0}ms)`);
  if (!ok) {
    console.log('      expected', c.expect, c.score !== undefined ? 'score ' + c.score : '');
    r.tests.filter(t => !t.pass).forEach(t => console.log('      -', t.name + ':', t.message));
    (r.issues || []).forEach(m => console.log('      !', m));
  }
}
console.log(fails ? `\n${fails} FAILED` : '\nall good');
process.exit(fails ? 1 : 0);
