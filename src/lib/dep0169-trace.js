'use strict';

// Diagnostic only: log deprecation origin on Vercel PREVIEW, never on Production.
// Do not expose request data, headers, tokens, or stack traces to clients.
if (process.env.VERCEL_ENV === 'preview') {
  const key = Symbol.for('mosigo.dep0169.trace.installed');
  if (!process[key]) {
    process[key] = true;
    process.on('warning', (warning) => {
      if (warning?.code !== 'DEP0169') return;
      const stack = String(warning.stack || '')
        .split('\n')
        .slice(0, 16)
        .join('\n');
      console.warn('[mosigo-dep0169-preview-trace]\n' + stack);
    });
  }
}
