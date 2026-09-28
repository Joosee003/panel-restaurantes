import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import ts from 'typescript';

// Independent, read-only scope/contract guard for the final V3 presentation pass.
// This is not connected QA, an RLS test, or permission to change the baseline.
const baseline = '3f61a569e3aa8a1cbd2383bef42f4f45c7c5e9f7';
const root = new URL('../', import.meta.url);
const sala = 'app/(app)/sala/page.tsx';
const salaCss = 'app/(app)/sala/sala.module.css';
const dashboard = 'app/(app)/dashboard/page.tsx';
const thisTest = 'tests/product-refinement-final.test.mjs';
const allowedFiles = new Set([sala, salaCss, dashboard, thisTest]);
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 16_000_000 });
const read = file => readFileSync(new URL(file, root), 'utf8');
const original = file => git('show', `${baseline}:${file}`);
const parse = (source, file = 'contract.tsx') => {
  const ast = ts.createSourceFile(file, source.replace(/\r\n/g, '\n'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  assert.equal(ast.parseDiagnostics.length, 0, `${file}: valid TSX required`);
  return ast;
};
const printer = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed });
const print = node => printer.printNode(ts.EmitHint.Unspecified, node, node.getSourceFile());
const walk = (node, visit) => { visit(node); ts.forEachChild(node, child => { walk(child, visit); }); };
const collect = (ast, predicate) => {
  const result = [];
  walk(ast, node => { if (predicate(node)) result.push(node); });
  return result;
};
const printed = nodes => nodes.map(print).sort();
const hasJsx = node => collect(node, child => ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child) || ts.isJsxFragment(child)).length > 0;
const attr = (opening, name) => opening.attributes.properties.find(property => ts.isJsxAttribute(property) && property.name.getText() === name);
const hasClass = (node, value) => ts.isJsxElement(node) && attr(node.openingElement, 'className')?.initializer?.expression?.getText() === value;
const ancestorHasClass = (node, value) => {
  for (let parent = node.parent; parent; parent = parent.parent) if (hasClass(parent, value)) return true;
  return false;
};

function hooksAndData(ast) {
  return printed(collect(ast, node => ts.isCallExpression(node)
    && (/^(?:use[A-Z]\w*|fetch|fetchWithTimeout)$/.test(node.expression.getText())
      || /^(?:supabase|client|admin)\./.test(node.expression.getText()))));
}

function nonVisualFunctions(ast) {
  return printed(collect(ast, node => (
    (ts.isFunctionDeclaration(node) && Boolean(node.name))
    || (ts.isVariableDeclaration(node) && node.initializer && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)))
  ) && !hasJsx(node)));
}

function salaPreparation(ast) {
  return ast.statements.map(statement => {
    if (ts.isImportDeclaration(statement) && statement.moduleSpecifier.text === 'lucide-react') {
      assert.ok(statement.importClause && !statement.importClause.name && ts.isNamedImports(statement.importClause.namedBindings), 'Only named presentation icons may change');
      return 'PRESENTATION_ICONS';
    }
    if (ts.isFunctionDeclaration(statement) && statement.name?.text === 'SalaPage') {
      assert.ok(statement.body, 'SalaPage body required');
      const returns = statement.body.statements.filter(ts.isReturnStatement);
      assert.equal(returns.length, 1, 'Keep the existing single top-level render; do not add early functional branches');
      return statement.body.statements.filter(node => !ts.isReturnStatement(node)).map(print);
    }
    return print(statement);
  });
}

function controlContracts(ast) {
  // Preserve each complete action and its conditions on the SAME control, not
  // merely a bag of handlers detached from their disabled/validation predicates.
  const openingNodes = collect(ast, node => ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node));
  const protectedName = /^(?:on[A-Z].*|action|formAction|disabled|value|defaultValue|checked|defaultChecked|required|readOnly|multiple|pattern|min|max|minLength|maxLength|step|href|type)$/;
  return openingNodes.flatMap(opening => {
    const fields = opening.attributes.properties.filter(property => ts.isJsxAttribute(property) && protectedName.test(property.name.getText()));
    if (!fields.length) return [];
    const guards = [];
    for (let child = opening, parent = opening.parent; parent; child = parent, parent = parent.parent) {
      if (ts.isConditionalExpression(parent) && (parent.whenTrue === child || parent.whenFalse === child)) guards.push(['conditional', print(parent.condition), parent.whenTrue === child]);
      if (ts.isBinaryExpression(parent) && parent.right === child && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken].includes(parent.operatorToken.kind)) guards.push(['logical', parent.operatorToken.kind, print(parent.left)]);
      if (ts.isIfStatement(parent) && (parent.thenStatement === child || parent.elseStatement === child)) guards.push(['if', print(parent.expression), parent.thenStatement === child]);
      if (ts.isCallExpression(parent) && ts.isPropertyAccessExpression(parent.expression) && parent.expression.name.text === 'map') guards.push(['collection', print(parent.expression.expression)]);
    }
    return [JSON.stringify({ tag: opening.tagName.getText(), fields: printed(fields), guards })];
  }).sort();
}

function assignmentRail(ast) {
  const rails = collect(ast, node => ts.isJsxElement(node)
    && node.openingElement.tagName.getText() === 'aside'
    && attr(node.openingElement, 'id')?.initializer?.text === 'sala-asignacion');
  assert.equal(rails.length, 1, 'Exactly one existing assignment rail must remain');
  return print(rails[0]);
}

function assertSalaContracts(beforeSource, afterSource) {
  const before = parse(beforeSource, sala), after = parse(afterSource, sala);
  assert.deepEqual(salaPreparation(after), salaPreparation(before), 'Sala: all imports, helpers, state, calculations and setup before JSX remain intact');
  assert.deepEqual(hooksAndData(after), hooksAndData(before), 'Sala: complete query/mutation chains, hooks and dependencies remain intact');
  assert.deepEqual(nonVisualFunctions(after), nonVisualFunctions(before), 'Sala: functions and handlers remain intact');
  assert.deepEqual(controlContracts(after), controlContracts(before), 'Sala: existing handlers, disabled predicates, routes and form contracts stay bound together');
  assert.equal(assignmentRail(after), assignmentRail(before), 'Sala: assignment rail, full-turn reservations and legend stay intact');
}

// Only these two exact UI projections are accepted. The action object and its
// useMemo, priority, count, target URL and threshold are not rewritten.
const projections = new Map([
  ['action.id === "pedidos-urgentes" ? "Atención a pedidos abiertos 20 min o más." : action.descripcion', 'descripcion'],
  ['action.id === "pedidos-urgentes" ? `${pedidosUrgentes.length} pedido${pedidosUrgentes.length === 1 ? "" : "s"} abierto${pedidosUrgentes.length === 1 ? "" : "s"} ≥20 min` : action.titulo', 'titulo'],
].map(([expression, property]) => {
  const parsed = parse(`const allowed = ${expression};`);
  return [print(parsed.statements[0].declarationList.declarations[0].initializer), property];
}));

function dashboardWithApprovedCopy(source) {
  const ast = parse(source, dashboard);
  const transformed = ts.transform(ast, [context => {
    const visit = node => {
      if (ts.isJsxExpression(node) && node.expression) {
        const property = projections.get(print(node.expression));
        if (property) return ts.factory.updateJsxExpression(node, ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('action'), property));
      }
      if (ts.isJsxText(node)) {
        if (hasClass(node.parent, 'styles.kitchenRule')) return ts.factory.createJsxText('APPROVED_URGENCY_EXPLANATION');
        if (hasClass(node.parent, 'styles.danger') && ancestorHasClass(node, 'styles.kitchenCounts')) return ts.factory.createJsxText('APPROVED_URGENCY_COUNT_LABEL');
      }
      return ts.visitEachChild(node, visit, context);
    };
    return node => ts.visitNode(node, visit);
  }]);
  try { return printer.printFile(transformed.transformed[0]); }
  finally { transformed.dispose(); }
}

test('final V3 changes only the three approved frontend files and this additional contract test', () => {
  const changed = git('diff', '--name-only', baseline, '--').trim().split(/\r?\n/).filter(Boolean);
  const untracked = git('ls-files', '--others', '--exclude-standard').trim().split(/\r?\n/).filter(Boolean);
  assert.deepEqual([...new Set([...changed, ...untracked])].filter(file => !allowedFiles.has(file)), [], 'No backend, global CSS, configuration, old test, fixture or unrelated file may change');
});

test('final Sala preserves every functional contract and the full assignment rail from 3f61a56', () => {
  assertSalaContracts(original(sala), read(sala));
});

test('final Hoy changes only the explicitly approved rendered urgency wording', () => {
  assert.deepEqual(dashboardWithApprovedCopy(read(dashboard)).split('\n'), dashboardWithApprovedCopy(original(dashboard)).split('\n'), 'All other Dashboard syntax, data expressions, layout and effects must remain at the approved baseline');
  const source = read(dashboard), ast = parse(source, dashboard);
  assert.deepEqual(hooksAndData(ast), hooksAndData(parse(original(dashboard), dashboard)));
  assert.match(source, /pedidosAbiertos\.filter\(\(p\) => minutosDesde\(p\.created_at\) >= 20\)/);
  assert.match(source, /pedidosAbiertos\.filter\(\(p\) => minutosDesde\(p\.created_at\) >= 12\)/);
});

test('final Sala stylesheet stays module-local and cannot introduce remote resources or global escapes', () => {
  const require = createRequire(import.meta.url);
  const postcss = require('postcss');
  const source = read(salaCss), css = postcss.parse(source);
  assert.doesNotMatch(source, /@import\b|url\s*\(|:global\(\s*(?:html|body|:root)\b/i);
  css.walkRules(rule => {
    if (rule.parent?.type === 'atrule' && /keyframes$/.test(rule.parent.name)) return;
    for (const selector of rule.selectors) assert.match(selector.trim(), /^\.[a-zA-Z_][\w-]*(?:\s|[>+~:.#[\]]|$)/, `A local class must own every selector: ${selector}`);
  });
  assert.match(source, /@media \(max-width: 767px\)/, 'Keep the portrait composition');
  assert.match(source, /:focus-visible/, 'Keep keyboard focus treatment');
});

test('contract guard rejects representative functional mutations without touching data or files', () => {
  const source = original(sala);
  const mutations = [
    ['restaurant filter', '.eq("restaurante_id", rid)', '.eq("restaurante_id", "wrong-restaurant")'],
    ['attendance semantics', 'reserva.consumo_total !== null', 'reserva.consumo_total === null'],
    ['assignment handler', 'onClick={() => asignarMesa(reserva.id, mesa.id)}', 'onClick={() => liberarMesa(reserva.id)}'],
    ['disabled contract', 'disabled={guardandoMesaId === mesa.id}', 'disabled={false}'],
    ['detail visibility guard', 'reservaDetalle && mesaDetalle && (', 'reservaDetalle && false && ('],
    ['rail availability predicate', 'reservasSinAsignarFranja.length === 0', 'reservasSinAsignarFranja.length === 1'],
  ];
  for (const [label, before, after] of mutations) {
    assert.ok(source.includes(before), `Valid mutation fixture: ${label}`);
    assert.throws(() => assertSalaContracts(source, source.replace(before, after)), undefined, label);
  }
  const hoy = original(dashboard);
  assert.notEqual(dashboardWithApprovedCopy(hoy.replace('minutosDesde(p.created_at) >= 20', 'minutosDesde(p.created_at) >= 21')), dashboardWithApprovedCopy(hoy), 'A one-minute threshold change must fail, even while UI copy changes are allowed');
});
