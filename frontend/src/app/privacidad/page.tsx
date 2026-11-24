import Icono from "@/components/Icono";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Política de privacidad | DenaServ",
  description: "Cómo DenaServ recopila, usa y protege los datos personales de sus clientes y visitantes.",
};

const SECCIONES = [
  {
    titulo: "1. Quiénes somos",
    texto: [
      "DenaServ es una empresa de Los Ángeles, Chile, dedicada a la construcción de casas prefabricadas y radieres. Esta política explica qué datos personales tratamos, para qué y cuáles son sus derechos, conforme a la Ley N° 19.628 sobre protección de la vida privada y demás normativa chilena aplicable.",
    ],
  },
  {
    titulo: "2. Qué datos recopilamos",
    lista: [
      "Datos de contacto que usted nos entrega al pedir una cotización o escribirnos por WhatsApp o correo: nombre, teléfono, dirección del terreno y, cuando se formaliza un proyecto, RUT.",
      "Datos del proyecto: metros cuadrados, materiales, valores, pagos y comprobantes de pago, fotografías del avance de la obra y contrato.",
      "Navegar por la página pública no requiere entregar datos. No usamos cookies de publicidad. Solo si usted acepta el aviso de cookies, usamos cookies de medición para conocer las visitas del sitio (páginas vistas, tipo de dispositivo y origen) de forma agregada; si no acepta, no se activan. Puede cambiar su decisión en «Preferencias de cookies», en el pie de página.",
      "El personal autorizado de la empresa inicia sesión con su cuenta de Google; se usa una cookie de sesión técnica, necesaria para mantener la sesión y que no se utiliza para otros fines.",
    ],
  },
  {
    titulo: "3. Para qué usamos sus datos",
    lista: [
      "Preparar y enviarle cotizaciones, contratos y fichas de su proyecto.",
      "Ejecutar la obra, registrar su avance y llevar el control de los pagos acordados.",
      "Responder sus consultas y mantener la comunicación sobre su proyecto.",
      "Cumplir obligaciones legales, contables y tributarias.",
    ],
  },
  {
    titulo: "4. Con quién los compartimos",
    texto: [
      "No vendemos ni cedemos sus datos. Solo los tratan personas autorizadas de DenaServ y los proveedores tecnológicos necesarios para operar el sistema (alojamiento de la aplicación y de la base de datos), que los procesan por encargo nuestro y bajo medidas de seguridad.",
      "Cuando usamos asistencia de inteligencia artificial para redactar resúmenes de un proyecto, solo se envían montos, estados y avances; no se envían nombre, RUT, teléfono ni dirección del cliente.",
    ],
  },
  {
    titulo: "5. Cuánto tiempo los conservamos",
    texto: ["Conservamos los datos mientras dure la relación comercial y el tiempo que exijan las obligaciones legales, contables y de garantía de la obra. Después se eliminan o se anonimizan."],
  },
  {
    titulo: "6. Cómo los protegemos",
    texto: [
      "La comunicación con el sistema viaja cifrada (HTTPS), el acceso a la zona administrativa exige autenticación, las sesiones expiran automáticamente y los datos se guardan en una base de datos con acceso restringido. Ningún sistema es infalible, pero aplicamos medidas razonables para reducir los riesgos.",
    ],
  },
  {
    titulo: "7. Sus derechos",
    texto: [
      "Usted puede pedir acceso a sus datos, su rectificación si están errados o incompletos, y su eliminación o bloqueo cuando corresponda. Para ejercer estos derechos, escríbanos por los medios de contacto indicados en nuestra página de inicio, identificándose y detallando su solicitud. Responderemos dentro de un plazo razonable.",
    ],
  },
  {
    titulo: "8. Fotografías de obras",
    texto: ["Las fotografías que se exhiben en el portafolio corresponden a obras terminadas y se publican de manera que no identifican a las personas ni muestran datos personales. Si desea que una fotografía se retire, solicítelo y la eliminaremos."],
  },
  {
    titulo: "9. Cambios a esta política",
    texto: ["Podemos actualizar esta política para reflejar cambios en la ley o en nuestros servicios. La versión vigente siempre estará disponible en esta página, con su fecha de actualización."],
  },
];

export default function PrivacidadPage() {
  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800">
      <header className="bg-blue-950 text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="font-black text-xl tracking-tighter">DENASERV<span className="text-amber-400">.</span></Link>
          <Link href="/" className="text-sm font-semibold text-blue-100 hover:text-white"><Icono nombre="flecha-izq" className="inline h-4 w-4 -mt-0.5 mr-1" />Volver al inicio</Link>
        </div>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 pb-12 pt-6">
          <p className="text-sm font-bold uppercase tracking-widest text-amber-300">Legal</p>
          <h1 className="mt-2 text-3xl sm:text-5xl font-black leading-tight">Política de privacidad</h1>
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
        <p className="mt-8 text-sm text-slate-500">Este documento es informativo y no reemplaza el asesoramiento legal.</p>
      </main>

      <footer className="bg-blue-950 text-blue-200 py-6 text-center text-sm">&copy; {new Date().getFullYear()} DenaServ. Todos los derechos reservados.</footer>
    </div>
  );
}
