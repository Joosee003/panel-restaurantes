export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div style={{ minHeight: "100vh" }}>
      {children}

      <div className="pointer-events-none fixed inset-x-2 bottom-2 z-[120] flex items-center justify-center sm:inset-x-auto sm:bottom-5 sm:right-5">
        <div className="pointer-events-auto flex w-full max-w-xl items-center gap-2 rounded-2xl border border-white/15 bg-[#030814]/95 p-2 text-white shadow-[0_24px_80px_rgba(0,0,0,.45)] backdrop-blur-2xl sm:w-auto">
          <div className="hidden px-3 sm:block">
            <p className="text-[9px] font-black uppercase tracking-[.16em] text-blue-300">
              ¿Necesitas ayuda?
            </p>
            <p className="mt-0.5 text-xs font-bold text-white">
              Asesoría inicial gratuita
            </p>
          </div>
          <a
            href="https://wa.me/34643416157?text=Hola%20Jose%2C%20quiero%20informaci%C3%B3n%20sobre%20GastroHelp%20para%20mi%20restaurante."
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-12 flex-1 items-center justify-center rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 px-4 text-xs font-black text-white shadow-lg shadow-emerald-950/20 transition hover:-translate-y-0.5 sm:flex-none"
          >
            Hablar por WhatsApp
          </a>
          <a
            href="mailto:gastrohelpsmart@gmail.com?subject=Información%20GastroHelp"
            className="flex min-h-12 items-center justify-center rounded-xl border border-white/15 bg-white/[.08] px-4 text-xs font-black text-white transition hover:bg-white/[.13]"
          >
            Email
          </a>
        </div>
      </div>
    </div>
  );
}
