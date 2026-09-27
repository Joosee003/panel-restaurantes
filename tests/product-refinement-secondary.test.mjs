import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import ts from 'typescript';

const root = new URL('../', import.meta.url);
const baseline = '0ab2a0efabaafe1e5e066d9754729cb5700a5ce3';
const read = file => readFileSync(new URL(file, root), 'utf8');
const previous = file => execFileSync('git', ['show', `${baseline}:${file}`], { cwd: root, encoding: 'utf8', maxBuffer: 8_000_000 });
const ast = (file, source) => ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const walk = (node, fn) => { fn(node); ts.forEachChild(node, child => walk(child, fn)); };
const norm = text => text.replace(/\s+/g, ' ').trim();
const paths = [
  'app/(app)/resenas/ReviewRequestsPanelView.tsx',
  'app/(app)/dashboard/fidelizacion/cupones/page.tsx',
  'app/(app)/estadisticas/page.tsx',
];

test('V3 secondary surfaces preserve every existing query, effect, memo and state initializer', () => {
  for (const file of paths) {
    const contracts = source => {
      const parsed = ast(file, source), entries = [];
      walk(parsed, node => {
        if (!ts.isCallExpression(node)) return;
        const name = node.expression.getText(parsed);
        if (/^(?:supabase|client)\./.test(name) || /^(?:useEffect|useMemo|useCallback|useState|fetch|fetchWithTimeout)$/.test(name)) entries.push(norm(node.getText(parsed)));
      });
      return entries.sort();
    };
    assert.deepEqual(contracts(read(file)), contracts(previous(file)), file);
  }
});

test('V3 preserves secondary handlers, field validations, values and disabled states', () => {
  for (const file of paths) {
    const contracts = source => {
      const parsed = ast(file, source), entries = [];
      walk(parsed, node => {
        if (!ts.isJsxAttribute(node) || !/^(?:on[A-Z].*|action|formAction|required|pattern|min|max|minLength|maxLength|checked|value|disabled)$/.test(node.name.getText(parsed))) return;
        // StatCard.value is display content, not a form contract. Its point-rate
        // expression moves unchanged into the programme overview below.
        if (node.name.getText(parsed) === 'value' && node.parent.parent.tagName?.getText(parsed) === 'StatCard') return;
        entries.push(norm(node.getText(parsed)));
      });
      return entries.sort();
    };
    assert.deepEqual(contracts(read(file)), contracts(previous(file)), file);
  }
  assert.match(read(paths[1]), /<strong>\{config\.puntos_por_euro \|\| 1\} pts \/ €<\/strong>/);
});

test('one payment category renders the actual amount and closure count, never a donut', () => {
  const file = paths[2], source = read(file), parsed = ast(file, source);
  let single;
  walk(parsed, node => {
    if (ts.isConditionalExpression(node) && norm(node.condition.getText(parsed)) === 'metodosPago.length === 1') single = node;
  });
  assert.ok(single, 'Distinct single-category presentation required');
  const content = single.whenTrue.getText(parsed);
  assert.doesNotMatch(content, /<Pie(?:Chart)?\b/);
  assert.match(content, /fmtEuro\(metodosPago\[0\]\.value\)/);
  assert.match(content, /fmtInt\(metodosPago\[0\]\.count\)/);
  assert.match(content, /metodosPago\[0\]\.name/);
  assert.match(single.whenFalse.getText(parsed), /<Pie\s/);
  assert.match(source, /<dl className=\{refinement\.reportLines\}>/);
  for (const field of ['potencialQRActual', 'facturacionQRActual', 'pedidosActual.length', 'cierresActual.length', 'reservasActual.length', 'clientesActual.length', 'resenasActual.length']) assert.ok(source.includes(`data.${field}`), field);
});

test('review presentation retains automation-off warnings and existing review semantics', () => {
  const source = read(paths[0]);
  for (const text of ['Peticiones automáticas desactivadas.', 'Envío automático pendiente de activación.', 'La apertura no confirma una reseña.', 'Sin teléfono válido', 'customerReviewStage(customer, now)', 'customerDetail(customer, now)']) assert.ok(source.includes(text), text);
  assert.match(source, /const active = data\?\.settings\.review_enabled && data\.settings\.automation_ready && configured/);
  assert.match(source, /<article key=\{customer\.id\} aria-label=\{request\.nombre\}/);
});

test('secondary V3 styles stay module-local with comfortable mobile controls', () => {
  const require = createRequire(import.meta.url);
  const postcss = require('postcss');
  const cssFiles = [
    'app/(app)/resenas/review-queue.module.css',
    'app/(app)/dashboard/fidelizacion/cupones/loyalty-programme.module.css',
    'app/(app)/estadisticas/metrics-refinement.module.css',
  ];
  for (const file of cssFiles) {
    const source = read(file);
    postcss.parse(source).walkRules(rule => {
      for (const selector of rule.selectors) assert.match(selector.trim(), /^\.[a-zA-Z_][\w-]*/, `${file}: ${selector}`);
    });
    assert.match(source, /@media \(max-width: (?:639|767)px\)/, file);
    assert.match(source, /min-height: 44px/, file);
  }
});
