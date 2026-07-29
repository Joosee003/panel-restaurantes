from pathlib import Path

route = Path('app/api/opiniones/[slug]/route.ts')
text = route.read_text()
text = text.replace('.select("seo_keywords")', '.select("seo_keywords,aspect_labels")')
text = text.replace(
    'const config = { ...baseConfig, seo_keywords: seoKeywords };',
    '''const config = {
      ...baseConfig,
      seo_keywords: seoKeywords,
      aspect_labels:
        keywordConfig?.aspect_labels && typeof keywordConfig.aspect_labels === "object"
          ? keywordConfig.aspect_labels
          : {},
    };''',
)
route.write_text(text)

elite = Path('app/opiniones-admin/ReputationElite.tsx')
text = elite.read_text()
old = 'const answered = googleOpinions.filter((item) => item.seguimiento === "resuelto" && !recentlyAnswered[item.id]);'
new = '''const answeredCutoff = Date.now() - 15 * 24 * 60 * 60 * 1000;
  const answered = googleOpinions.filter((item) => {
    if (item.seguimiento !== "resuelto" || recentlyAnswered[item.id] || !item.resuelto_at) return false;
    const resolvedAt = new Date(item.resuelto_at).getTime();
    return Number.isFinite(resolvedAt) && resolvedAt >= answeredCutoff;
  });'''
if old in text:
    text = text.replace(old, new, 1)
elif 'answeredCutoff' not in text:
    raise SystemExit('Could not locate answered reviews filter')

if 'import AspectLabelsEditor from "./AspectLabelsEditor";' not in text:
    text = text.replace('import ReputationMaterials from "./ReputationMaterials";\n', 'import ReputationMaterials from "./ReputationMaterials";\nimport AspectLabelsEditor from "./AspectLabelsEditor";\n', 1)
old_settings = 'function SettingsPanel({ config, saving, save }: { config: OpinionConfig; saving: boolean; save: (config: OpinionConfig) => void; }) { const [draft, setDraft] = useState(config); return <div className="grid gap-5 xl:grid-cols-2">'
new_settings = 'function SettingsPanel({ config, saving, save }: { config: OpinionConfig; saving: boolean; save: (config: OpinionConfig) => void; }) { const [draft, setDraft] = useState(config); return <div className="space-y-5"><div className="grid gap-5 xl:grid-cols-2">'
if old_settings in text:
    text = text.replace(old_settings, new_settings, 1)
marker = '</button></div></div>; }\n\nfunction OpinionDrawer'
replacement = '</button></div></div><AspectLabelsEditor configId={config.id} initialLabels={config.aspect_labels} /></div>; }\n\nfunction OpinionDrawer'
if marker in text:
    text = text.replace(marker, replacement, 1)
elif '<AspectLabelsEditor configId={config.id}' not in text:
    raise SystemExit('Could not locate SettingsPanel end')
elite.write_text(text)

editor = Path('app/opiniones-admin/AspectLabelsEditor.tsx')
editor.write_text(r'''"use client";

import { Check } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getOpinionesBrowserClient } from "@/lib/opiniones/supabase";

const defaults = {
  comida: "Comida",
  servicio: "Servicio",
  ambiente: "Ambiente",
  espera: "Tiempo de espera",
  limpieza: "Limpieza",
  calidad_precio: "Calidad-precio",
};

type Labels = typeof defaults;

export default function AspectLabelsEditor({ configId, initialLabels }: { configId: string; initialLabels?: Partial<Labels> | null; }) {
  const supabase = useMemo(() => getOpinionesBrowserClient(), []);
  const [labels, setLabels] = useState<Labels>({ ...defaults, ...(initialLabels ?? {}) });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setLabels({ ...defaults, ...(initialLabels ?? {}) }); }, [initialLabels]);

  async function save() {
    const cleaned = Object.fromEntries(Object.entries(labels).map(([key, value]) => [key, value.trim().slice(0, 40) || defaults[key as keyof Labels]])) as Labels;
    setSaving(true); setSaved(false); setError(null);
    const { error: saveError } = await supabase.from("opinion_config").update({ aspect_labels: cleaned }).eq("id", configId);
    setSaving(false);
    if (saveError) { setError("No se pudieron guardar las opciones."); return; }
    setLabels(cleaned); setSaved(true); window.setTimeout(() => setSaved(false), 2200);
  }

  return <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
    <p className="text-[10px] font-black uppercase tracking-[.18em] text-blue-700">Formulario de opinión</p>
    <h2 className="mt-1 text-xl font-black text-slate-950">Opciones que verá el cliente</h2>
    <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">Personaliza las seis opciones del formulario. El cambio se aplicará al formulario público.</p>
    <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {(Object.keys(defaults) as Array<keyof Labels>).map((key) => <label key={key} className="block">
        <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wide text-slate-400">{defaults[key]}</span>
        <input value={labels[key]} onChange={(event) => setLabels((current) => ({ ...current, [key]: event.target.value.slice(0, 40) }))} className="min-h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
      </label>)}
    </div>
    {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>}
    <button type="button" disabled={saving} onClick={() => void save()} className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 text-sm font-black text-white disabled:opacity-60">{saved && <Check className="h-4 w-4" />}{saving ? "Guardando…" : saved ? "Guardado" : "Guardar opciones"}</button>
  </section>;
}
''')

suite = Path('app/opiniones-admin/HispanosReputationSuite.tsx')
text = suite.read_text().replace('import AspectLabelsEditor from "./AspectLabelsEditor";\n', '').replace('      <AspectLabelsEditor />\n', '')
suite.write_text(text)

public_review = Path('lib/opiniones/public-review.ts')
text = public_review.read_text()
start = text.index('export const aspectDefinitions:')
end = text.index('\n\nexport const ratingCopy:', start)
replacement = r'''export const aspectDefinitions: Array<{
  key: AspectKey;
  label: string;
  positive: string[];
  neutral: string[];
  negative: string[];
}> = [
  { key: "comida", label: "Comida", positive: ["La comida estaba realmente buena", "Disfrutamos mucho de la comida", "Los platos tenían muy buen sabor", "La cocina nos dejó muy buenas sensaciones", "La comida fue uno de los puntos fuertes"], neutral: ["La comida estuvo bien, aunque podría mejorar algún detalle", "Los platos fueron correctos, con margen para pulir algunos aspectos", "La comida cumplió, aunque esperábamos un poco más", "En general la comida estuvo bien, pero podría destacar más"], negative: ["La comida no estuvo a la altura de lo esperado", "Los platos necesitan mejorar", "La comida fue el aspecto que menos nos convenció", "Esperábamos más de la cocina"] },
  { key: "servicio", label: "Servicio", positive: ["El servicio fue atento y cercano", "El personal nos trató de maravilla", "La atención fue rápida y amable", "Nos atendieron con mucha profesionalidad", "El equipo fue muy agradable durante toda la visita"], neutral: ["El servicio fue correcto, aunque podría ser más ágil", "La atención estuvo bien, con algún momento mejorable", "El trato fue correcto, aunque faltó algo de agilidad", "El servicio cumplió, pero todavía puede mejorar"], negative: ["El servicio necesita mejorar", "La atención no fue la que esperábamos", "El trato podría haber sido bastante mejor", "El servicio fue uno de los puntos más flojos"] },
  { key: "ambiente", label: "Ambiente", positive: ["El ambiente fue muy agradable", "Nos encantó el ambiente del local", "El espacio resultó acogedor y cómodo", "Había un ambiente estupendo", "El local tiene una atmósfera muy agradable"], neutral: ["El ambiente fue correcto", "El local resultó agradable, aunque podría cuidarse algún detalle", "El ambiente estuvo bien, sin destacar especialmente", "El espacio fue cómodo, aunque mejorable"], negative: ["El ambiente no resultó tan agradable como esperábamos", "El local podría resultar más acogedor", "El ambiente necesita algunos ajustes", "No terminamos de sentirnos cómodos con el ambiente"] },
  { key: "espera", label: "Tiempo de espera", positive: ["Nos atendieron con rapidez", "El tiempo de espera fue muy bueno", "Todo llegó con bastante agilidad", "El servicio fue rápido de principio a fin", "No tuvimos que esperar prácticamente nada"], neutral: ["El tiempo de espera fue algo largo", "Tuvimos que esperar un poco más de lo deseado", "La espera fue razonable, aunque podría reducirse", "Los tiempos estuvieron bien, salvo algún pequeño retraso"], negative: ["Tuvimos que esperar demasiado", "El tiempo de espera fue excesivo", "La demora afectó bastante a la experiencia", "Los tiempos de servicio deberían mejorar"] },
  { key: "limpieza", label: "Limpieza", positive: ["Todo estaba muy limpio y cuidado", "El local estaba impecable", "Se notaba mucha atención a la limpieza", "Todo se encontraba muy bien cuidado", "La limpieza del espacio fue excelente"], neutral: ["La limpieza fue correcta", "En general todo estaba limpio, aunque podría cuidarse algún detalle", "El nivel de limpieza fue adecuado", "La limpieza cumplió, con algún punto mejorable"], negative: ["La limpieza debería cuidarse más", "Encontramos algunos detalles de limpieza mejorables", "El local necesita prestar más atención a la limpieza", "La limpieza no estuvo al nivel esperado"] },
  { key: "calidad_precio", label: "Calidad-precio", positive: ["La relación calidad-precio nos pareció muy buena", "El precio nos pareció justo para la experiencia", "Hay una buena relación entre calidad y precio", "La experiencia merece lo que cuesta", "Nos pareció una opción con muy buena calidad-precio"], neutral: ["La relación calidad-precio fue aceptable", "El precio fue razonable, aunque esperábamos algún detalle más", "La calidad y el precio estuvieron bastante equilibrados", "El precio nos pareció correcto, sin destacar"], negative: ["La relación calidad-precio no nos convenció", "El precio nos pareció alto para la experiencia", "Esperábamos más calidad por ese precio", "La experiencia no justificó del todo el precio"] },
];'''
text = text[:start] + replacement + text[end:]
old_build = '''  const selected = aspectDefinitions
    .filter((definition) => aspects.includes(definition.key))
    .map((definition) => definition[tone]);'''
new_build = '''  const variantSeed = Math.abs(aspects.reduce((total, aspect, index) => total + [...aspect].reduce((sum, character) => sum + character.charCodeAt(0), 0) * (index + 1), rating * 97) + Math.floor(Date.now() / 60000));
  const selected = aspectDefinitions
    .filter((definition) => aspects.includes(definition.key))
    .map((definition, index) => {
      const variants = definition[tone];
      return variants[(variantSeed + index * 7) % variants.length];
    });'''
if old_build in text:
    text = text.replace(old_build, new_build, 1)
elif 'variantSeed' not in text:
    raise SystemExit('Could not locate comment builder')
text = text.replace('  contact_prompt_enabled: boolean;\n};', '  contact_prompt_enabled: boolean;\n  aspect_labels?: Partial<Record<AspectKey, string>>;\n  seo_keywords?: string[];\n};', 1)
public_review.write_text(text)

form = Path('app/opinion/[slug]/ReviewForm.tsx')
text = form.read_text()
custom_start = text.find('type CustomConfig = PublicConfig & {')
if custom_start != -1:
    custom_end = text.find('};\n\n', custom_start) + 4
    text = text[:custom_start] + text[custom_end:]
text = text.replace('  const customConfig = config as CustomConfig;\n  const labels = customConfig.aspect_labels ?? {};\n  const seoKeywords = (customConfig.seo_keywords ?? [])', '  const labels = config.aspect_labels ?? {};\n  const seoKeywords = (config.seo_keywords ?? [])')
form.write_text(text)

assert '.select("seo_keywords,aspect_labels")' in route.read_text()
assert 'answeredCutoff' in elite.read_text()
assert '<AspectLabelsEditor configId={config.id}' in elite.read_text()
assert '<AspectLabelsEditor />' not in suite.read_text()
assert 'positive: string[];' in public_review.read_text()
assert 'aspect_labels?:' in public_review.read_text()
