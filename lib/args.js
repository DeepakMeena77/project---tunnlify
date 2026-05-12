'use strict';

/**
 * Minimal argument parser — no external deps.
 *
 * Supports:
 *   --flag value
 *   --flag=value
 *   --flag          (boolean true)
 *   positional args collected into _[]
 */
function parseArgs(argv) {
  const result = { _: [] };
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const raw = arg.slice(2);
      if (raw.includes('=')) {
        const [key, ...rest] = raw.split('=');
        result[key] = rest.join('=');
      } else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        result[raw] = argv[i + 1];
        i++;
      } else {
        result[raw] = true;
      }
    } else if (arg.startsWith('-') && arg.length === 2) {
      const key = arg.slice(1);
      if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
        result[key] = argv[i + 1];
        i++;
      } else {
        result[key] = true;
      }
    } else {
      result._.push(arg);
    }
    i++;
  }
  return result;
}

module.exports = { parseArgs };
