"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Clock,
  Globe2,
  Info,
  Languages,
  Loader2,
  LockKeyhole,
  MessageSquare,
  Minus,
  Plus,
  Search,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Star,
  Trash2,
  Utensils,
  X,
} from "lucide-react";
import { supabase } from "../../(app)/lib/supabaseClient";

type LanguageCode =
  | "es"
  | "en"
  | "fr"
  | "de"
  | "it"
  | "pt"
  | "nl"
  | "sv"
  | "da"
  | "no"
  | "pl"
  | "ro"
  | "zh"
  | "ja"
  | "ko"
  | "ar"
  | "ru";

type TraduccionProducto = {
  nombre?: string;
  descripcion?: string | null;
  tipo?: string | null;
  alergenos?: string[] | null;
};

type TraduccionCategoria = {
  nombre?: string;
};

type CartaDigital = {
  id: string;
  restaurante_id: string;
  nombre: string;
  archivo_url: string | null;
  estado: string;
  public_token: string;
  created_at: string;
};

type Categoria = {
  id: string;
  carta_id: string;
  restaurante_id: string;
  nombre: string;
  orden: number;
  activa: boolean;
  traducciones?: Partial<Record<LanguageCode, TraduccionCategoria>> | null;
};

type Producto = {
  id: string;
  carta_id: string;
  categoria_id: string | null;
  restaurante_id: string;
  nombre: string;
  descripcion: string | null;
  precio: number | null;
  imagen_url: string | null;
  imagen_prompt: string | null;
  tipo: string | null;
  alergenos: string[] | null;
  recomendado: boolean;
  activo: boolean;
  orden: number;
  traducciones?: Partial<Record<LanguageCode, TraduccionProducto>> | null;
};

type CarritoItem = {
  producto: Producto;
  cantidad: number;
  notas: string;
};

type Recomendacion = {
  producto: Producto;
  motivo: string;
};

type MenuDiaSeccion = {
  nombre: string;
  opciones: {
    nombre: string;
    descripcion?: string | null;
    suplemento?: number | null;
    alergenos?: string[] | null;
  }[];
};

type MenuDiaQR = {
  id: string;
  restaurante_id: string;
  carta_id: string | null;
  titulo: string;
  descripcion: string | null;
  precio: number;
  activo: boolean;
  fecha_desde: string | null;
  fecha_hasta: string | null;
  dias_semana: number[] | null;
  hora_inicio: string | null;
  hora_fin: string | null;
  secciones: MenuDiaSeccion[] | null;
  traducciones?: Partial<Record<LanguageCode, { titulo?: string; descripcion?: string | null; secciones?: MenuDiaSeccion[] | null }>> | null;
  orden: number;
};

const idiomasDisponibles: {
  code: LanguageCode;
  label: string;
  nombre: string;
  bandera: string;
}[] = [
  { code: "es", label: "ES", nombre: "Español", bandera: "🇪🇸" },
  { code: "en", label: "EN", nombre: "English", bandera: "🇬🇧" },
  { code: "fr", label: "FR", nombre: "Français", bandera: "🇫🇷" },
  { code: "de", label: "DE", nombre: "Deutsch", bandera: "🇩🇪" },
  { code: "it", label: "IT", nombre: "Italiano", bandera: "🇮🇹" },
  { code: "pt", label: "PT", nombre: "Português", bandera: "🇵🇹" },
];

const textosBase = {
  es: {
    cargandoCarta: "Cargando carta...",
    preparandoCarta: "Preparando la carta del restaurante",
    cartaNoDisponible: "Carta no disponible",
    cartaDigital: "Carta digital",
    mesa: "Mesa",
    sinMesa: "Sin mesa",
    eligePlatos:
      "Elige tus platos favoritos y envía el pedido directamente a cocina.",
    productos: "Productos",
    categorias: "Categorías",
    destacados: "Destacados",
    disponibleIdiomas: "Carta disponible en varios idiomas",
    seleccionarIdioma: "Selecciona idioma",
    buscarPlaceholder: "Buscar plato, bebida o postre...",
    pedidoEnviado: "Pedido enviado correctamente",
    cocinaRecibido: "Cocina ya ha recibido tu pedido.",
    error: "Error",
    todas: "Todas",
    recomendados: "Recomendados",
    loMasDestacado: "Lo más destacado",
    categoria: "Categoría",
    noHayProductos: "No hay productos",
    pruebaOtraBusqueda: "Prueba con otra categoría o búsqueda.",
    tuPedido: "Tu pedido",
    productoSingular: "producto",
    productosPlural: "productos",
    verPedido: "Ver pedido",
    enviarPedido: "Enviar pedido",
    pedidoVacio: "Tu pedido está vacío",
    añadeProducto: "Añade algún producto de la carta.",
    total: "Total",
    llegaCocina: "El pedido llegará directamente a cocina",
    recomendado: "Recomendado",
    añadir: "Añadir",
    cantidad: "Cantidad",
    alergenos: "Alérgenos",
    sinAlergenos: "Sin alérgenos indicados",
    notaProducto: "Nota para este producto",
    notaProductoPlaceholder: "Ej: sin cebolla, poco hecho, sin salsa...",
    notaGeneral: "Nota general para cocina",
    notaGeneralPlaceholder: "Ej: sacar todo junto, alergia, traer pan...",
    recomendacionTitulo: "Recomendación para completar tu pedido",
    antesEnviar: "Antes de enviar, te puede interesar",
    recomendacionTexto:
      "Según lo que has elegido, estos productos encajan bien con tu pedido.",
    añadirPedido: "Añadir al pedido",
    enviarSinAñadir: "Enviar sin añadir nada",
    bebidaMotivo: "Una bebida encaja bien para completar el pedido.",
    postreMotivo: "Un postre puede ser una buena forma de terminar el pedido.",
    principalMotivo:
      "Has elegido un entrante. Puedes añadir un plato principal para completar.",
    burgerMotivo: "Combina muy bien con una hamburguesa.",
    bbqMotivo: "Combina muy bien con platos BBQ.",
    destacadoMotivo: "Es uno de los productos destacados de la carta.",
    avisoIdioma:
      "Si falta una traducción, se mostrará el texto original en español para no dejar la carta vacía.",
    evitarAlergenos: "Evitar alérgenos",
    limpiar: "Limpiar",
    filtroAlergenoTexto: "Oculta platos que contengan los alérgenos seleccionados.",
    productosOcultosFiltro: "Algunos platos se han ocultado por el filtro de alérgenos.",
    completarPedido: "Completa tu pedido",
    añadirAhora: "Añadir ahora",
    verDetalles: "Ver detalles",
    detalleProducto: "Detalle del producto",
    cierreDetalle: "Cerrar detalle",
    idealParaCompartir: "Ideal para compartir",
    buenaEleccion: "Buena elección",
    sinIngredientesCriticos: "Sin alérgenos marcados",    menuDelDia: "Menú del día",
    disponibleAhora: "Disponible ahora",
    horario: "Horario",
    elegirMenu: "Añadir menú",
    desde: "Desde",
    incluye: "Incluye",
    suplemento: "Suplemento",
    cartaNormal: "Carta",

  },
  en: {
    cargandoCarta: "Loading menu...",
    preparandoCarta: "Preparing the restaurant menu",
    cartaNoDisponible: "Menu unavailable",
    cartaDigital: "Digital menu",
    mesa: "Table",
    sinMesa: "No table",
    eligePlatos:
      "Choose your favorite dishes and send the order directly to the kitchen.",
    productos: "Items",
    categorias: "Categories",
    destacados: "Featured",
    disponibleIdiomas: "Menu available in several languages",
    seleccionarIdioma: "Select language",
    buscarPlaceholder: "Search dish, drink or dessert...",
    pedidoEnviado: "Order sent successfully",
    cocinaRecibido: "The kitchen has received your order.",
    error: "Error",
    todas: "All",
    recomendados: "Recommended",
    loMasDestacado: "Highlights",
    categoria: "Category",
    noHayProductos: "No items found",
    pruebaOtraBusqueda: "Try another category or search.",
    tuPedido: "Your order",
    productoSingular: "item",
    productosPlural: "items",
    verPedido: "View order",
    enviarPedido: "Send order",
    pedidoVacio: "Your order is empty",
    añadeProducto: "Add an item from the menu.",
    total: "Total",
    llegaCocina: "The order will go directly to the kitchen",
    recomendado: "Recommended",
    añadir: "Add",
    cantidad: "Qty",
    alergenos: "Allergens",
    sinAlergenos: "No allergens listed",
    notaProducto: "Note for this item",
    notaProductoPlaceholder: "E.g. no onion, medium rare, no sauce...",
    notaGeneral: "General note for kitchen",
    notaGeneralPlaceholder: "E.g. serve together, allergy, bring bread...",
    recomendacionTitulo: "Recommendation to complete your order",
    antesEnviar: "Before sending, you may like",
    recomendacionTexto:
      "Based on your selection, these items go well with your order.",
    añadirPedido: "Add to order",
    enviarSinAñadir: "Send without adding",
    bebidaMotivo: "A drink would complete your order well.",
    postreMotivo: "A dessert can be a good way to finish your order.",
    principalMotivo:
      "You chose a starter. You can add a main dish to complete it.",
    burgerMotivo: "Goes very well with a burger.",
    bbqMotivo: "Goes very well with BBQ dishes.",
    destacadoMotivo: "It is one of the featured items on the menu.",
    avisoIdioma:
      "Buttons change language. Dishes will be translated when translations are saved.",
    evitarAlergenos: "Avoid allergens",
    limpiar: "Clear",
    filtroAlergenoTexto: "Hides dishes containing the selected allergens.",
    productosOcultosFiltro: "Some dishes are hidden by the allergen filter.",
    completarPedido: "Complete your order",
    añadirAhora: "Add now",
    verDetalles: "View details",
    detalleProducto: "Product details",
    cierreDetalle: "Close details",
    idealParaCompartir: "Great to share",
    buenaEleccion: "Good choice",
    sinIngredientesCriticos: "No allergens marked",    menuDelDia: "Daily menu",
    disponibleAhora: "Available now",
    horario: "Schedule",
    elegirMenu: "Add menu",
    desde: "From",
    incluye: "Includes",
    suplemento: "Extra",
    cartaNormal: "Menu",

  },
  fr: {
    cargandoCarta: "Chargement de la carte...",
    preparandoCarta: "Préparation de la carte du restaurant",
    cartaNoDisponible: "Carte non disponible",
    cartaDigital: "Carte digitale",
    mesa: "Table",
    sinMesa: "Sans table",
    eligePlatos:
      "Choisissez vos plats préférés et envoyez la commande directement en cuisine.",
    productos: "Produits",
    categorias: "Catégories",
    destacados: "Sélection",
    disponibleIdiomas: "Carte disponible en plusieurs langues",
    seleccionarIdioma: "Choisir la langue",
    buscarPlaceholder: "Rechercher plat, boisson ou dessert...",
    pedidoEnviado: "Commande envoyée avec succès",
    cocinaRecibido: "La cuisine a reçu votre commande.",
    error: "Erreur",
    todas: "Toutes",
    recomendados: "Recommandés",
    loMasDestacado: "À ne pas manquer",
    categoria: "Catégorie",
    noHayProductos: "Aucun produit",
    pruebaOtraBusqueda: "Essayez une autre catégorie ou recherche.",
    tuPedido: "Votre commande",
    productoSingular: "produit",
    productosPlural: "produits",
    verPedido: "Voir commande",
    enviarPedido: "Envoyer commande",
    pedidoVacio: "Votre commande est vide",
    añadeProducto: "Ajoutez un produit de la carte.",
    total: "Total",
    llegaCocina: "La commande ira directement en cuisine",
    recomendado: "Recommandé",
    añadir: "Ajouter",
    cantidad: "Qté",
    alergenos: "Allergènes",
    sinAlergenos: "Aucun allergène indiqué",
    notaProducto: "Note pour ce produit",
    notaProductoPlaceholder: "Ex : sans oignon, cuisson moyenne, sans sauce...",
    notaGeneral: "Note générale pour la cuisine",
    notaGeneralPlaceholder:
      "Ex : servir ensemble, allergie, apporter du pain...",
    recomendacionTitulo: "Suggestion pour compléter votre commande",
    antesEnviar: "Avant d’envoyer, cela peut vous intéresser",
    recomendacionTexto:
      "Selon votre choix, ces produits vont bien avec votre commande.",
    añadirPedido: "Ajouter à la commande",
    enviarSinAñadir: "Envoyer sans ajouter",
    bebidaMotivo: "Une boisson complète bien votre commande.",
    postreMotivo: "Un dessert peut être une bonne façon de terminer.",
    principalMotivo:
      "Vous avez choisi une entrée. Vous pouvez ajouter un plat principal.",
    burgerMotivo: "Va très bien avec un burger.",
    bbqMotivo: "Va très bien avec les plats BBQ.",
    destacadoMotivo: "C’est l’un des produits sélectionnés de la carte.",
    avisoIdioma:
      "Les boutons changent de langue. Les plats seront traduits lorsque les traductions seront enregistrées.",
    evitarAlergenos: "Éviter allergènes",
    limpiar: "Effacer",
    filtroAlergenoTexto: "Masque les plats contenant les allergènes sélectionnés.",
    productosOcultosFiltro: "Certains plats sont masqués par le filtre d’allergènes.",
    completarPedido: "Compléter commande",
    añadirAhora: "Ajouter maintenant",
    verDetalles: "Voir détails",
    detalleProducto: "Détail du produit",
    cierreDetalle: "Fermer",
    idealParaCompartir: "Idéal à partager",
    buenaEleccion: "Bon choix",
    sinIngredientesCriticos: "Aucun allergène indiqué",    menuDelDia: "Menu du jour",
    disponibleAhora: "Disponible maintenant",
    horario: "Horaire",
    elegirMenu: "Ajouter menu",
    desde: "À partir de",
    incluye: "Comprend",
    suplemento: "Supplément",
    cartaNormal: "Carte",

  },
  de: {
    cargandoCarta: "Speisekarte wird geladen...",
    preparandoCarta: "Restaurantkarte wird vorbereitet",
    cartaNoDisponible: "Speisekarte nicht verfügbar",
    cartaDigital: "Digitale Speisekarte",
    mesa: "Tisch",
    sinMesa: "Kein Tisch",
    eligePlatos:
      "Wähle deine Lieblingsgerichte und sende die Bestellung direkt an die Küche.",
    productos: "Produkte",
    categorias: "Kategorien",
    destacados: "Highlights",
    disponibleIdiomas: "Speisekarte in mehreren Sprachen verfügbar",
    seleccionarIdioma: "Sprache auswählen",
    buscarPlaceholder: "Gericht, Getränk oder Dessert suchen...",
    pedidoEnviado: "Bestellung erfolgreich gesendet",
    cocinaRecibido: "Die Küche hat deine Bestellung erhalten.",
    error: "Fehler",
    todas: "Alle",
    recomendados: "Empfohlen",
    loMasDestacado: "Highlights",
    categoria: "Kategorie",
    noHayProductos: "Keine Produkte",
    pruebaOtraBusqueda: "Versuche eine andere Kategorie oder Suche.",
    tuPedido: "Deine Bestellung",
    productoSingular: "Produkt",
    productosPlural: "Produkte",
    verPedido: "Bestellung ansehen",
    enviarPedido: "Bestellung senden",
    pedidoVacio: "Deine Bestellung ist leer",
    añadeProducto: "Füge ein Produkt aus der Karte hinzu.",
    total: "Gesamt",
    llegaCocina: "Die Bestellung geht direkt an die Küche",
    recomendado: "Empfohlen",
    añadir: "Hinzufügen",
    cantidad: "Menge",
    alergenos: "Allergene",
    sinAlergenos: "Keine Allergene angegeben",
    notaProducto: "Notiz zu diesem Produkt",
    notaProductoPlaceholder: "Z. B. ohne Zwiebel, medium, ohne Sauce...",
    notaGeneral: "Allgemeine Notiz für die Küche",
    notaGeneralPlaceholder:
      "Z. B. alles zusammen, Allergie, Brot bringen...",
    recomendacionTitulo: "Empfehlung zum Ergänzen deiner Bestellung",
    antesEnviar: "Vor dem Senden könnte dich interessieren",
    recomendacionTexto:
      "Basierend auf deiner Auswahl passen diese Produkte gut dazu.",
    añadirPedido: "Zur Bestellung hinzufügen",
    enviarSinAñadir: "Ohne Hinzufügen senden",
    bebidaMotivo: "Ein Getränk passt gut zu deiner Bestellung.",
    postreMotivo: "Ein Dessert ist ein guter Abschluss.",
    principalMotivo:
      "Du hast eine Vorspeise gewählt. Du kannst ein Hauptgericht hinzufügen.",
    burgerMotivo: "Passt sehr gut zu einem Burger.",
    bbqMotivo: "Passt sehr gut zu BBQ-Gerichten.",
    destacadoMotivo: "Es ist eines der Highlights der Speisekarte.",
    avisoIdioma:
      "Die Buttons wechseln die Sprache. Gerichte werden übersetzt, wenn Übersetzungen gespeichert sind.",
    evitarAlergenos: "Allergene vermeiden",
    limpiar: "Leeren",
    filtroAlergenoTexto: "Blendet Gerichte mit den ausgewählten Allergenen aus.",
    productosOcultosFiltro: "Einige Gerichte werden durch den Allergenfilter ausgeblendet.",
    completarPedido: "Bestellung ergänzen",
    añadirAhora: "Jetzt hinzufügen",
    verDetalles: "Details ansehen",
    detalleProducto: "Produktdetails",
    cierreDetalle: "Schließen",
    idealParaCompartir: "Ideal zum Teilen",
    buenaEleccion: "Gute Wahl",
    sinIngredientesCriticos: "Keine Allergene markiert",    menuDelDia: "Tagesmenü",
    disponibleAhora: "Jetzt verfügbar",
    horario: "Uhrzeit",
    elegirMenu: "Menü hinzufügen",
    desde: "Ab",
    incluye: "Enthält",
    suplemento: "Aufpreis",
    cartaNormal: "Speisekarte",

  },
  it: {
    cargandoCarta: "Caricamento menù...",
    preparandoCarta: "Preparazione del menù del ristorante",
    cartaNoDisponible: "Menù non disponibile",
    cartaDigital: "Menù digitale",
    mesa: "Tavolo",
    sinMesa: "Senza tavolo",
    eligePlatos:
      "Scegli i tuoi piatti preferiti e invia l’ordine direttamente in cucina.",
    productos: "Prodotti",
    categorias: "Categorie",
    destacados: "In evidenza",
    disponibleIdiomas: "Menù disponibile in più lingue",
    seleccionarIdioma: "Seleziona lingua",
    buscarPlaceholder: "Cerca piatto, bevanda o dessert...",
    pedidoEnviado: "Ordine inviato correttamente",
    cocinaRecibido: "La cucina ha ricevuto il tuo ordine.",
    error: "Errore",
    todas: "Tutte",
    recomendados: "Consigliati",
    loMasDestacado: "In evidenza",
    categoria: "Categoria",
    noHayProductos: "Nessun prodotto",
    pruebaOtraBusqueda: "Prova un’altra categoria o ricerca.",
    tuPedido: "Il tuo ordine",
    productoSingular: "prodotto",
    productosPlural: "prodotti",
    verPedido: "Vedi ordine",
    enviarPedido: "Invia ordine",
    pedidoVacio: "Il tuo ordine è vuoto",
    añadeProducto: "Aggiungi un prodotto dal menù.",
    total: "Totale",
    llegaCocina: "L’ordine arriverà direttamente in cucina",
    recomendado: "Consigliato",
    añadir: "Aggiungi",
    cantidad: "Qtà",
    alergenos: "Allergeni",
    sinAlergenos: "Nessun allergene indicato",
    notaProducto: "Nota per questo prodotto",
    notaProductoPlaceholder:
      "Es: senza cipolla, media cottura, senza salsa...",
    notaGeneral: "Nota generale per la cucina",
    notaGeneralPlaceholder:
      "Es: servire tutto insieme, allergia, portare pane...",
    recomendacionTitulo: "Consiglio per completare il tuo ordine",
    antesEnviar: "Prima di inviare, potrebbe interessarti",
    recomendacionTexto:
      "In base alla tua scelta, questi prodotti si abbinano bene.",
    añadirPedido: "Aggiungi all’ordine",
    enviarSinAñadir: "Invia senza aggiungere",
    bebidaMotivo: "Una bevanda completa bene il tuo ordine.",
    postreMotivo: "Un dessert può essere un buon finale.",
    principalMotivo:
      "Hai scelto un antipasto. Puoi aggiungere un piatto principale.",
    burgerMotivo: "Si abbina molto bene a un hamburger.",
    bbqMotivo: "Si abbina molto bene ai piatti BBQ.",
    destacadoMotivo: "È uno dei prodotti in evidenza del menù.",
    avisoIdioma:
      "I pulsanti cambiano lingua. I piatti saranno tradotti quando le traduzioni saranno salvate.",
    evitarAlergenos: "Evitare allergeni",
    limpiar: "Pulisci",
    filtroAlergenoTexto: "Nasconde i piatti con gli allergeni selezionati.",
    productosOcultosFiltro: "Alcuni piatti sono nascosti dal filtro allergeni.",
    completarPedido: "Completa ordine",
    añadirAhora: "Aggiungi ora",
    verDetalles: "Vedi dettagli",
    detalleProducto: "Dettaglio prodotto",
    cierreDetalle: "Chiudi",
    idealParaCompartir: "Ideale da condividere",
    buenaEleccion: "Buona scelta",
    sinIngredientesCriticos: "Nessun allergene indicato",    menuDelDia: "Menù del giorno",
    disponibleAhora: "Disponibile ora",
    horario: "Orario",
    elegirMenu: "Aggiungi menù",
    desde: "Da",
    incluye: "Include",
    suplemento: "Supplemento",
    cartaNormal: "Menù",

  },
  pt: {
    cargandoCarta: "A carregar menu...",
    preparandoCarta: "A preparar o menu do restaurante",
    cartaNoDisponible: "Menu indisponível",
    cartaDigital: "Menu digital",
    mesa: "Mesa",
    sinMesa: "Sem mesa",
    eligePlatos:
      "Escolhe os teus pratos favoritos e envia o pedido diretamente para a cozinha.",
    productos: "Produtos",
    categorias: "Categorias",
    destacados: "Destaques",
    disponibleIdiomas: "Menu disponível em vários idiomas",
    seleccionarIdioma: "Selecionar idioma",
    buscarPlaceholder: "Procurar prato, bebida ou sobremesa...",
    pedidoEnviado: "Pedido enviado corretamente",
    cocinaRecibido: "A cozinha recebeu o teu pedido.",
    error: "Erro",
    todas: "Todas",
    recomendados: "Recomendados",
    loMasDestacado: "Destaques",
    categoria: "Categoria",
    noHayProductos: "Não há produtos",
    pruebaOtraBusqueda: "Experimenta outra categoria ou pesquisa.",
    tuPedido: "O teu pedido",
    productoSingular: "produto",
    productosPlural: "produtos",
    verPedido: "Ver pedido",
    enviarPedido: "Enviar pedido",
    pedidoVacio: "O teu pedido está vazio",
    añadeProducto: "Adiciona um produto do menu.",
    total: "Total",
    llegaCocina: "O pedido chegará diretamente à cozinha",
    recomendado: "Recomendado",
    añadir: "Adicionar",
    cantidad: "Qtd",
    alergenos: "Alergénios",
    sinAlergenos: "Sem alergénios indicados",
    notaProducto: "Nota para este produto",
    notaProductoPlaceholder: "Ex: sem cebola, mal passado, sem molho...",
    notaGeneral: "Nota geral para a cozinha",
    notaGeneralPlaceholder:
      "Ex: servir tudo junto, alergia, trazer pão...",
    recomendacionTitulo: "Recomendação para completar o pedido",
    antesEnviar: "Antes de enviar, pode interessar-te",
    recomendacionTexto:
      "Com base na tua escolha, estes produtos combinam bem.",
    añadirPedido: "Adicionar ao pedido",
    enviarSinAñadir: "Enviar sem adicionar",
    bebidaMotivo: "Uma bebida combina bem para completar o pedido.",
    postreMotivo: "Uma sobremesa pode ser uma boa forma de terminar.",
    principalMotivo:
      "Escolheste uma entrada. Podes adicionar um prato principal.",
    burgerMotivo: "Combina muito bem com hambúrguer.",
    bbqMotivo: "Combina muito bem com pratos BBQ.",
    destacadoMotivo: "É um dos produtos destacados do menu.",
    avisoIdioma:
      "Os botões mudam de idioma. Os pratos serão traduzidos quando as traduções forem guardadas.",
    evitarAlergenos: "Evitar alergénios",
    limpiar: "Limpar",
    filtroAlergenoTexto: "Oculta pratos com os alergénios selecionados.",
    productosOcultosFiltro: "Alguns pratos foram ocultados pelo filtro de alergénios.",
    completarPedido: "Completar pedido",
    añadirAhora: "Adicionar agora",
    verDetalles: "Ver detalhes",
    detalleProducto: "Detalhe do produto",
    cierreDetalle: "Fechar",
    idealParaCompartir: "Ideal para partilhar",
    buenaEleccion: "Boa escolha",
    sinIngredientesCriticos: "Sem alergénios indicados",    menuDelDia: "Menu do dia",
    disponibleAhora: "Disponível agora",
    horario: "Horário",
    elegirMenu: "Adicionar menu",
    desde: "Desde",
    incluye: "Inclui",
    suplemento: "Suplemento",
    cartaNormal: "Menu",

  },
};

const textos: Record<LanguageCode, Record<string, string>> = {
  es: textosBase.es,
  en: textosBase.en,
  fr: textosBase.fr,
  de: textosBase.de,
  it: textosBase.it,
  pt: textosBase.pt,
  nl: textosBase.en,
  sv: textosBase.en,
  da: textosBase.en,
  no: textosBase.en,
  pl: textosBase.en,
  ro: textosBase.en,
  zh: textosBase.en,
  ja: textosBase.en,
  ko: textosBase.en,
  ar: textosBase.en,
  ru: textosBase.en,
};

const imagenesFallback = [
  "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?q=80&w=1200&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?q=80&w=1200&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1550547660-d9450f859349?q=80&w=1200&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1544025162-d76694265947?q=80&w=1200&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1565958011703-44f9829ba187?q=80&w=1200&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1581006852262-e4307cf6283a?q=80&w=1200&auto=format&fit=crop",
];

export default function CartaPublicaPage() {
  const params = useParams();
  const searchParams = useSearchParams();

  const token = String(params?.token || "");
  const mesa = searchParams.get("mesa");
  const mesaId = searchParams.get("mesaId");
  const accessToken = searchParams.get("access");
  const vistaPreviaMenu =
    searchParams.get("previewMenu") === "1" || searchParams.get("demoMenu") === "1";

  const [idioma, setIdioma] = useState<LanguageCode>("es");
  const [mostrarIdiomas, setMostrarIdiomas] = useState(false);
  const [carta, setCarta] = useState<CartaDigital | null>(null);
  const [restauranteNombre, setRestauranteNombre] = useState<string | null>(null);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [carrito, setCarrito] = useState<CarritoItem[]>([]);
  const [categoriaActiva, setCategoriaActiva] = useState<string>("todas");
  const [busqueda, setBusqueda] = useState("");
  const [notasPedido, setNotasPedido] = useState("");
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pedidoEnviado, setPedidoEnviado] = useState(false);
  const [modalRecomendacion, setModalRecomendacion] = useState(false);
  const [mostrarCarritoMovil, setMostrarCarritoMovil] = useState(false);
  const [mostrarAvisoIdioma, setMostrarAvisoIdioma] = useState(false);
  const [alergenosBloqueados, setAlergenosBloqueados] = useState<string[]>([]);
  const [productoDetalle, setProductoDetalle] = useState<Producto | null>(null);
  const [menusDia, setMenusDia] = useState<MenuDiaQR[]>([]);
  const [accesoPedido, setAccesoPedido] = useState<"comprobando" | "valido" | "invalido">(
    "comprobando"
  );

  const idiomaActual =
    idiomasDisponibles.find((item) => item.code === idioma) ||
    idiomasDisponibles[0];

  const t = (key: string) => textos[idioma]?.[key] || textos.es[key] || key;

  const nombreCartaPublica = useMemo(() => {
    if (restauranteNombre) return restauranteNombre;

    const nombre = carta?.nombre?.trim();

    if (!nombre) return t("cartaDigital");

    const nombreNormalizado = nombre.toLowerCase();

    if (
      nombreNormalizado.includes("carta generada") ||
      nombreNormalizado.includes("ia")
    ) {
      return t("cartaDigital");
    }

    return nombre;
  }, [carta, restauranteNombre, idioma]);

  useEffect(() => {
    const idiomaUrl = searchParams.get("lang")?.toLowerCase();
    const idiomaGuardado =
      typeof window !== "undefined"
        ? window.localStorage.getItem("carta_idioma")
        : null;

    const navegador =
      typeof navigator !== "undefined"
        ? navigator.language.slice(0, 2).toLowerCase()
        : "es";

    const candidato = (idiomaUrl || idiomaGuardado || navegador) as LanguageCode;

    if (idiomasDisponibles.some((item) => item.code === candidato)) {
      setIdioma(candidato);
    }
  }, [searchParams]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("carta_idioma", idioma);
    }
  }, [idioma]);

  useEffect(() => {
    cargarCarta();
  }, [token]);

  useEffect(() => {
    comprobarAccesoPedido();
  }, [token, mesaId, accessToken]);

  async function comprobarAccesoPedido() {
    setAccesoPedido("comprobando");

    if (!token || !mesaId || !accessToken) {
      setAccesoPedido("invalido");
      return;
    }

    const { data, error: accesoError } = await supabase.rpc("validar_acceso_pedido_qr", {
      p_public_token: token,
      p_mesa_id: mesaId,
      p_access_token: accessToken,
    });

    if (accesoError) {
      console.error(accesoError);
      setAccesoPedido("invalido");
      return;
    }

    const resultado = Array.isArray(data) ? data[0] : data;
    setAccesoPedido(resultado?.valido === true ? "valido" : "invalido");
  }

  async function cargarCarta() {
    setCargando(true);
    setError(null);

    try {
      const { data, error: cartaError } = await supabase.rpc(
        "obtener_carta_publica",
        { p_public_token: token },
      );

      if (cartaError) throw cartaError;

      const payload = data as {
        carta?: CartaDigital;
        restaurante_nombre?: string | null;
        categorias?: Categoria[];
        productos?: Producto[];
        menus?: MenuDiaQR[];
      } | null;

      if (!payload?.carta) throw new Error("No se ha encontrado la carta.");

      setCarta(payload.carta);
      setRestauranteNombre(payload.restaurante_nombre || null);
      setCategorias(Array.isArray(payload.categorias) ? payload.categorias : []);
      setProductos(Array.isArray(payload.productos) ? payload.productos : []);
      setMenusDia(Array.isArray(payload.menus) ? payload.menus : []);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "No se pudo cargar la carta.");
    } finally {
      setCargando(false);
    }
  }

  function cambiarIdioma(nuevoIdioma: LanguageCode) {
    setIdioma(nuevoIdioma);
    setMostrarIdiomas(false);
    setMostrarAvisoIdioma(nuevoIdioma !== "es");

    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (nuevoIdioma === "es") {
        url.searchParams.delete("lang");
      } else {
        url.searchParams.set("lang", nuevoIdioma);
      }
      window.history.replaceState(null, "", url.toString());
    }

    if (nuevoIdioma !== "es") {
      setTimeout(() => {
        setMostrarAvisoIdioma(false);
      }, 5200);
    }
  }

  function leerTraduccionCategoria(categoria: Categoria, idiomaActivo: LanguageCode) {
    const traduccion = categoria.traducciones?.[idiomaActivo] as any;

    if (!traduccion) return categoria.nombre;
    if (typeof traduccion === "string") return traduccion || categoria.nombre;

    return traduccion.nombre || categoria.nombre;
  }

  function leerTraduccionProducto(producto: Producto, idiomaActivo: LanguageCode) {
    const traduccion = producto.traducciones?.[idiomaActivo] as any;

    if (!traduccion || typeof traduccion === "string") {
      return null;
    }

    return traduccion as TraduccionProducto;
  }

  function getCategoriaNombre(categoria: Categoria) {
    if (idioma === "es") return categoria.nombre;

    return leerTraduccionCategoria(categoria, idioma);
  }

  function getProductoTexto(producto: Producto) {
    const traduccion = idioma !== "es" ? leerTraduccionProducto(producto, idioma) : null;

    return {
      nombre: traduccion?.nombre || producto.nombre,
      descripcion:
        traduccion?.descripcion !== undefined
          ? traduccion.descripcion
          : producto.descripcion,
      tipo: traduccion?.tipo || producto.tipo,
      alergenos: traduccion?.alergenos || producto.alergenos || [],
    };
  }

  function getMenuTexto(menu: MenuDiaQR): {
    titulo: string;
    descripcion: string | null;
    secciones: MenuDiaSeccion[];
  } {
    const traduccion = idioma !== "es" ? menu.traducciones?.[idioma] : null;

    return {
      titulo: traduccion?.titulo || menu.titulo,
      descripcion:
        traduccion?.descripcion !== undefined
          ? traduccion.descripcion || null
          : menu.descripcion,
      secciones: Array.isArray(traduccion?.secciones)
        ? traduccion.secciones
        : Array.isArray(menu.secciones)
          ? menu.secciones
          : [],
    };
  }

  function fechaLocalISO(fecha: Date) {
    const year = fecha.getFullYear();
    const month = String(fecha.getMonth() + 1).padStart(2, "0");
    const day = String(fecha.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function menuDisponibleAhora(menu: MenuDiaQR, forzarVistaPrevia = false) {
    if (forzarVistaPrevia) return true;

    const ahora = new Date();
    const hoyISO = fechaLocalISO(ahora);
    const diaSemana = ahora.getDay();
    const minutosAhora = ahora.getHours() * 60 + ahora.getMinutes();

    if (menu.fecha_desde && hoyISO < menu.fecha_desde) return false;
    if (menu.fecha_hasta && hoyISO > menu.fecha_hasta) return false;
    if (menu.dias_semana?.length && !menu.dias_semana.includes(diaSemana)) {
      return false;
    }

    const inicio = horaAMinutos(menu.hora_inicio);
    const fin = horaAMinutos(menu.hora_fin);

    if (inicio !== null && minutosAhora < inicio) return false;
    if (fin !== null && minutosAhora > fin) return false;

    return true;
  }

  function horaAMinutos(valor: string | null | undefined) {
    if (!valor) return null;
    const [horas, minutos] = valor.split(":").map(Number);
    if (Number.isNaN(horas) || Number.isNaN(minutos)) return null;
    return horas * 60 + minutos;
  }

  function convertirMenuAProducto(menu: MenuDiaQR): Producto {
    const textoMenu = getMenuTexto(menu);
    const descripcion = [
      textoMenu.descripcion,
      ...(textoMenu.secciones || []).map((seccion: MenuDiaSeccion) => {
        const opciones = (seccion.opciones || [])
          .map((opcion: MenuDiaSeccion["opciones"][number]) => opcion.nombre)
          .join(", ");
        return opciones ? `${seccion.nombre}: ${opciones}` : seccion.nombre;
      }),
    ]
      .filter(Boolean)
      .join(" · ");

    return {
      id: `menu-${menu.id}`,
      carta_id: menu.carta_id || carta?.id || "",
      categoria_id: null,
      restaurante_id: menu.restaurante_id,
      nombre: textoMenu.titulo,
      descripcion,
      precio: Number(menu.precio || 0),
      imagen_url: null,
      imagen_prompt: null,
      tipo: t("menuDelDia"),
      alergenos: [],
      recomendado: true,
      activo: true,
      orden: menu.orden || 0,
    };
  }

  function normalizarTextoFiltro(valor: string) {
    return valor
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  }

  function toggleFiltroAlergeno(alergeno: string) {
    setAlergenosBloqueados((actuales) =>
      actuales.includes(alergeno)
        ? actuales.filter((item) => item !== alergeno)
        : [...actuales, alergeno]
    );
  }

  const alergenosDisponiblesCarta = useMemo(() => {
    const mapa = new Map<string, string>();

    productos.forEach((producto) => {
      const textoProducto = getProductoTexto(producto);

      (textoProducto.alergenos || []).forEach((alergeno) => {
        const limpio = alergeno.trim();
        if (!limpio) return;
        mapa.set(normalizarTextoFiltro(limpio), limpio);
      });
    });

    return Array.from(mapa.values()).sort((a, b) => a.localeCompare(b));
  }, [productos, idioma]);

  const productosFiltrados = useMemo(() => {
    return productos.filter((producto) => {
      const coincideCategoria =
        categoriaActiva === "todas" || producto.categoria_id === categoriaActiva;

      const textoProducto = getProductoTexto(producto);

      const texto = `${textoProducto.nombre} ${textoProducto.descripcion || ""} ${
        textoProducto.tipo || ""
      } ${(textoProducto.alergenos || []).join(" ")} ${producto.nombre} ${
        producto.descripcion || ""
      } ${producto.tipo || ""}`.toLowerCase();

      const coincideBusqueda = texto.includes(busqueda.toLowerCase().trim());

      const alergenosProducto = (textoProducto.alergenos || []).map((alergeno) =>
        normalizarTextoFiltro(alergeno)
      );

      const bloqueadoPorAlergeno = alergenosBloqueados.some((alergeno) =>
        alergenosProducto.includes(normalizarTextoFiltro(alergeno))
      );

      return coincideCategoria && coincideBusqueda && !bloqueadoPorAlergeno;
    });
  }, [productos, categoriaActiva, busqueda, idioma, alergenosBloqueados]);

  const productosPorCategoria = useMemo(() => {
    return categorias
      .map((categoria) => ({
        categoria,
        productos: productosFiltrados.filter(
          (producto) => producto.categoria_id === categoria.id
        ),
      }))
      .filter((grupo) => grupo.productos.length > 0);
  }, [categorias, productosFiltrados]);

  const destacados = productos
    .filter((producto) => producto.recomendado)
    .slice(0, 5);

  const totalCarrito = carrito.reduce((total, item) => {
    return total + Number(item.producto.precio || 0) * item.cantidad;
  }, 0);

  const unidadesCarrito = carrito.reduce(
    (total, item) => total + item.cantidad,
    0
  );

  const recomendaciones = useMemo(() => {
    return obtenerRecomendaciones(productos, carrito, t);
  }, [productos, carrito, idioma]);

  const menusActivos = useMemo(() => {
    return menusDia.filter((menu) => menu.activo && menuDisponibleAhora(menu, vistaPreviaMenu));
  }, [menusDia, idioma, vistaPreviaMenu]);

  const heroImageUrl = useMemo(() => {
    const fondoCarta = carta?.archivo_url || "";
    const fondoCartaEsImagen = /\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(fondoCarta);
    const primeraFotoProducto = productos.find((producto) => producto.imagen_url)?.imagen_url;

    return fondoCartaEsImagen ? fondoCarta : primeraFotoProducto || imagenesFallback[0];
  }, [carta?.archivo_url, productos]);

  function obtenerImagen(producto: Producto, index = 0) {
    if (producto.imagen_url) return producto.imagen_url;

    const nombre = producto.nombre.toLowerCase();

    if (nombre.includes("hamburguesa") || nombre.includes("burger")) {
      return "https://images.unsplash.com/photo-1550547660-d9450f859349?q=80&w=1200&auto=format&fit=crop";
    }

    if (nombre.includes("pizza")) {
      return "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?q=80&w=1200&auto=format&fit=crop";
    }

    if (nombre.includes("costilla") || nombre.includes("bbq")) {
      return "https://images.unsplash.com/photo-1544025162-d76694265947?q=80&w=1200&auto=format&fit=crop";
    }

    if (nombre.includes("tarta") || nombre.includes("postre")) {
      return "https://images.unsplash.com/photo-1565958011703-44f9829ba187?q=80&w=1200&auto=format&fit=crop";
    }

    if (
      nombre.includes("coca") ||
      nombre.includes("cola") ||
      nombre.includes("bebida") ||
      nombre.includes("agua")
    ) {
      return "https://images.unsplash.com/photo-1581006852262-e4307cf6283a?q=80&w=1200&auto=format&fit=crop";
    }

    return imagenesFallback[index % imagenesFallback.length];
  }

  function cantidadProducto(productoId: string) {
    return carrito.find((item) => item.producto.id === productoId)?.cantidad || 0;
  }

  function añadirProducto(producto: Producto) {
    if (accesoPedido !== "valido") {
      setError(
        accesoPedido === "comprobando"
          ? "Estamos comprobando el acceso de esta mesa. Espera un momento."
          : "Este acceso ya no permite hacer pedidos. Pide al personal el QR actualizado."
      );
      return;
    }

    setCarrito((actual) => {
      const existe = actual.find((item) => item.producto.id === producto.id);

      if (existe) {
        return actual.map((item) =>
          item.producto.id === producto.id
            ? { ...item, cantidad: item.cantidad + 1 }
            : item
        );
      }

      return [...actual, { producto, cantidad: 1, notas: "" }];
    });
  }

  function restarProducto(productoId: string) {
    setCarrito((actual) =>
      actual
        .map((item) =>
          item.producto.id === productoId
            ? { ...item, cantidad: item.cantidad - 1 }
            : item
        )
        .filter((item) => item.cantidad > 0)
    );
  }

  function eliminarProducto(productoId: string) {
    setCarrito((actual) =>
      actual.filter((item) => item.producto.id !== productoId)
    );
  }

  function cambiarNotasProducto(productoId: string, notas: string) {
    setCarrito((actual) =>
      actual.map((item) =>
        item.producto.id === productoId ? { ...item, notas } : item
      )
    );
  }

  function prepararEnvioPedido() {
    if (accesoPedido !== "valido") {
      setError("Este acceso ya no permite hacer pedidos. Pide al personal el QR actualizado.");
      return;
    }

    if (carrito.length === 0) return;

    if (recomendaciones.length > 0) {
      setModalRecomendacion(true);
      return;
    }

    enviarPedido();
  }

  function mensajeErrorPedido(errorMessage: string) {
    if (/TOKEN_INVALIDO|CARTA_NO_ENCONTRADA/i.test(errorMessage)) {
      return "Esta carta ya no está disponible. Pide ayuda al personal.";
    }

    if (/ACCESO_MESA_INVALIDO|ACCESO_MESA_CADUCADO|MESA_NO_DISPONIBLE/i.test(errorMessage)) {
      return "El acceso de esta mesa ha caducado. Pide al personal el nuevo QR.";
    }

    if (/DEMASIADOS_PEDIDOS/i.test(errorMessage)) {
      return "Se han enviado demasiados pedidos seguidos. Espera un minuto o avisa al personal.";
    }

    if (/PEDIDO_VACIO/i.test(errorMessage)) {
      return "El pedido está vacío. Añade algún producto antes de enviarlo.";
    }

    if (/PEDIDO_DEMASIADO_GRANDE/i.test(errorMessage)) {
      return "El pedido es demasiado grande. Divídelo en dos pedidos.";
    }

    if (/PRODUCTO_NO_VALIDO/i.test(errorMessage)) {
      return "Algún producto ya no está disponible. Actualiza la carta y prueba otra vez.";
    }

    return "No se pudo enviar el pedido. Inténtalo otra vez.";
  }

  async function enviarPedido() {
    if (!carta || carrito.length === 0 || accesoPedido !== "valido") return;

    setEnviando(true);
    setError(null);

    try {
      const itemsPedido = carrito.map((item) => ({
        producto_id: item.producto.id,
        cantidad: item.cantidad,
        notas: item.notas.trim() || null,
      }));

      const { data, error: pedidoError } = await supabase.rpc("crear_pedido_mesa_qr_seguro", {
        p_public_token: token,
        p_mesa_id: mesaId,
        p_access_token: accessToken,
        p_notas: notasPedido.trim() || null,
        p_items: itemsPedido,
      });

      if (pedidoError) throw pedidoError;

      const pedidoCreado = Array.isArray(data) ? data[0] : data;

      if (!pedidoCreado?.ok) {
        throw new Error("No se pudo confirmar el pedido.");
      }

      setCarrito([]);
      setNotasPedido("");
      setModalRecomendacion(false);
      setMostrarCarritoMovil(false);
      setPedidoEnviado(true);

      setTimeout(() => {
        setPedidoEnviado(false);
      }, 7000);
    } catch (err: any) {
      console.error(err);
      setError(mensajeErrorPedido(String(err?.message || "")));
    } finally {
      setEnviando(false);
    }
  }

  if (cargando) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0f172a] text-white">
        <div className="text-center">
          <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-white/10 backdrop-blur">
            <Loader2 className="h-9 w-9 animate-spin" />
          </div>
          <p className="text-xl font-black">{t("cargandoCarta")}</p>
          <p className="mt-2 text-sm text-white/60">{t("preparandoCarta")}</p>
        </div>
      </main>
    );
  }

  if (error && !carta) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-stone-50 p-6 text-stone-900">
        <div className="max-w-md rounded-3xl border border-red-200 bg-white p-7 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 text-red-600">
            <X className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-black">{t("cartaNoDisponible")}</h1>
          <p className="mt-2 text-sm font-semibold text-stone-500">{error}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#0f130c] text-stone-950">
      <section
        className="relative isolate overflow-hidden bg-[#0f130c] px-4 pb-8 pt-6 text-white sm:px-5"
        style={{
          backgroundImage: `linear-gradient(180deg, rgba(6,8,5,0.86) 0%, rgba(11,14,8,0.76) 45%, rgba(12,16,10,0.98) 100%), url(${heroImageUrl})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_right,rgba(212,175,55,0.18),transparent_35%),radial-gradient(circle_at_bottom_left,rgba(31,122,67,0.22),transparent_38%)]" />
        <div className="absolute -left-20 top-10 h-52 w-52 animate-pulse rounded-full bg-emerald-500/20 blur-3xl" />
        <div className="absolute -right-24 top-20 h-64 w-64 animate-pulse rounded-full bg-amber-400/20 blur-3xl" />
        <div className="absolute bottom-0 left-1/2 h-44 w-[22rem] max-w-[90vw] -translate-x-1/2 rounded-full bg-white/10 blur-3xl" />

        <div className="relative mx-auto max-w-6xl">
          <div className="mb-6 flex justify-end">
            <div className="relative">
              <button
                type="button"
                onClick={() => setMostrarIdiomas((actual) => !actual)}
                aria-expanded={mostrarIdiomas}
                aria-label={t("seleccionarIdioma")}
                className="flex items-center gap-2.5 rounded-full border border-white/15 bg-black/25 px-3.5 py-2.5 text-sm text-white shadow-lg backdrop-blur-xl transition hover:border-white/25 hover:bg-black/35"
              >
                <Globe2 className="h-4 w-4 text-amber-300" />
                <span className="font-semibold text-white/55">Idioma</span>
                <span className="h-1 w-1 rounded-full bg-white/30" />
                <span className="text-base leading-none">{idiomaActual.bandera}</span>
                <span className="font-black">{idiomaActual.nombre}</span>
                <ChevronDown
                  className={`h-4 w-4 text-white/55 transition-transform duration-200 ${
                    mostrarIdiomas ? "rotate-180" : ""
                  }`}
                />
              </button>

              {mostrarIdiomas && (
                <div
                  className="absolute right-0 top-[calc(100%+0.6rem)] z-[100] w-[min(19rem,calc(100vw-2rem))] rounded-3xl border border-white/70 bg-white/95 p-2.5 text-stone-950 shadow-2xl backdrop-blur-xl"
                  style={{ animation: "fadeIn 180ms ease-out" }}
                >
                  <div className="flex items-center gap-2 px-2.5 pb-2 pt-1 text-[11px] font-black uppercase tracking-[0.12em] text-stone-400">
                    <Languages className="h-4 w-4" />
                    {t("seleccionarIdioma")}
                  </div>

                  <div className="grid grid-cols-2 gap-1.5">
                    {idiomasDisponibles.map((item) => (
                      <button
                        type="button"
                        key={item.code}
                        onClick={() => cambiarIdioma(item.code)}
                        className={`flex items-center gap-2 rounded-2xl px-3 py-2.5 text-left text-sm font-black transition ${
                          idioma === item.code
                            ? "bg-[#0f130c] text-white shadow-sm"
                            : "text-stone-700 hover:bg-stone-100"
                        }`}
                      >
                        <span className="text-lg leading-none">{item.bandera}</span>
                        <span className="truncate">{item.nombre}</span>
                        {idioma === item.code && (
                          <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-emerald-400" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {mostrarAvisoIdioma && (
            <div className="mb-5 flex items-start gap-3 rounded-3xl border border-amber-300/20 bg-amber-400/10 p-4 text-sm font-semibold text-amber-100 backdrop-blur">
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
              <p>{t("avisoIdioma")}</p>
            </div>
          )}

          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm font-black backdrop-blur">
                <Utensils className="h-4 w-4 text-amber-300" />
                {mesa ? `${t("mesa")} ${mesa}` : t("cartaDigital")}
              </div>

              <h1 className="max-w-3xl text-4xl font-black leading-tight md:text-6xl">
                {nombreCartaPublica}
              </h1>

              <p className="mt-4 max-w-2xl text-base font-semibold text-white/70">
                {t("eligePlatos")}
              </p>
            </div>

            <button
              onClick={() => setMostrarCarritoMovil(true)}
              className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white text-stone-950 shadow-lg md:hidden"
            >
              <ShoppingBag className="h-6 w-6" />
              {unidadesCarrito > 0 && (
                <span className="absolute -right-2 -top-2 flex h-7 min-w-7 items-center justify-center rounded-full bg-emerald-600 px-2 text-xs font-black text-white">
                  {unidadesCarrito}
                </span>
              )}
            </button>
          </div>

          <div className="mt-7 grid grid-cols-3 gap-3 md:max-w-xl">
            <div className="rounded-3xl border border-white/10 bg-white/10 p-4 backdrop-blur">
              <p className="text-2xl font-black">{productos.length}</p>
              <p className="text-xs font-bold text-white/60">{t("productos")}</p>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/10 p-4 backdrop-blur">
              <p className="text-2xl font-black">{categorias.length}</p>
              <p className="text-xs font-bold text-white/60">{t("categorias")}</p>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/10 p-4 backdrop-blur">
              <p className="text-2xl font-black">{destacados.length}</p>
              <p className="text-xs font-bold text-white/60">{t("destacados")}</p>
            </div>
          </div>

        </div>
      </section>

      <section className="rounded-t-[2.5rem] bg-[#f7f4ec] px-4 pb-40 pt-6 md:px-5 md:pb-12">
        <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1fr_380px]">
          <div className="min-w-0">
            {pedidoEnviado && (
              <div className="mb-6 flex items-center gap-4 rounded-3xl border border-green-200 bg-green-50 p-5 text-green-800 shadow-sm">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-green-600 text-white">
                  <Check className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-black">{t("pedidoEnviado")}</p>
                  <p className="text-sm font-semibold">{t("cocinaRecibido")}</p>
                </div>
              </div>
            )}

            {accesoPedido === "valido" ? (
              <div className="mb-6 flex items-center gap-4 rounded-3xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-800 shadow-sm">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-black">Mesa verificada</p>
                  <p className="text-sm font-semibold">Este acceso es temporal y se desactiva al cerrar la cuenta.</p>
                </div>
              </div>
            ) : accesoPedido === "invalido" ? (
              <div className="mb-6 flex items-center gap-4 rounded-3xl border border-amber-200 bg-amber-50 p-5 text-amber-900 shadow-sm">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-500 text-white">
                  <LockKeyhole className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-black">Carta en modo consulta</p>
                  <p className="text-sm font-semibold">Este enlace ya no acepta pedidos. Pide al personal el QR actualizado.</p>
                </div>
              </div>
            ) : null}

            {error && (
              <div className="mb-6 rounded-3xl border border-red-200 bg-red-50 p-5 text-red-700 shadow-sm">
                <p className="font-black">{t("error")}</p>
                <p className="mt-1 text-sm font-semibold">{error}</p>
              </div>
            )}

            {menusActivos.length > 0 && (
              <section className="mb-6 overflow-hidden rounded-[2rem] border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-blue-50 p-4 shadow-sm">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-wide text-amber-600">
                      {vistaPreviaMenu ? "Vista previa" : t("disponibleAhora")}
                    </p>
                    <h2 className="mt-1 text-2xl font-black text-stone-950">
                      {t("menuDelDia")}
                    </h2>
                  </div>

                  <span className="shrink-0 rounded-full bg-[#0f130c] px-3 py-2 text-xs font-black text-white">
                    {t("desde")} {Number(menusActivos[0].precio || 0).toFixed(2)} €
                  </span>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  {menusActivos.map((menu: MenuDiaQR) => {
                    const textoMenu = getMenuTexto(menu);
                    const productoMenu = convertirMenuAProducto(menu);
                    const cantidad = cantidadProducto(productoMenu.id);

                    return (
                      <article
                        key={menu.id}
                        className="rounded-[1.75rem] border border-blue-100 bg-white p-4 shadow-sm"
                      >
                        <div className="mb-3 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="text-xl font-black text-stone-950">
                              {textoMenu.titulo}
                            </h3>
                            {textoMenu.descripcion && (
                              <p className="mt-1 text-sm font-semibold text-stone-500">
                                {textoMenu.descripcion}
                              </p>
                            )}
                          </div>

                          <p className="shrink-0 text-xl font-black text-amber-600">
                            {Number(menu.precio || 0).toFixed(2)} €
                          </p>
                        </div>

                        {(menu.hora_inicio || menu.hora_fin) && (
                          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-stone-100 px-3 py-2 text-xs font-black text-stone-600">
                            <Clock className="h-4 w-4" />
                            {t("horario")}: {menu.hora_inicio || "--"} - {menu.hora_fin || "--"}
                          </div>
                        )}

                        <div className="space-y-3">
                          {(textoMenu.secciones || []).map((seccion: MenuDiaSeccion, index: number) => (
                            <div key={`${menu.id}-${index}`} className="rounded-2xl bg-stone-50 p-3">
                              <p className="mb-2 text-xs font-black uppercase text-stone-500">
                                {seccion.nombre}
                              </p>
                              <div className="space-y-1">
                                {(seccion.opciones || []).map((opcion: MenuDiaSeccion["opciones"][number], i: number) => (
                                  <div
                                    key={`${menu.id}-${index}-${i}`}
                                    className="flex items-start justify-between gap-3 text-sm"
                                  >
                                    <div>
                                      <p className="font-black text-stone-800">{opcion.nombre}</p>
                                      {opcion.descripcion && (
                                        <p className="font-semibold text-stone-500">
                                          {opcion.descripcion}
                                        </p>
                                      )}
                                    </div>
                                    {Number(opcion.suplemento || 0) > 0 && (
                                      <span className="shrink-0 rounded-full bg-white px-2 py-1 text-xs font-black text-amber-600">
                                        +{Number(opcion.suplemento || 0).toFixed(2)} €
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="mt-4 flex items-center justify-between gap-3">
                          {cantidad > 0 ? (
                            <div className="flex items-center rounded-2xl bg-stone-100 p-1">
                              <button
                                onClick={() => restarProducto(productoMenu.id)}
                                className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-stone-900 shadow-sm"
                              >
                                <Minus className="h-4 w-4" />
                              </button>
                              <span className="w-10 text-center text-sm font-black">{cantidad}</span>
                              <button
                                onClick={() => añadirProducto(productoMenu)}
                                className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0f130c] text-white shadow-sm"
                              >
                                <Plus className="h-4 w-4" />
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs font-black uppercase text-stone-400">
                              {t("incluye")}
                            </span>
                          )}

                          <button
                            onClick={() => añadirProducto(productoMenu)}
                            className="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-black text-white shadow-sm"
                          >
                            {t("elegirMenu")}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            )}

            <div className="sticky top-0 z-20 -mx-4 bg-[#f7f4ec]/95 px-4 pb-4 pt-2 backdrop-blur md:-mx-5 md:px-5">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <button
                  onClick={() => setCategoriaActiva("todas")}
                  className={`shrink-0 rounded-2xl px-5 py-3 text-sm font-black transition ${
                    categoriaActiva === "todas"
                      ? "border border-emerald-500 bg-emerald-700 text-white shadow-sm"
                      : "border border-stone-200 bg-white/90 text-stone-700 shadow-sm"
                  }`}
                >
                  {t("todas")}
                </button>

                {categorias.map((categoria) => (
                  <button
                    key={categoria.id}
                    onClick={() => setCategoriaActiva(categoria.id)}
                    className={`shrink-0 rounded-2xl px-5 py-3 text-sm font-black transition ${
                      categoriaActiva === categoria.id
                        ? "bg-[#0f130c] text-white shadow-sm"
                        : "bg-white text-stone-700 shadow-sm"
                    }`}
                  >
                    {getCategoriaNombre(categoria)}
                  </button>
                ))}
              </div>

              <div className="relative mt-3">
                <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-stone-400" />
                <input
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder={t("buscarPlaceholder")}
                  className="w-full rounded-3xl border border-stone-200 bg-white py-4 pl-12 pr-4 text-sm font-bold outline-none shadow-sm transition focus:border-stone-400"
                />
              </div>

              {alergenosDisponiblesCarta.length > 0 && (
                <div className="mt-3 rounded-3xl border border-stone-200 bg-white p-3 shadow-sm">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase text-stone-500">
                        {t("evitarAlergenos")}
                      </p>
                      <p className="text-xs font-semibold text-stone-400">
                        {t("filtroAlergenoTexto")}
                      </p>
                    </div>

                    {alergenosBloqueados.length > 0 && (
                      <button
                        onClick={() => setAlergenosBloqueados([])}
                        className="shrink-0 rounded-full bg-stone-100 px-3 py-2 text-xs font-black text-stone-600"
                      >
                        {t("limpiar")}
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                    {alergenosDisponiblesCarta.map((alergeno) => {
                      const activo = alergenosBloqueados.includes(alergeno);

                      return (
                        <button
                          key={alergeno}
                          onClick={() => toggleFiltroAlergeno(alergeno)}
                          className={`shrink-0 rounded-full px-3 py-2 text-xs font-black transition ${
                            activo
                              ? "bg-red-500 text-white shadow-sm"
                              : "bg-stone-100 text-stone-600 hover:bg-slate-200"
                          }`}
                        >
                          {activo ? "Sin " : ""}
                          {alergeno}
                        </button>
                      );
                    })}
                  </div>

                  {alergenosBloqueados.length > 0 && (
                    <p className="mt-2 text-xs font-bold text-red-500">
                      {t("productosOcultosFiltro")}
                    </p>
                  )}
                </div>
              )}
            </div>

            {recomendaciones.length > 0 && carrito.length > 0 && (
              <section className="mb-6 rounded-[2rem] border border-amber-200 bg-amber-50 p-4 shadow-sm">
                <div className="flex items-center gap-4">
                  <div className="hidden h-20 w-20 shrink-0 overflow-hidden rounded-3xl bg-slate-200 sm:block">
                    <img
                      src={obtenerImagen(recomendaciones[0].producto)}
                      alt={getProductoTexto(recomendaciones[0].producto).nombre}
                      className="h-full w-full object-cover"
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-black uppercase text-amber-600">
                      {t("completarPedido")}
                    </p>
                    <h3 className="line-clamp-1 text-lg font-black text-stone-950">
                      {getProductoTexto(recomendaciones[0].producto).nombre}
                    </h3>
                    <p className="line-clamp-2 text-sm font-semibold text-stone-600">
                      {recomendaciones[0].motivo}
                    </p>
                  </div>

                  <button
                    onClick={() => añadirProducto(recomendaciones[0].producto)}
                    className="shrink-0 rounded-2xl bg-[#0f130c] px-4 py-3 text-sm font-black text-white"
                  >
                    + {Number(recomendaciones[0].producto.precio || 0).toFixed(2)} €
                  </button>
                </div>
              </section>
            )}

            {destacados.length > 0 && categoriaActiva === "todas" && !busqueda && (
              <section className="mb-8">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-black uppercase text-amber-600">
                      {t("recomendados")}
                    </p>
                    <h2 className="text-2xl font-black text-stone-950">
                      {t("loMasDestacado")}
                    </h2>
                  </div>
                  <Sparkles className="h-6 w-6 text-emerald-500" />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  {destacados.map((producto, index) => {
                    const textoProducto = getProductoTexto(producto);

                    return (
                      <button
                        key={producto.id}
                        onClick={() => añadirProducto(producto)}
                        className="group relative h-60 w-full overflow-hidden rounded-[2rem] bg-stone-950 text-left shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl"
                      >
                        <img
                          src={obtenerImagen(producto, index)}
                          alt={textoProducto.nombre}
                          className="food-photo-motion h-full w-full object-cover transition duration-700 group-hover:scale-125"
                        />

                        <div className="food-shine" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />

                        <div className="absolute left-4 right-4 top-4 flex items-center justify-between">
                          <span className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-black text-white">
                            Top
                          </span>
                          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-stone-950">
                            <Plus className="h-5 w-5" />
                          </span>
                        </div>

                        <div className="absolute bottom-4 left-4 right-4">
                          <h3 className="line-clamp-2 text-lg font-black text-white">
                            {textoProducto.nombre}
                          </h3>
                          <p className="mt-2 text-xl font-black text-amber-300">
                            {Number(producto.precio || 0).toFixed(2)} €
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {categoriaActiva === "todas" && !busqueda ? (
              <div className="space-y-9">
                {productosPorCategoria.map((grupo) => (
                  <section key={grupo.categoria.id}>
                    <div className="mb-4">
                      <p className="text-sm font-black uppercase text-stone-400">
                        {t("categoria")}
                      </p>
                      <h2 className="text-2xl font-black text-stone-950">
                        {getCategoriaNombre(grupo.categoria)}
                      </h2>
                    </div>

                    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                      {grupo.productos.map((producto, index) => (
                        <ProductoCard
                          key={producto.id}
                          producto={producto}
                          textoProducto={getProductoTexto(producto)}
                          imagen={obtenerImagen(producto, index)}
                          cantidad={cantidadProducto(producto.id)}
                          idioma={idioma}
                          t={t}
                          onAñadir={() => añadirProducto(producto)}
                          onRestar={() => restarProducto(producto.id)}
                          onVerDetalle={() => setProductoDetalle(producto)}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {productosFiltrados.map((producto, index) => (
                  <ProductoCard
                    key={producto.id}
                    producto={producto}
                    textoProducto={getProductoTexto(producto)}
                    imagen={obtenerImagen(producto, index)}
                    cantidad={cantidadProducto(producto.id)}
                    idioma={idioma}
                    t={t}
                    onAñadir={() => añadirProducto(producto)}
                    onRestar={() => restarProducto(producto.id)}
                    onVerDetalle={() => setProductoDetalle(producto)}
                  />
                ))}
              </div>
            )}

            {productosFiltrados.length === 0 && (
              <div className="rounded-3xl border border-stone-200 bg-white p-8 text-center shadow-sm">
                <p className="text-xl font-black">{t("noHayProductos")}</p>
                <p className="mt-2 text-sm font-semibold text-stone-500">
                  {t("pruebaOtraBusqueda")}
                </p>
              </div>
            )}
          </div>

          <aside className="hidden lg:block">
            <CarritoPanel
              mesa={mesa}
              carrito={carrito}
              total={totalCarrito}
              unidades={unidadesCarrito}
              enviando={enviando}
              notasPedido={notasPedido}
              setNotasPedido={setNotasPedido}
              idioma={idioma}
              t={t}
              getProductoTexto={getProductoTexto}
              onAñadir={añadirProducto}
              onRestar={restarProducto}
              onEliminar={eliminarProducto}
              onCambiarNotas={cambiarNotasProducto}
              onEnviar={prepararEnvioPedido}
            />
          </aside>
        </div>
      </section>

      {unidadesCarrito > 0 && (
        <div className="fixed bottom-4 left-4 right-4 z-40 lg:hidden">
          <button
            onClick={() => setMostrarCarritoMovil(true)}
            className="flex w-full items-center justify-between rounded-3xl border border-emerald-700/60 bg-[#10170d] px-5 py-4 text-white shadow-2xl shadow-emerald-950/30"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10">
                <ShoppingBag className="h-5 w-5" />
              </div>
              <div className="text-left">
                <p className="font-black">
                  {unidadesCarrito}{" "}
                  {unidadesCarrito === 1
                    ? t("productoSingular")
                    : t("productosPlural")}
                </p>
                <p className="text-xs font-semibold text-white/60">
                  {mesa ? `${t("mesa")} ${mesa}` : t("sinMesa")}
                </p>
              </div>
            </div>

            <div className="text-right">
              <p className="text-xl font-black">{totalCarrito.toFixed(2)} €</p>
              <p className="text-xs font-semibold text-amber-300">
                {t("verPedido")}
              </p>
            </div>
          </button>
        </div>
      )}

      {mostrarCarritoMovil && (
        <div className="fixed inset-0 z-50 bg-black/60 p-4 backdrop-blur-sm lg:hidden">
          <div className="flex h-full flex-col rounded-[2rem] bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-100 p-5">
              <div>
                <p className="text-xl font-black">{t("tuPedido")}</p>
                <p className="text-sm font-bold text-stone-500">
                  {mesa ? `${t("mesa")} ${mesa}` : t("sinMesa")}
                </p>
              </div>

              <button
                onClick={() => setMostrarCarritoMovil(false)}
                className="flex h-11 w-11 items-center justify-center rounded-2xl bg-stone-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <CarritoContenido
                carrito={carrito}
                idioma={idioma}
                t={t}
                getProductoTexto={getProductoTexto}
                onAñadir={añadirProducto}
                onRestar={restarProducto}
                onEliminar={eliminarProducto}
                onCambiarNotas={cambiarNotasProducto}
              />

              {carrito.length > 0 && (
                <div className="mt-5 rounded-3xl border border-stone-100 bg-stone-50 p-4">
                  <label className="mb-2 flex items-center gap-2 text-sm font-black text-stone-700">
                    <MessageSquare className="h-4 w-4" />
                    {t("notaGeneral")}
                  </label>
                  <textarea
                    value={notasPedido}
                    onChange={(e) => setNotasPedido(e.target.value)}
                    placeholder={t("notaGeneralPlaceholder")}
                    rows={3}
                    className="w-full resize-none rounded-2xl border border-stone-200 bg-white p-3 text-sm font-semibold outline-none transition focus:border-stone-400"
                  />
                </div>
              )}
            </div>

            <div className="border-t border-stone-100 p-5">
              <div className="mb-4 flex items-center justify-between">
                <span className="font-black text-stone-500">{t("total")}</span>
                <span className="text-2xl font-black text-stone-950">
                  {totalCarrito.toFixed(2)} €
                </span>
              </div>

              <button
                onClick={prepararEnvioPedido}
                disabled={enviando || carrito.length === 0}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#0f130c] px-5 py-4 text-sm font-black text-white transition hover:bg-[#182113] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {enviando ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <ShoppingBag className="h-5 w-5" />
                )}
                {t("enviarPedido")} · {totalCarrito.toFixed(2)} €
              </button>
            </div>
          </div>
        </div>
      )}

      {modalRecomendacion && (
        <div className="fixed inset-0 z-[60] flex items-end bg-black/60 p-4 backdrop-blur-sm md:items-center md:justify-center">
          <div className="max-h-[90vh] w-full overflow-y-auto rounded-[2rem] bg-white p-5 shadow-2xl md:max-w-2xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-amber-50 px-4 py-2 text-sm font-black text-amber-700">
                  <Sparkles className="h-4 w-4" />
                  {t("recomendacionTitulo")}
                </div>

                <h2 className="text-2xl font-black text-stone-950">
                  {t("antesEnviar")}
                </h2>

                <p className="mt-2 text-sm font-semibold text-stone-500">
                  {t("recomendacionTexto")}
                </p>
              </div>

              <button
                onClick={() => setModalRecomendacion(false)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-stone-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {recomendaciones.map((recomendacion, index) => {
                const producto = recomendacion.producto;
                const cantidad = cantidadProducto(producto.id);
                const textoProducto = getProductoTexto(producto);

                return (
                  <article
                    key={producto.id}
                    className="overflow-hidden rounded-3xl border border-stone-200 bg-stone-50"
                  >
                    <div className="relative h-40 overflow-hidden">
                      <img
                        src={obtenerImagen(producto, index)}
                        alt={textoProducto.nombre}
                        className="food-photo-motion h-full w-full object-cover"
                      />

                      <div className="food-shine" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />

                      <div className="absolute bottom-3 left-3 right-3">
                        <p className="text-lg font-black text-white">
                          {textoProducto.nombre}
                        </p>
                        <p className="text-xl font-black text-amber-300">
                          {Number(producto.precio || 0).toFixed(2)} €
                        </p>
                      </div>
                    </div>

                    <div className="p-4">
                      <p className="text-sm font-semibold text-stone-600">
                        {recomendacion.motivo}
                      </p>

                      {cantidad > 0 ? (
                        <div className="mt-4 flex items-center justify-between rounded-2xl bg-white p-2">
                          <button
                            onClick={() => restarProducto(producto.id)}
                            className="flex h-10 w-10 items-center justify-center rounded-xl bg-stone-100"
                          >
                            <Minus className="h-4 w-4" />
                          </button>

                          <span className="font-black">{cantidad}</span>

                          <button
                            onClick={() => añadirProducto(producto)}
                            className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0f130c] text-white"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => añadirProducto(producto)}
                          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#0f130c] px-4 py-3 text-sm font-black text-white"
                        >
                          <Plus className="h-4 w-4" />
                          {t("añadirPedido")}
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <button
                onClick={enviarPedido}
                disabled={enviando}
                className="flex items-center justify-center gap-2 rounded-2xl border border-stone-200 bg-white px-5 py-4 text-sm font-black text-stone-800 transition hover:bg-stone-50 disabled:opacity-50"
              >
                {enviando ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <ArrowLeft className="h-5 w-5" />
                )}
                {t("enviarSinAñadir")}
              </button>

              <button
                onClick={enviarPedido}
                disabled={enviando}
                className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-4 text-sm font-black text-white transition hover:bg-emerald-700 disabled:opacity-50"
              >
                {enviando ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <ShoppingBag className="h-5 w-5" />
                )}
                {t("enviarPedido")} · {totalCarrito.toFixed(2)} €
              </button>
            </div>
          </div>
        </div>
      )}

      {productoDetalle && (
        <div className="fixed inset-0 z-[70] flex items-end bg-black/60 p-4 backdrop-blur-sm md:items-center md:justify-center">
          <div className="max-h-[92vh] w-full overflow-y-auto rounded-[2rem] bg-white shadow-2xl md:max-w-2xl">
            <div className="relative h-72 overflow-hidden bg-stone-950">
              <img
                src={obtenerImagen(productoDetalle)}
                alt={getProductoTexto(productoDetalle).nombre}
                className="food-photo-motion h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />

              <button
                onClick={() => setProductoDetalle(null)}
                className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-white/90 text-stone-950 shadow-sm"
                aria-label={t("cierreDetalle")}
              >
                <X className="h-5 w-5" />
              </button>

              <div className="absolute bottom-5 left-5 right-5">
                <p className="text-xs font-black uppercase text-amber-300">
                  {t("detalleProducto")}
                </p>
                <h2 className="mt-1 text-3xl font-black text-white">
                  {getProductoTexto(productoDetalle).nombre}
                </h2>
                <p className="mt-2 text-3xl font-black text-amber-300">
                  {Number(productoDetalle.precio || 0).toFixed(2)} €
                </p>
              </div>
            </div>

            <div className="p-5">
              {getProductoTexto(productoDetalle).descripcion && (
                <p className="text-base font-semibold leading-relaxed text-stone-600">
                  {getProductoTexto(productoDetalle).descripcion}
                </p>
              )}

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-3xl bg-stone-50 p-4">
                  <p className="text-xs font-black uppercase text-stone-400">
                    {t("alergenos")}
                  </p>

                  {getProductoTexto(productoDetalle).alergenos.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {getProductoTexto(productoDetalle).alergenos.map((alergeno) => (
                        <span
                          key={alergeno}
                          className="rounded-full bg-white px-3 py-2 text-xs font-black text-stone-700 shadow-sm"
                        >
                          {alergeno}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm font-bold text-stone-500">
                      {t("sinIngredientesCriticos")}
                    </p>
                  )}
                </div>

                <div className="rounded-3xl bg-amber-50 p-4">
                  <p className="text-xs font-black uppercase text-amber-600">
                    {productoDetalle.recomendado
                      ? t("recomendado")
                      : t("buenaEleccion")}
                  </p>
                  <p className="mt-2 text-sm font-bold text-blue-800">
                    {productoDetalle.recomendado
                      ? t("destacadoMotivo")
                      : t("idealParaCompartir")}
                  </p>
                </div>
              </div>

              <button
                onClick={() => {
                  añadirProducto(productoDetalle);
                  setProductoDetalle(null);
                }}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-4 text-sm font-black text-white shadow-sm"
              >
                <Plus className="h-5 w-5" />
                {t("añadirPedido")} · {Number(productoDetalle.precio || 0).toFixed(2)} €
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes foodKenBurns {
          0% {
            transform: scale(1.04) translate3d(0, 0, 0);
          }
          50% {
            transform: scale(1.14) translate3d(-8px, -6px, 0);
          }
          100% {
            transform: scale(1.04) translate3d(0, 0, 0);
          }
        }

        @keyframes shineMove {
          0% {
            transform: translateX(-140%) rotate(18deg);
            opacity: 0;
          }
          35% {
            opacity: 0.35;
          }
          70% {
            opacity: 0;
          }
          100% {
            transform: translateX(180%) rotate(18deg);
            opacity: 0;
          }
        }

        @keyframes softPulseBorder {
          0% {
            box-shadow: 0 0 0 0 rgba(249, 115, 22, 0.35);
          }
          70% {
            box-shadow: 0 0 0 10px rgba(249, 115, 22, 0);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(249, 115, 22, 0);
          }
        }

        @keyframes cardEnter {
          0% {
            opacity: 0;
            transform: translateY(18px) scale(0.98);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        .food-card-enter {
          animation: cardEnter 0.55s ease both;
        }

        .food-photo-motion {
          animation: foodKenBurns 9s ease-in-out infinite;
          will-change: transform;
        }

        .food-shine {
          position: absolute;
          top: -40%;
          left: -40%;
          width: 45%;
          height: 180%;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(255, 255, 255, 0.45),
            transparent
          );
          animation: shineMove 4.8s ease-in-out infinite;
          pointer-events: none;
        }

        .recommended-glow {
          animation: softPulseBorder 2.6s ease-in-out infinite;
        }
      `}</style>
    </main>
  );
}

function ProductoCard({
  producto,
  textoProducto,
  imagen,
  cantidad,
  idioma,
  t,
  onAñadir,
  onRestar,
  onVerDetalle,
}: {
  producto: Producto;
  textoProducto: {
    nombre: string;
    descripcion: string | null;
    tipo: string | null;
    alergenos: string[];
  };
  imagen: string;
  cantidad: number;
  idioma: LanguageCode;
  t: (key: string) => string;
  onAñadir: () => void;
  onRestar: () => void;
  onVerDetalle: () => void;
}) {
  return (
    <article
      className={`food-card-enter group overflow-hidden rounded-[2rem] border bg-white shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-2xl ${
        producto.recomendado
          ? "recommended-glow border-amber-200"
          : "border-stone-200"
      }`}
    >
      <div className="relative h-44 overflow-hidden bg-stone-950 sm:h-52">
        <img
          src={imagen}
          alt={textoProducto.nombre}
          className="food-photo-motion h-full w-full object-cover transition duration-700 group-hover:scale-125"
        />

        <div className="food-shine" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />

        <div className="absolute left-4 top-4 flex flex-wrap gap-2">
          {producto.recomendado && (
            <span className="flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1 text-xs font-black text-white shadow-sm">
              <Star className="h-3 w-3 fill-white" />
              {t("recomendado")}
            </span>
          )}

          {textoProducto.tipo && (
            <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-black text-stone-800 shadow-sm backdrop-blur">
              {textoProducto.tipo}
            </span>
          )}

          {idioma !== "es" && (
            <span className="flex items-center gap-1 rounded-full bg-[#0f130c]/80 px-3 py-1 text-xs font-black text-white shadow-sm backdrop-blur">
              <Languages className="h-3 w-3" />
              {idioma.toUpperCase()}
            </span>
          )}
        </div>

        <div className="absolute bottom-4 left-4 right-4">
          <p className="text-3xl font-black text-white drop-shadow">
            {Number(producto.precio || 0).toFixed(2)} €
          </p>
        </div>
      </div>

      <div className="p-5">
        <h3 className="text-xl font-black text-stone-950">
          {textoProducto.nombre}
        </h3>

        {textoProducto.descripcion && (
          <p className="mt-2 line-clamp-2 min-h-10 text-sm font-semibold leading-relaxed text-stone-500">
            {textoProducto.descripcion}
          </p>
        )}

        <div className="mt-4 rounded-2xl bg-stone-50 p-3">
          <p className="mb-2 text-xs font-black uppercase text-stone-400">
            {t("alergenos")}
          </p>

          {textoProducto.alergenos && textoProducto.alergenos.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {textoProducto.alergenos.map((alergeno) => (
                <span
                  key={alergeno}
                  className="rounded-full bg-white px-3 py-1 text-xs font-black text-stone-600 shadow-sm"
                >
                  {alergeno}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs font-semibold text-stone-400">
              {t("sinAlergenos")}
            </p>
          )}
        </div>

        <button
          onClick={onVerDetalle}
          className="mt-4 w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm font-black text-stone-700 transition hover:bg-stone-50"
        >
          {t("verDetalles")}
        </button>

        <div className="mt-3">
          {cantidad > 0 ? (
            <div className="flex items-center justify-between rounded-2xl bg-[#0f130c] p-2 text-white">
              <button
                onClick={onRestar}
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 transition hover:bg-white/20"
              >
                <Minus className="h-5 w-5" />
              </button>

              <div className="text-center">
                <p className="text-xs font-bold text-white/60">{t("cantidad")}</p>
                <p className="text-lg font-black">{cantidad}</p>
              </div>

              <button
                onClick={onAñadir}
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600 transition hover:bg-emerald-700"
              >
                <Plus className="h-5 w-5" />
              </button>
            </div>
          ) : (
            <button
              onClick={onAñadir}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#0f130c] px-5 py-4 text-sm font-black text-white transition hover:bg-emerald-600"
            >
              <Plus className="h-5 w-5" />
              {t("añadir")}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function CarritoPanel({
  mesa,
  carrito,
  total,
  unidades,
  enviando,
  notasPedido,
  setNotasPedido,
  idioma,
  t,
  getProductoTexto,
  onAñadir,
  onRestar,
  onEliminar,
  onCambiarNotas,
  onEnviar,
}: {
  mesa: string | null;
  carrito: CarritoItem[];
  total: number;
  unidades: number;
  enviando: boolean;
  notasPedido: string;
  setNotasPedido: (valor: string) => void;
  idioma: LanguageCode;
  t: (key: string) => string;
  getProductoTexto: (producto: Producto) => {
    nombre: string;
    descripcion: string | null;
    tipo: string | null;
    alergenos: string[];
  };
  onAñadir: (producto: Producto) => void;
  onRestar: (productoId: string) => void;
  onEliminar: (productoId: string) => void;
  onCambiarNotas: (productoId: string, notas: string) => void;
  onEnviar: () => void;
}) {
  return (
    <div className="sticky top-6 rounded-[2rem] border border-stone-200 bg-white p-5 shadow-sm">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-sm font-black uppercase text-stone-400">
            {t("tuPedido")}
          </p>
          <h2 className="text-2xl font-black text-stone-950">
            {mesa ? `${t("mesa")} ${mesa}` : t("sinMesa")}
          </h2>
        </div>

        <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0f130c] text-white">
          <ShoppingBag className="h-6 w-6" />
          {unidades > 0 && (
            <span className="absolute -right-2 -top-2 flex h-7 min-w-7 items-center justify-center rounded-full bg-emerald-600 px-2 text-xs font-black text-white">
              {unidades}
            </span>
          )}
        </div>
      </div>

      <CarritoContenido
        carrito={carrito}
        idioma={idioma}
        t={t}
        getProductoTexto={getProductoTexto}
        onAñadir={onAñadir}
        onRestar={onRestar}
        onEliminar={onEliminar}
        onCambiarNotas={onCambiarNotas}
      />

      {carrito.length > 0 && (
        <div className="mt-5 rounded-3xl border border-stone-100 bg-stone-50 p-4">
          <label className="mb-2 flex items-center gap-2 text-sm font-black text-stone-700">
            <MessageSquare className="h-4 w-4" />
            {t("notaGeneral")}
          </label>

          <textarea
            value={notasPedido}
            onChange={(e) => setNotasPedido(e.target.value)}
            placeholder={t("notaGeneralPlaceholder")}
            rows={3}
            className="w-full resize-none rounded-2xl border border-stone-200 bg-white p-3 text-sm font-semibold outline-none transition focus:border-stone-400"
          />
        </div>
      )}

      <div className="mt-5 border-t border-stone-100 pt-5">
        <div className="mb-4 flex items-center justify-between">
          <span className="font-black text-stone-500">{t("total")}</span>
          <span className="text-3xl font-black text-stone-950">
            {total.toFixed(2)} €
          </span>
        </div>

        <button
          onClick={onEnviar}
          disabled={enviando || carrito.length === 0}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-4 text-sm font-black text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {enviando ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <ShoppingBag className="h-5 w-5" />
          )}
          {t("enviarPedido")}
        </button>

        <p className="mt-3 flex items-center justify-center gap-2 text-xs font-bold text-stone-400">
          <Clock className="h-4 w-4" />
          {t("llegaCocina")}
        </p>
      </div>
    </div>
  );
}

function CarritoContenido({
  carrito,
  idioma,
  t,
  getProductoTexto,
  onAñadir,
  onRestar,
  onEliminar,
  onCambiarNotas,
}: {
  carrito: CarritoItem[];
  idioma: LanguageCode;
  t: (key: string) => string;
  getProductoTexto: (producto: Producto) => {
    nombre: string;
    descripcion: string | null;
    tipo: string | null;
    alergenos: string[];
  };
  onAñadir: (producto: Producto) => void;
  onRestar: (productoId: string) => void;
  onEliminar: (productoId: string) => void;
  onCambiarNotas: (productoId: string, notas: string) => void;
}) {
  if (carrito.length === 0) {
    return (
      <div className="rounded-3xl bg-stone-50 p-6 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-stone-400 shadow-sm">
          <ShoppingBag className="h-7 w-7" />
        </div>
        <p className="font-black text-stone-950">{t("pedidoVacio")}</p>
        <p className="mt-1 text-sm font-semibold text-stone-500">
          {t("añadeProducto")}
        </p>
      </div>
    );
  }

  return (
    <div className="max-h-[52vh] space-y-3 overflow-y-auto pr-1">
      {carrito.map((item) => {
        const textoProducto = getProductoTexto(item.producto);

        return (
          <div
            key={item.producto.id}
            className="rounded-3xl border border-stone-100 bg-stone-50 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-start gap-2">
                  <p className="font-black text-stone-950">
                    {textoProducto.nombre}
                  </p>

                  {idioma !== "es" && (
                    <span className="mt-0.5 rounded-full bg-white px-2 py-0.5 text-[10px] font-black text-stone-500 shadow-sm">
                      {idioma.toUpperCase()}
                    </span>
                  )}
                </div>

                <p className="mt-1 text-sm font-bold text-stone-500">
                  {Number(item.producto.precio || 0).toFixed(2)} € / ud.
                </p>
              </div>

              <button
                onClick={() => onEliminar(item.producto.id)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-red-500 shadow-sm"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <div className="flex items-center gap-2 rounded-2xl bg-white p-2 shadow-sm">
                <button
                  onClick={() => onRestar(item.producto.id)}
                  className="flex h-9 w-9 items-center justify-center rounded-xl bg-stone-100"
                >
                  <Minus className="h-4 w-4" />
                </button>

                <span className="w-8 text-center font-black">{item.cantidad}</span>

                <button
                  onClick={() => onAñadir(item.producto)}
                  className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0f130c] text-white"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              <p className="text-lg font-black text-stone-950">
                {(Number(item.producto.precio || 0) * item.cantidad).toFixed(2)} €
              </p>
            </div>

            <div className="mt-4">
              <label className="mb-2 flex items-center gap-2 text-xs font-black text-stone-500">
                <MessageSquare className="h-3.5 w-3.5" />
                {t("notaProducto")}
              </label>

              <textarea
                value={item.notas}
                onChange={(e) =>
                  onCambiarNotas(item.producto.id, e.target.value)
                }
                placeholder={t("notaProductoPlaceholder")}
                rows={2}
                className="w-full resize-none rounded-2xl border border-stone-200 bg-white p-3 text-sm font-semibold outline-none transition focus:border-stone-400"
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function obtenerRecomendaciones(
  productos: Producto[],
  carrito: CarritoItem[],
  t: (key: string) => string
): Recomendacion[] {
  if (carrito.length === 0) return [];

  const idsEnCarrito = new Set(carrito.map((item) => item.producto.id));
  const nombresCarrito = carrito
    .map((item) => `${item.producto.nombre} ${item.producto.tipo || ""}`)
    .join(" ")
    .toLowerCase();

  const tieneBebida = carrito.some((item) => esBebida(item.producto));
  const tienePostre = carrito.some((item) => esPostre(item.producto));
  const tienePrincipal = carrito.some((item) => esPrincipal(item.producto));
  const tieneEntrante = carrito.some((item) => esEntrante(item.producto));

  const recomendaciones: Recomendacion[] = [];

  function buscarProducto(
    filtro: (producto: Producto) => boolean,
    motivo: string
  ) {
    const producto = productos.find(
      (p) => !idsEnCarrito.has(p.id) && p.activo && filtro(p)
    );

    if (producto && !recomendaciones.some((r) => r.producto.id === producto.id)) {
      recomendaciones.push({ producto, motivo });
    }
  }

  if (!tieneBebida) {
    buscarProducto(esBebida, t("bebidaMotivo"));
  }

  if (!tienePostre && (tienePrincipal || nombresCarrito.includes("costilla"))) {
    buscarProducto(esPostre, t("postreMotivo"));
  }

  if (tieneEntrante && !tienePrincipal) {
    buscarProducto(esPrincipal, t("principalMotivo"));
  }

  if (
    nombresCarrito.includes("hamburguesa") ||
    nombresCarrito.includes("burger")
  ) {
    buscarProducto(
      (producto) =>
        normalizar(producto).includes("patata") ||
        normalizar(producto).includes("brava") ||
        esBebida(producto),
      t("burgerMotivo")
    );
  }

  if (nombresCarrito.includes("costilla") || nombresCarrito.includes("bbq")) {
    buscarProducto(
      (producto) =>
        normalizar(producto).includes("patata") ||
        normalizar(producto).includes("ensalada") ||
        esBebida(producto),
      t("bbqMotivo")
    );
  }

  buscarProducto((producto) => producto.recomendado, t("destacadoMotivo"));

  return recomendaciones.slice(0, 2);
}

function normalizar(producto: Producto) {
  return `${producto.nombre} ${producto.descripcion || ""} ${
    producto.tipo || ""
  }`.toLowerCase();
}

function esBebida(producto: Producto) {
  const texto = normalizar(producto);

  return (
    texto.includes("bebida") ||
    texto.includes("refresco") ||
    texto.includes("agua") ||
    texto.includes("coca") ||
    texto.includes("cola") ||
    texto.includes("cerveza") ||
    texto.includes("vino") ||
    texto.includes("fanta") ||
    texto.includes("sprite") ||
    texto.includes("zumo")
  );
}

function esPostre(producto: Producto) {
  const texto = normalizar(producto);

  return (
    texto.includes("postre") ||
    texto.includes("tarta") ||
    texto.includes("helado") ||
    texto.includes("brownie") ||
    texto.includes("flan") ||
    texto.includes("tiramis")
  );
}

function esEntrante(producto: Producto) {
  const texto = normalizar(producto);

  return (
    texto.includes("entrante") ||
    texto.includes("bravas") ||
    texto.includes("croqueta") ||
    texto.includes("nachos") ||
    texto.includes("ensalada") ||
    texto.includes("tapa")
  );
}

function esPrincipal(producto: Producto) {
  const texto = normalizar(producto);

  return (
    texto.includes("principal") ||
    texto.includes("hamburguesa") ||
    texto.includes("burger") ||
    texto.includes("costilla") ||
    texto.includes("carne") ||
    texto.includes("pollo") ||
    texto.includes("pasta") ||
    texto.includes("pizza") ||
    texto.includes("arroz")
  );
}
