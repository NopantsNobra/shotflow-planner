/* Analyze the actual single-script runtime instead of isolated source fragments.
   Inline HTML handlers are external references to classic-script globals. */
import { ESLint } from 'eslint';
import { assembleHtml } from './assemble.mjs';

const html = assembleHtml();
const source = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const handlerNames = new Set();
for (const match of html.matchAll(/\bon[a-z]+="([^"\n]*)"/g)) {
  for (const call of match[1].matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)) handlerNames.add(call[1]);
}
const declarations = new Set([...source.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)].map((match) => match[1]));
const exports = [...handlerNames].filter((name) => declarations.has(name)).sort();
const input = '/* exported ' + exports.join(', ') + ' */\n' + source;
const eslint = new ESLint({
  overrideConfig: {
    languageOptions: { sourceType: 'script' },
    rules: { 'no-undef': 'error' }
  }
});
const results = await eslint.lintText(input, { filePath: 'src/js/assembled-runtime.js' });
const formatter = await eslint.loadFormatter('stylish');
console.log(formatter.format(results));
if (results.some((result) => result.errorCount)) process.exitCode = 1;
