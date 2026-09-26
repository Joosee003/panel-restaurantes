import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import ts from 'typescript';

// Deliberately anchored to the approved, pre-redesign functional baseline.
// This suite is a change-scope check, not a replacement for connected UI or RLS QA.
const baseline = '699e9a2';
const root = new URL('../', import.meta.url);
const require = createRequire(import.meta.url);
const postcss = require('postcss');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16_000_000 });
const before = (file) => git('show', `${baseline}:${file}`);
const current = (file) => readFileSync(new URL(file, root), 'utf8');
const normalize = (value) => value.replace(/\s+/g, ' ').trim();
const tree = (file, text) => ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const walk = (node, visit) => { visit(node); ts.forEachChild(node, child => walk(child, visit)); };
const files = [
  'app/(app)/dashboard/page.tsx', 'app/(app)/reservas/page.tsx', 'app/(app)/sala/page.tsx',
  'app/(app)/clientes/page.tsx', 'app/(app)/clientes/[id]/page.tsx',
  'app/(app)/resenas/page.tsx', 'app/(app)/resenas/ReviewRequestsPanelView.tsx',
  'app/(app)/estadisticas/page.tsx', 'app/(app)/dashboard/rentabilidad/page.tsx',
  'app/(app)/dashboard/rentabilidad/ingredientes/page.tsx', 'app/(app)/dashboard/rentabilidad/ventas/page.tsx',
  'app/(app)/dashboard/rentabilidad/platos/page.tsx', 'app/(app)/dashboard/rentabilidad/platos/nuevo/page.tsx',
  'app/(app)/dashboard/rentabilidad/platos/[id]/page.tsx',
  'app/(app)/dashboard/fidelizacion/cupones/page.tsx', 'app/(app)/dashboard/fidelizacion/canjes/page.tsx',
  'app/(app)/panel/carta-productos/page.tsx', 'app/(app)/panel/menu-dia/page.tsx',
  'app/(app)/panel/qr-mesas/page.tsx', 'app/(app)/panel/pedidos-qr/page.tsx',
  'app/(app)/ajustes/page.tsx', 'app/(app)/components/Sidebar.tsx',
  'app/(app)/components/RequireLandscape.tsx', 'app/c/[token]/page.tsx',
];

// Explicit presentation exceptions. No data loader, mutation, rule, validator,
// formatter, permission check, consent check or server action is exempted.
const visualFunctions = new Set([
  'getTheme', 'getThemeClasses', 'badgeNivel', 'badgeEstado', 'badgeSegmento', 'SparkIcon',
  'AppShell', 'IconBubble', 'Badge', 'ProgressBar', 'SectionCard', 'EmptyState', 'AppNotice',
  'Hero', 'CompactHeader', 'BottomNav', 'ReservaCard', 'ValidationCard', 'RewardHeroPanel',
  'RewardCard', 'RewardSteps',
]);
const visualMemos = new Set(['cardBase', 'btn', 'btnPrimary', 'btnGhost', 'btnDanger', 'inputBase']);
const hooks = (file, text) => {
  const ast = tree(file, text), result = [];
  walk(ast, node => {
    if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression)) return;
    const name = node.expression.text;
    if (!['useEffect', 'useCallback', 'useMemo', 'useState'].includes(name)) return;
    const parent = node.parent;
    if (name === 'useMemo' && ts.isVariableDeclaration(parent) && visualMemos.has(parent.name.getText(ast))) return;
    result.push(normalize(node.getText(ast)));
  });
  return result;
};
const dataCalls = (file, text) => {
  const ast = tree(file, text), result = [];
  walk(ast, node => {
    if (!ts.isCallExpression(node)) return;
    const expression = node.expression.getText(ast);
    // Includes complete select/filter/order/update chains, not only table names.
    if (/^(?:supabase|admin|client)\./.test(expression) || /^(?:fetch|fetchWithTimeout)$/.test(expression)) {
      result.push(normalize(node.getText(ast)));
    }
  });
  return result.sort();
};
const containsJsx = (node) => {
  let found = false;
  walk(node, child => { if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child) || ts.isJsxFragment(child)) found = true; });
  return found;
};
const functions = (file, text) => {
  const ast = tree(file, text), result = new Map();
  const visit = (node, owners = []) => {
    const named = ts.isFunctionDeclaration(node) && node.name ? node.name.text
      : ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer
        && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)) ? node.name.text : null;
    if (named && !visualFunctions.has(named) && !containsJsx(node)) result.set([...owners, named].join('/'), normalize(node.getText(ast)));
    ts.forEachChild(node, child => visit(child, named ? [...owners, named] : owners));
  };
  visit(ast);
  return result;
};
const subset = (expected, actual, message) => {
  const remaining = [...actual];
  for (const item of expected) {
    const index = remaining.indexOf(item);
    assert.notEqual(index, -1, `${message}\nMissing or changed: ${item.slice(0, 230)}`);
    remaining.splice(index, 1);
  }
};

test('definitive product leaves backend, authentication, data contracts and global styles at the approved baseline', () => {
  const protectedPath = path => /^(?:app\/api\/|lib\/|supabase\/|migrations\/|n8n\/|app\/services\/|app\/hooks\/|app\/\(app\)\/lib\/)/.test(path)
    || /(?:^|\/)(?:AuthGuard|DemoModeGuard|ModuleRouteGuard|RestaurantScope|ThemeProvider|WhatsAppSettings)\.tsx$/.test(path)
    || ['app/globals.css', 'package.json', 'package-lock.json', 'next.config.ts', 'vercel.json', 'middleware.ts', 'proxy.ts'].includes(path);
  const originalPaths = git('ls-tree', '-r', '--name-only', baseline).trim().split(/\r?\n/).filter(protectedPath);
  const workingPaths = git('ls-files', '--cached', '--others', '--exclude-standard').trim().split(/\r?\n/).filter(protectedPath);
  assert.deepEqual([...new Set(workingPaths)].sort(), originalPaths.sort(), 'No protected file can be added or removed during this redesign');
  for (const file of originalPaths) assert.equal(current(file).replace(/\r\n/g, '\n'), before(file).replace(/\r\n/g, '\n'), file);
});

test('all existing panel and customer-app data queries, mutations, effects and state initializers remain intact', () => {
  for (const file of files) {
    const original = before(file), working = current(file);
    assert.deepEqual(dataCalls(file, working), dataCalls(file, original), `${file}: complete API/query chains`);
    subset(hooks(file, original), hooks(file, working), `${file}: existing hook contract`);
    const originalFunctions = functions(file, original), workingFunctions = functions(file, working);
    for (const [name, value] of originalFunctions) assert.equal(workingFunctions.get(name), value, `${file}: ${name}`);
  }
  const customerFile = 'app/c/[token]/page.tsx';
  const customerStatements = text => {
    const ast = tree(customerFile, text), result = {};
    walk(ast, node => {
      if (!ts.isFunctionDeclaration(node) || !node.name || !node.body || !['ClientePremiosPage', 'ProgressBar', 'RewardHeroPanel', 'RewardCard'].includes(node.name.text)) return;
      result[node.name.text] = node.body.statements.filter(statement => {
        if (ts.isReturnStatement(statement)) return false;
        // These are presentation-only early returns, with predicates compared
        // separately below; all server preparation and action bodies are frozen.
        if (ts.isIfStatement(statement) && containsJsx(statement)) return false;
        return true;
      }).map(statement => normalize(statement.getText(ast)));
      result[`${node.name.text}:early-guards`] = node.body.statements.filter(statement => ts.isIfStatement(statement) && containsJsx(statement)).map(statement => normalize(statement.expression.getText(ast)));
    });
    return result;
  };
  assert.deepEqual(customerStatements(current(customerFile)), customerStatements(before(customerFile)), 'Customer app: all server preparation, rules and reward formula statements remain unchanged');
});

test('functional event handlers and customer server actions remain wired into rendered controls', () => {
  const bindings = (file, text, names) => {
    const ast = tree(file, text), result = new Set();
    walk(ast, node => {
      if (!ts.isJsxAttribute(node) || !/^(?:on[A-Z]|action$|formAction$)/.test(node.name.getText(ast))) return;
      const identifiers = [];
      walk(node, child => { if (ts.isIdentifier(child)) identifiers.push(child.text); });
      if (identifiers.some(name => names.has(name))) {
        let binding = normalize(node.getText(ast));
        // The customer action remains underneath the existing explicit null
        // guard; optional chaining inside that branch is presentation-equivalent.
        // Do not canonicalize other expressions or unguarded action controls.
        if (file === 'app/(app)/clientes/[id]/page.tsx' && /(?:copiarMensaje|abrirWhatsApp|registrarAccion)\(accion\.tipo \|\| "cupon"\)/.test(binding)) {
          let parent = node.parent, guarded = false;
          while (parent) {
            if (ts.isConditionalExpression(parent) && normalize(parent.condition.getText(ast)) === 'fidelizacionActiva && accion') guarded = true;
            parent = parent.parent;
          }
          assert.ok(guarded, `${file}: customer action null-guard must remain`);
          binding = binding.replace(/accion\.tipo/g, 'accion?.tipo');
        }
        result.add(binding);
      }
    });
    return result;
  };
  for (const file of files) {
    const original = before(file), working = current(file);
    const names = new Set([...functions(file, original).keys()].map(name => name.split('/').at(-1)));
    const expected = bindings(file, original, names), actual = bindings(file, working, names);
    for (const binding of expected) assert.ok(actual.has(binding), `${file}: control lost its original action ${binding}`);
  }
});

test('new presentation modules cannot introduce network, storage or database work', () => {
  for (const file of [
    'app/(app)/components/product/ServiceClock.tsx', 'app/(app)/dashboard/ServiceArrivals.tsx',
    'app/(app)/reservas/ServiceDetail.tsx', 'app/(app)/clientes/CrmDialog.tsx', 'app/(app)/clientes/CustomerTimeline.tsx',
  ]) {
    const source = current(file);
    assert.deepEqual(dataCalls(file, source), [], file);
    assert.doesNotMatch(source, /supabase|service_role|fetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|server-only/, file);
  }
  // Explicit UI-only exception: the shell effect drives native dialog visibility.
  // Authentication/scope wrappers themselves are frozen by the first test.
  const layout = current('app/(app)/layout.tsx');
  assert.deepEqual(dataCalls('layout.tsx', layout), []);
  assert.match(layout, /dialog\.showModal\(\)/);
  assert.match(layout, /dialog\.close\(\)/);
  assert.match(layout, /<RestaurantScope><AuthGuard>/);
  assert.match(layout, /<ModuleRouteGuard>\{children\}<\/ModuleRouteGuard>/);
});

test('product CSS is explicitly scoped and customer styles remain local modules', () => {
  const panelCss = postcss.parse(current('app/(app)/components/product/product.css'));
  panelCss.walkRules(rule => {
    for (const selector of rule.selectors) assert.match(selector.trim(), /^\.gh-product-(?:shell|scope)(?:\b|\s|:)/, `Unscoped product selector: ${selector}`);
  });
  for (const file of [
    'app/(app)/components/product/modules.module.css', 'app/(app)/dashboard/service-board.module.css',
    'app/(app)/reservas/service.module.css', 'app/(app)/clientes/crm.module.css',
    'app/(app)/sala/sala.module.css', 'app/c/[token]/client-experience.module.css',
  ]) {
    const css = current(file);
    postcss.parse(css).walkRules(rule => {
      if (rule.parent?.type === 'atrule' && /keyframes$/.test(rule.parent.name)) return;
      // Descendant :global(.legacy-class) is safe only when a module-local
      // ancestor still owns the selector. A standalone global escape is not.
      for (const selector of rule.selectors) assert.match(selector.trim(), /^\.[a-zA-Z_][\w-]*(?:\s|[>+~:.#[\]]|$)/, `${file}: selector must start with a local class (${selector})`);
    });
  }
  assert.match(current('app/(app)/layout.tsx'), /gh-product-shell/);
  assert.match(current('app/(app)/layout.tsx'), /isProductSurface \? "gh-turno-scope gh-product-scope"/);
});

test('navigation keeps every destination, module guard, badge source and submenu capability', () => {
  const file = 'app/(app)/components/Sidebar.tsx';
  const arrays = (text) => {
    const ast = tree(file, text), result = {};
    walk(ast, node => {
      if (!ts.isVariableDeclaration(node) || !ts.isIdentifier(node.name) || !['itemsPrincipales', 'menuDigitalItems', 'camareroItems'].includes(node.name.text)) return;
      assert.ok(node.initializer && ts.isArrayLiteralExpression(node.initializer));
      result[node.name.text] = node.initializer.elements.map(element => {
        assert.ok(ts.isObjectLiteralExpression(element));
        return Object.fromEntries(element.properties.filter(property => ts.isPropertyAssignment(property) && ['href', 'visible', 'badge'].includes(property.name.getText(ast))).map(property => [property.name.getText(ast), normalize(property.initializer.getText(ast))]));
      });
    });
    return result;
  };
  const sidebar = current(file);
  assert.deepEqual(arrays(sidebar), arrays(before(file)));
  assert.match(sidebar, /modulos\.menu_digital\s*\?/);
  assert.match(sidebar, /modulos\.camarero_digital\s*\?/);
  assert.match(sidebar, /menuDigitalItems\.map/);
  assert.match(sidebar, /camareroItems\.map/);
  assert.match(sidebar, /href="\/ajustes"/);
  assert.match(sidebar, /onClick=\{cerrarSesion\}/);
  assert.match(sidebar, /aria-controls=\{`gh-menu-digital-\$\{mobile \? "mobile" : "desktop"\}`\}/);
  assert.match(sidebar, /aria-controls=\{`gh-camarero-digital-\$\{mobile \? "mobile" : "desktop"\}`\}/);
});
