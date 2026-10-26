// Unit tests for the hardware judge: circuit model, analog model, firmware API and verdicts.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { engine, C, run } from './helpers.mjs';

const { pressedAt, scoreFor, ratingFor } = engine;
const LED_ON_D3 = C('LED1 RES1', 'D3-RES1.1, RES1.2-LED1.A, LED1.K-GND');

describe('button input model', () => {
  test('pressed only inside a window', () => {
    const spec = { windows: [[100, 200]] };
    assert.equal(pressedAt(spec, 50), false);
    assert.equal(pressedAt(spec, 150), true);
    assert.equal(pressedAt(spec, 200), false);
    assert.equal(pressedAt(null, 150), false);
  });
  test('bounce chatters on press and release', () => {
    const spec = { windows: [[100, 200]], bounce: 6, seg: 2 };
    assert.deepEqual([100, 102, 104, 107].map((t) => pressedAt(spec, t)), [true, false, true, true]);
    assert.deepEqual([200, 202, 207].map((t) => pressedAt(spec, t)), [true, false, false]);
  });
});

describe('scoring', () => {
  test('score is ref / used, capped at 100', () => {
    assert.equal(scoreFor(3, 3), 100);
    assert.equal(scoreFor(4, 3), 75);
    assert.equal(scoreFor(2, 3), 100);
    assert.equal(scoreFor(0, 3), 0);
  });
  test('stars', () => {
    assert.equal(ratingFor(100), 3);
    assert.equal(ratingFor(70), 2);
    assert.equal(ratingFor(69), 1);
  });
});

describe('digital circuit model', () => {
  test('LED with resistor lights when its pin is HIGH', () => {
    const r = run(LED_ON_D3, 'function setup(){ pinMode(3, OUTPUT); digitalWrite(3, HIGH); }', { probe: (H) => [H.on('LED1', 500), H.level('LED1', 500)] });
    assert.deepEqual(r.value, [true, 1]);
  });
  test('reversed LED stays dark', () => {
    const r = run(C('LED1 RES1', 'D3-RES1.1, RES1.2-LED1.K, LED1.A-GND'), 'function setup(){ pinMode(3, OUTPUT); digitalWrite(3, HIGH); }', { probe: (H) => H.on('LED1', 500) });
    assert.equal(r.value, false);
  });
  test('LED without a resistor burns', () => {
    const r = run(C('LED1', 'D3-LED1.A, LED1.K-GND'), 'function setup(){ pinMode(3, OUTPUT); digitalWrite(3, HIGH); }');
    assert.equal(r.verdict, 'Wrong Answer');
    assert.match(r.message, /burned out/);
  });
  test('HIGH pin wired to GND is a short circuit', () => {
    const r = run(C('RES1', 'D3-GND, D3-RES1.1'), 'function setup(){ pinMode(3, OUTPUT); digitalWrite(3, HIGH); }');
    assert.match(r.message, /Short circuit/);
  });
  test('a pin set to INPUT does not drive anything', () => {
    const r = run(LED_ON_D3, 'function setup(){ pinMode(3, INPUT); }', { probe: (H) => H.anyOn(500) });
    assert.equal(r.value, false);
  });
  test('INPUT_PULLUP reads HIGH, then LOW while the button to GND is held', () => {
    const r = run(C('BTN1', 'BTN1.1-D2, BTN1.2-GND'), 'var log=[]; function setup(){ pinMode(2, INPUT_PULLUP); } function loop(){ log.push(digitalRead(2)); Serial.println(digitalRead(2)); delay(100); }',
      { input: { windows: [[250, 450]] }, duration: 600, probe: (H) => H.logs.join('') });
    assert.equal(r.value, '111001');
  });
  test('pull-down resistor with button to 5V reads HIGH when pressed', () => {
    const r = run(C('BTN1 RES1', 'BTN1.1-D2, BTN1.2-5V, D2-RES1.1, RES1.2-GND'), 'function setup(){ pinMode(2, INPUT); } function loop(){ Serial.print(digitalRead(2)); delay(100); }',
      { input: { windows: [[150, 350]] }, duration: 500, probe: (H) => H.logs.join('') });
    assert.equal(r.value, '00110');   // samples at t = 0, 100, 200, 300, 400 ms
  });
  test('reading an unconnected input is reported as floating', () => {
    const r = run(C('BTN1', 'BTN1.1-D2'), 'function setup(){ pinMode(2, INPUT); } function loop(){ digitalRead(2); delay(10); }');
    assert.match(r.message, /D2 was read while floating/);
  });
  test('two buttons follow their own timelines', () => {
    const r = run(C('BTN1 BTN2', 'BTN1.1-D2, BTN1.2-GND, BTN2.1-D3, BTN2.2-GND'),
      'function setup(){ pinMode(2, INPUT_PULLUP); pinMode(3, INPUT_PULLUP); } function loop(){ Serial.print(digitalRead(2) + "" + digitalRead(3) + " "); delay(100); }',
      { inputs: { BTN1: { windows: [[50, 150]] }, BTN2: { windows: [[150, 250]] } }, duration: 300, probe: (H) => H.logs.join('') });
    assert.equal(r.value, '11 01 10 ');   // samples at t = 0, 100, 200 ms
  });
});

describe('analog model', () => {
  const POT = C('POT1', 'POT1.1-GND, POT1.2-5V, POT1.W-A0');
  test('potentiometer wiper reads its position', () => {
    const r = run(POT, 'function loop(){ Serial.print(analogRead(A0) + " "); delay(100); }',
      { analog: { POT1: [[0, 0], [100, 0.5], [200, 1]] }, duration: 300, probe: (H) => H.logs.join('') });
    assert.equal(r.value, '0 512 1023 ');
  });
  test('LDR divider reads high in light, low in the dark', () => {
    const r = run(C('LDR1 RES1', '5V-LDR1.1, LDR1.2-A0, A0-RES1.1, RES1.2-GND'), 'function loop(){ Serial.print(analogRead(A0) + " "); delay(100); }',
      { analog: { LDR1: [[0, 1], [100, 0]] }, duration: 200, probe: (H) => H.logs.join('').trim().split(' ').map(Number) });
    assert.ok(r.value[0] > 900 && r.value[1] < 100, String(r.value));
  });
  test('analogRead on a digital pin is a runtime error', () => {
    const r = run(POT, 'function setup(){ analogRead(5); }');
    assert.equal(r.verdict, 'Runtime Error');
  });
  test('a lit LED hung on a divider drags the reading up', () => {
    const r = run(C('LDR1 RES1 LED1', '5V-LDR1.1, LDR1.2-A0, A0-RES1.1, RES1.2-GND, D4-LED1.A, LED1.K-A0'),
      'function setup(){ pinMode(4, OUTPUT); } function loop(){ digitalWrite(4, LOW); Serial.print(analogRead(A0) + " "); digitalWrite(4, HIGH); Serial.print(analogRead(A0) + " "); delay(100); }',
      { analog: { LDR1: [[0, 0]] }, duration: 100, probe: (H) => H.logs.join('').trim().split(' ').map(Number) });
    assert.ok(r.value[0] < 100 && r.value[1] > 800, String(r.value));
  });
});

describe('PWM, servo and shift register', () => {
  test('analogWrite sets LED brightness', () => {
    const r = run(C('LED1 RES1', 'D9-RES1.1, RES1.2-LED1.A, LED1.K-GND'), 'function setup(){ analogWrite(9, 64); }', { probe: (H) => H.level('LED1', 500) });
    assert.equal(r.value, 0.25);
  });
  test('analogWrite only works on PWM pins', () => {
    const r = run(LED_ON_D3, 'function setup(){ analogWrite(4, 100); }');
    assert.equal(r.verdict, 'Runtime Error');
    assert.match(r.message, /PWM only works on pins 3, 5, 6, 9, 10 and 11/);
  });
  test('servo reports its angle only when powered and wired to the attached pin', () => {
    const code = 'var s = new Servo(); function setup(){ s.attach(9); s.write(45); } function loop(){ delay(200); s.write(135); delay(1000); }';
    const ok = run(C('SRV1', 'SRV1.V-5V, SRV1.G-GND, SRV1.S-D9'), code, { probe: (H) => [H.angle('SRV1', 100), H.angle('SRV1', 500)] });
    assert.deepEqual(ok.value, [45, 135]);
    const off = run(C('SRV1', 'SRV1.S-D9'), code, { probe: (H) => H.angle('SRV1', 100) });
    assert.equal(off.value, null);
  });
  test('74HC595 shifts and latches with shiftOut', () => {
    const wires = 'SR1.VCC-5V, SR1.GND-GND, SR1.DS-D2, SR1.SH-D3, SR1.ST-D4, SR1.Q0-LED1.A, SR1.Q7-LED2.A, LED1.K-RES1.1, LED2.K-RES1.1, RES1.2-GND';
    const code = 'function setup(){ pinMode(2,OUTPUT); pinMode(3,OUTPUT); pinMode(4,OUTPUT); shiftOut(2, 3, MSBFIRST, 0x01); digitalWrite(4,HIGH); digitalWrite(4,LOW); delay(100);' +
      ' shiftOut(2, 3, MSBFIRST, 0x80); delay(100); digitalWrite(4,HIGH); digitalWrite(4,LOW); }';
    const r = run(C('SR1 LED1 LED2 RES1', wires), code, { probe: (H) => [H.on('LED1', 50), H.on('LED2', 50), H.on('LED1', 150), H.on('LED1', 250), H.on('LED2', 250)] });
    // before the second latch pulse the outputs must not change
    assert.deepEqual(r.value, [true, false, true, false, true]);
  });
  test('7-segment decoding and multiplexed display detection', () => {
    const segs = 'abcdefg'.split('');
    const wires = segs.map((s, i) => `D${3 + i}-SEG1.${s}`).join(', ') + ', SEG1.K-RES1.1, RES1.2-GND';
    const code = 'var D=[0x3F,0x06,0x5B,0x4F,0x66,0x6D,0x7D,0x07,0x7F,0x6F]; function setup(){ for(var i=3;i<=9;i++) pinMode(i,OUTPUT); }' +
      ' function loop(){ var n = Math.floor(millis()/100) % 10; for (var i=0;i<7;i++) digitalWrite(3+i, (D[n]>>i)&1); delay(5); }';
    const r = run(C('SEG1 RES1', wires), code, { probe: (H) => [H.digit('SEG1', 50), H.digit('SEG1', 750), H.shown('SEG1', 310, 390)] });
    assert.deepEqual(r.value, ['0', '7', '3']);
  });
});

describe('verdicts', () => {
  test('too many parts is an Invalid Circuit', () => {
    const r = engine.judge({ circuit: C('LED1 LED2', ''), code: '', limits: { LED: 1 }, tests: [] });
    assert.equal(r.verdict, 'Invalid Circuit');
  });
  test('syntax error is a Compile Error', () => {
    const r = run(LED_ON_D3, 'function setup( {');
    assert.equal(r.verdict, 'Compile Error');
  });
  test('busy loop with no delay is a Time Limit Exceeded', () => {
    const r = run(LED_ON_D3, 'function loop(){ while(true) digitalWrite(3, HIGH); }');
    assert.equal(r.verdict, 'Time Limit Exceeded');
  });
  test('invalid pin number is a Runtime Error', () => {
    const r = run(LED_ON_D3, 'function setup(){ pinMode(1, OUTPUT); }');
    assert.equal(r.verdict, 'Runtime Error');
    assert.match(r.message, /Invalid pin 1/);
  });
  test('firmware cannot reach browser APIs', () => {
    const r = run(LED_ON_D3, 'function setup(){ fetch("https://example.com"); }');
    assert.equal(r.verdict, 'Runtime Error');
  });
  test('unwired pins produce warnings', () => {
    const r = run(C('LED1', 'D3-LED1.A'), 'function setup(){}');
    assert.ok(r.result.warnings.some((w) => /LED1 pin K is not connected/.test(w)));
  });
});
