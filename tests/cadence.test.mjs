import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCadence } from '../skills/paprika-messenger/scripts/parse-cadence.mjs';

test('receiver cadence defaults and minute/hour inputs preserve the intended interval', () => {
  assert.equal(parseCadence().minutes, 5);
  assert.equal(parseCadence('5', 'min').rrule, 'RRULE:FREQ=MINUTELY;INTERVAL=5');
  assert.equal(parseCadence('0.5', 'hour').minutes, 30);
  assert.equal(parseCadence('.5', 'HR').minutes, 30);
  assert.equal(parseCadence('1.5', 'hours').minutes, 90);
  assert.equal(parseCadence('2', 'h').minutes, 120);
  assert.equal(parseCadence('1.0', 'minute').minutes, 1);
});

test('receiver cadence rejects intervals that would be rounded or scheduled incorrectly', () => {
  for (const args of [['0','min'],['-5','min'],['0.5','min'],['0.333','hour'],['5','sec'],['5'],['Infinity','hour'],['1e3','min'],['2147483648','min']]) {
    assert.throws(() => parseCadence(...args), undefined, args.join(' '));
  }
});
