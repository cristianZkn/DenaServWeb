import type { Metadata } from "next";
import Link from "next/link";
import Icono from "@/components/Icono";

export const metadata: Metadata = {
  title: "Términos y condiciones | DenaServ",
  description: "Condiciones de uso del sitio web de DenaServ, de las cotizaciones y de los servicios de construcción.",
};

const SECCIONES = [
  {
    titulo: "1. Quiénes somos y aceptación",
    texto: [
      "Este sitio pertenece a DenaServ, empresa de Los Ángeles, Chile, dedicada a la construcción de casas prefabricadas y radieres. Al usar el sitio, usted declara haber leído y aceptado estos términos. Si no está de acuerdo, le pedimos no utilizarlo.",
    ],
  },
  {
    titulo: "2. Uso del sitio",
    lista: [
      "El sitio es informativo: muestra nuestras obras, un catálogo de casas y formas de contacto.",
      "Usted se compromete a usarlo de buena fe, sin intentar acceder a zonas restringidas, alterar su funcionamiento ni copiar masivamente su contenido.",
      "La zona de gestión es exclusiva del personal autorizado de la empresa.",
    ],
  },
  {
    titulo: "3. Catálogo y obras publicadas",
    texto: [
      "Las imágenes, medidas, descripciones y características de las casas y obras son referenciales. Cada proyecto se ajusta al terreno, al diseño acordado y a los materiales disponibles, por lo que el resultado final puede diferir de lo publicado. El catálogo no constituye una oferta vinculante.",
    ],
  },
  {
    titulo: "4. Cotizaciones",
    lista: [
      "Las cotizaciones se emiten por escrito y tienen una vigencia de 15 días corridos desde su emisión.",
      "Los valores incluyen IVA y dependen de los precios de materiales, la mano de obra, la distancia al terreno y las condiciones del lugar; pueden reajustarse si esos costos cambian, informando siempre el motivo.",
      "El relleno de estabilizado se mide en la visita al terreno y puede sumarse al valor informado, o ser comprado directamente por el cliente.",
      "Una cotización no compromete a ninguna de las partes hasta que se firma el contrato y se paga el anticipo.",
    ],
  },
  {
    titulo: "5. Contrato, pagos y plazos",
    lista: [
      "El pago se hace por etapas: anticipo del 40 %, avance del 30 % y entrega del 30 %, según se indique en el contrato.",
      "La obra se inicia cuando el anticipo está pagado por completo. Los plazos son estimados y pueden variar por clima, disponibilidad de materiales o acceso al terreno.",
      "Los pagos se acreditan con comprobante y quedan registrados; el cliente puede revisar el estado de sus pagos y el avance de su obra en la ficha que se le entrega.",
    ],
  },
  {
    titulo: "6. Garantía y responsabilidad",
    texto: [
      "Respondemos por la calidad de nuestros trabajos en los términos del contrato y de la ley chilena de protección de los derechos de los consumidores. No nos hacemos responsables por interrupciones del sitio, errores de terceros, ni por el uso de la información publicada fuera de su finalidad informativa.",
    ],
  },
  {
    titulo: "7. Propiedad intelectual",
    texto: ["Los textos, diseños, logotipos, planos e imágenes del sitio pertenecen a DenaServ o se usan con autorización. No pueden reproducirse ni utilizarse con fines comerciales sin nuestro permiso por escrito."],
  },
  {
    titulo: "8. Datos personales y cookies",
    texto: [
      "El tratamiento de sus datos se rige por nuestra política de privacidad. El sitio usa cookies técnicas y, solo con su consentimiento, cookies de medición de visitas. Puede cambiar su decisión en cualquier momento desde «Preferencias de cookies» en el pie de página.",
    ],
  },
  {
    titulo: "9. Enlaces y servicios de terceros",
    texto: ["El sitio puede enlazar a redes sociales, WhatsApp u otros servicios. No controlamos su contenido ni sus políticas, y su uso se rige por las condiciones de cada proveedor."],
  },
  {
    titulo: "10. Cambios, ley aplicable y contacto",
    texto: [
      "Podemos actualizar estos términos; la versión vigente es la publicada en esta página. Se rigen por las leyes de la República de Chile y cualquier controversia se someterá a los tribunales competentes de la ciudad de Los Ángeles. Para consultas, escríbanos por los medios de contacto de la página de inicio.",
    ],
  },
];

export default function TerminosPage() {
  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800">
      <header className="bg-blue-950 text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="font-black text-xl tracking-tighter">DENASERV<span className="text-amber-400">.</span></Link>
          <Link href="/" className="text-sm font-semibold text-blue-100 hover:text-white"><Icono nombre="flecha-izq" className="inline h-4 w-4 -mt-0.5 mr-1" />Volver al inicio</Link>
        </div>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 pb-12 pt-6">
          <p className="text-sm font-bold uppercase tracking-widest text-amber-300">Legal</p>
          <h1 className="mt-2 text-3xl sm:text-5xl font-black leading-tight">Términos y condiciones</h1>
          <p className="mt-3 text-blue-100">Última actualización: noviembre de 2026</p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <div className="space-y-6">
          {SECCIONES.map((s) => (
            <section key={s.titulo} className="rounded-2xl bg-white ring-1 ring-slate-200 p-6 sm:p-8">
              <h2 className="text-xl font-black text-blue-900">{s.titulo}</h2>
              {s.texto?.map((t) => <p key={t} className="mt-3 text-slate-700 leading-relaxed">{t}</p>)}
              {s.lista && (
                <ul className="mt-3 space-y-2 list-disc pl-5 text-slate-700 leading-relaxed">
                  {s.lista.map((t) => <li key={t}>{t}</li>)}
                </ul>
              )}
            </section>
          ))}
        </div>
        <p className="mt-8 text-sm text-slate-500">Este documento es informativo y no reemplaza el asesoramiento legal. Véase también la <Link href="/privacidad" className="underline">política de privacidad</Link>.</p>
      </main>

      <footer className="bg-blue-950 text-blue-200 py-6 text-center text-sm">&copy; {new Date().getFullYear()} DenaServ. Todos los derechos reservados.</footer>
    </div>
  );
}
