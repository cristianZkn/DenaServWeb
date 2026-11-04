"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function InventarioRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirección automática al nuevo catálogo unificado
    router.replace("/dashboard/catalogos");
  }, [router]);

  return (
    <div className="p-8 text-center text-slate-500">
      Redirigiendo al Catálogo Unificado de Tipos...
    </div>
  );
}
