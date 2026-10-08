import { existsSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Convert user-facing durations without rounding fractional minutes away.
export function parseCadence(amount, unit) {
  if (amount === undefined && unit === undefined) amount = '5', unit = 'min';
  if (amount === undefined || unit === undefined) throw new Error('Use a duration such as 5 min or 0.5 hour.');
  const quantity = String(amount).trim();
  const units = String(unit).trim().toLowerCase();
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(quantity)) throw new Error('Cadence must be a positive decimal number.');
  const multiplier = /^(?:m|min|mins|minute|minutes)$/.test(units) ? 1n
    : /^(?:h|hr|hrs|hour|hours)$/.test(units) ? 60n : null;
  if (multiplier === null) throw new Error('Use minutes or hours; seconds are not supported.');
  const [whole, fraction = ''] = quantity.split('.');
  if (quantity.length > 32) throw new Error('Cadence is too large or precise.');
  const denominator = 10n ** BigInt(fraction.length);
  const numerator = BigInt((whole || '0') + fraction) * multiplier;
  if (numerator <= 0n || numerator % denominator !== 0n) throw new Error('Cadence must resolve to at least one whole minute; it is never rounded silently.');
  const value = numerator / denominator;
  if (value > 2147483647n) throw new Error('Cadence exceeds the recurrence interval limit.');
  const minutes = Number(value);
  return {minutes, label: `every ${minutes} minute${minutes === 1 ? '' : 's'}`, rrule: `RRULE:FREQ=MINUTELY;INTERVAL=${minutes}`};
}

if (process.argv[1] && existsSync(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  try {
    if (process.argv.length > 4) throw new Error('Usage: node parse-cadence.mjs [amount min|hour]');
    console.log(JSON.stringify(parseCadence(...process.argv.slice(2))));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
