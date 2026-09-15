"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ClipboardList, LayoutDashboard, Loader2, LogOut, Settings2, ShieldCheck, Store } from "lucide-react";
import Link from "next/link";
import { supabase } from "../(app)/lib/supabaseClient";
import "./agency.css";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [allowed, setAllowed] = useState(false);

  const checkAdmin = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      await supabase.auth.signOut({ scope: "local" });
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }

    const { data, error } = await supabase
      .from("app_admins")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error || !data?.user_id) {
      router.replace("/dashboard");
      router.refresh();
      return;
    }

    setAllowed(true);
  }, [pathname, router]);

  useEffect(() => {
    let mounted = true;

    const runCheck = async () => {
      if (!mounted) return;
      await checkAdmin();
    };

    runCheck();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;

      if (event === "SIGNED_OUT" || !session) {
        setAllowed(false);
        router.replace(`/login?next=${encodeURIComponent(pathname)}`);
        return;
      }

      if (event === "SIGNED_IN" || event === "USER_UPDATED") {
        setAllowed(false);
        window.setTimeout(runCheck, 0);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [checkAdmin, pathname, router]);

  if (!allowed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-5 text-white">
        <div className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <div className="mt-5 flex items-center justify-center gap-2 text-sm font-black">
            <Loader2 className="h-4 w-4 animate-spin" />
            Verificando acceso de administración
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="agency-app">
      <nav className="agency-nav" aria-label="GastroHelp interno">
        <Link className="agency-logo" href="/admin/control"><span className="agency-logo-mark">g.</span>GastroHelp</Link>
        <div><p className="agency-nav-label">Tu espacio de trabajo</p><div className="agency-nav-links">
          {[{href:"/admin/control",label:"Centro de control",icon:LayoutDashboard},{href:"/admin/restaurantes",label:"Restaurantes",icon:Store},{href:"/admin/onboarding-restaurante",label:"Puesta en marcha",icon:ClipboardList},{href:"/admin/herramientas",label:"Herramientas",icon:Settings2}].map(item=><Link key={item.href} href={item.href} aria-current={pathname.startsWith(item.href)?"page":undefined}><item.icon size={17}/>{item.label}</Link>)}
        </div></div>
        <div className="agency-nav-bottom"><span>Cuenta de agencia</span><button type="button" onClick={()=>router.push("/logout")}><LogOut size={15}/>Cerrar sesión</button></div>
      </nav>
      <div className="agency-main"><header className="agency-header"><span><ShieldCheck size={14}/>Espacio privado de GastroHelp</span><span className="agency-header-badge">GESTIÓN DE RESTAURANTES</span><button type="button" onClick={()=>router.push("/logout")} aria-label="Cerrar sesión"><LogOut size={15}/></button></header>{children}</div>
    </div>
  );
}
