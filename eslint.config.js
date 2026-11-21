/* ESLint flat config：src/js 为浏览器全局脚本（无 import/export，依赖注入的全局对象），
   scripts/ 与 tests/ 为 Node ESM。规则以「发现真实错误」为主，不做风格强制（风格交给 Prettier）。 */
import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['shotflow.html', 'shotflow-app/**', 'node_modules/**', 'playwright-report/**', 'test-results/**'] },
  js.configs.recommended,
  {
    files: ['src/js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser }
    },
    rules: {
      // src/js 各段构建后拼进同一个 <script>，跨段函数/变量共享同一全局作用域，
      // 单文件视角下这些引用是合法的，故关闭 no-undef（否则需手工声明数百个跨段符号）。
      'no-undef': 'off',
      'no-unused-vars': ['warn', { args: 'none' }],
      'no-redeclare': 'error',
      // 空 catch 是本项目有意的静默容错（如 localStorage 不可用时降级），构建需逐字节一致故不改源码
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-useless-escape': 'off'
    }
  },
  {
    files: ['scripts/**/*.mjs', 'playwright.config.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.node } },
    rules: { 'no-undef': 'error', 'no-unused-vars': ['warn', { args: 'none' }] }
  },
  {
    files: ['tests/**/*.js', 'tests/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser }
    },
    rules: {
      // E2E 的 page.evaluate 回调在浏览器上下文执行，引用应用全局（loadP/openProject 等）合法
      'no-undef': 'off',
      'no-unused-vars': ['warn', { args: 'none' }]
    }
  }
];
