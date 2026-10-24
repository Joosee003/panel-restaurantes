import { readFile, writeFile } from "node:fs/promises";

// Keep the approved editorial shell in the root preview. The served menu is
// generated from it, but product data always comes from GastroHelp's RPC.
const root = new URL("../../../../carta.html", import.meta.url);
const output = new URL("../public/new-talgo/carta.html", import.meta.url);
let page = await readFile(root, "utf8");
page = page.replaceAll("Consulta el avance de la carta de New Talgo en Segovia. Categorías provisionales pendientes de confirmar con el local.", "Consulta la carta digital de New Talgo en Segovia, con platos y precios actualizados desde el restaurante.");
page = page.replaceAll("La carta provisional · New Talgo Segovia", "La carta · New Talgo Segovia");
page = page.replace('<script src="app.js" defer></script>', '<script src="app.js" defer></script><script src="menu-live.js" defer></script>');
page = page.replace(/<div class="preview-banner">.*?<\/div>/s, "");
page = page.replace("LA CARTA · VISTA PREVIA", "LA CARTA · NEW TALGO");
page = page.replace("Ángel nos ha enviado fotografías de sus platos. Explora las categorías mientras completamos los nombres, precios y disponibilidad de la carta vigente.", "Descubre los platos publicados por New Talgo. La carta y sus precios se actualizan desde el panel del restaurante.");
page = page.replace("Fotografía enviada por Ángel.", "Fotografía facilitada por New Talgo.");
page = page.replace(/<section class="notice shell".*?<\/section>/s, "");
page = page.replace(/<section class="menu-v2-categories shell".*?<\/section>\s*(?=<section class="menu-v2-end">)/s, `
    <section class="menu-v2-categories shell" id="categorias" aria-labelledby="catalog-title">
      <div class="menu-v2-heading"><span class="section-number">01 — LA CARTA ACTUAL</span><h2 id="catalog-title">Elige lo que te <em>apetece comer.</em></h2><p>Platos y precios publicados desde el panel de New Talgo. Los productos ocultos no aparecen en esta carta.</p></div>
      <p id="live-menu-status" class="menu-live-status" role="status">Cargando la carta…</p>
      <nav id="live-menu-jump" class="menu-v2-jump" aria-label="Ir a una categoría de la carta"></nav>
      <div id="live-menu-list" class="menu-v2-list"></div>
      <p class="menu-v2-footnote">Consulta con el personal antes de pedir si necesitas información sobre ingredientes o alérgenos.</p>
    </section>
    `);
page = page.replace("Dirección, horarios, teléfono y carta pendientes de confirmar con Ángel.", "Consulta en el local la información de contacto y los horarios vigentes.");
page = page.replace("New Talgo · Vista previa local", "New Talgo");
page = page.replace("Sin reservas ni recogida online en esta fase", "Pedidos de recogida no disponibles desde esta web");
if (!page.includes('id="live-menu-list"') || page.includes('id="tapas"')) throw new Error("LIVE_MENU_PAGE_TRANSFORM_FAILED");
await writeFile(output, page, "utf8");
