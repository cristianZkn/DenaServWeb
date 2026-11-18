import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { etiquetaEstado } from "@/lib/estados";

/** Datos de la ficha del cliente: resumen general del proyecto, sin materiales ni desglose de costos. */
export interface FichaData {
  codigo_cotizacion: string;
  cliente_nombre: string;
  cliente_telefono: string | null;
  direccion_terreno: string;
  superficie_m2: number;
  tipo_proyecto?: string;
  costo_total: number;
  estado?: string;
  avance?: number;
  fecha_creacion: string;
  nivelacion_modalidad?: string;
  nivelacion_m3?: number;
  hitos_pago: { id: number; fase: string; porcentaje: number; monto_pago: number; estado?: string }[];
}

export const DESTINO_HITO: Record<string, string> = {
  ANTICIPO_40: "Antes del inicio de obras: compra de materiales, traslados y primeros pagos a proveedores.",
  AVANCE_30: "Al alcanzar el 50 % de avance de la obra.",
  ENTREGA_30: "Al terminar el proyecto, con la revisión y entrega de llaves.",
};
export const NOMBRE_HITO: Record<string, string> = { ANTICIPO_40: "Anticipo", AVANCE_30: "Avance de obra", ENTREGA_30: "Entrega" };
export const ESTADO_PAGO: Record<string, string> = { PENDIENTE: "Pendiente", ABONADO: "Pago parcial", PAGADO: "Pagado" };

export const VIGENCIA_DIAS = 15;
export const clp = (n: number) => "$" + Math.round(Number(n)).toLocaleString("es-CL");

export const s = StyleSheet.create({
  page: { padding: 36, fontSize: 10, fontFamily: "Helvetica", color: "#0f172a" },
  header: { backgroundColor: "#12332f", color: "white", padding: 14, marginBottom: 14 },
  title: { fontSize: 18, fontFamily: "Helvetica-Bold" },
  h2: { fontSize: 12, fontFamily: "Helvetica-Bold", marginTop: 14, marginBottom: 6, borderBottom: "1 solid #cbd5e1", paddingBottom: 3 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  bold: { fontFamily: "Helvetica-Bold" },
  muted: { fontSize: 8, color: "#64748b" },
  note: { fontSize: 8, color: "#64748b", marginTop: 16 },
});

export const Row = ({ a, b, strong }: { a: string; b: string; strong?: boolean }) => (
  <View style={s.row}>
    <Text style={strong ? s.bold : undefined}>{a}</Text>
    <Text style={strong ? s.bold : undefined}>{b}</Text>
  </View>
);

export default function FichaPdf({ c }: { c: FichaData }) {
  const emision = new Date(c.fecha_creacion);
  const vence = new Date(emision.getTime() + VIGENCIA_DIAS * 86400000);
  // El total guardado ya incluye IVA 19 %.
  const neto = Math.round(Number(c.costo_total) / 1.19);
  const iva = Math.round(Number(c.costo_total)) - neto;

  return (
    <Document title={`Proyecto ${c.codigo_cotizacion}`}>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <Text style={s.title}>DENASERV</Text>
          <Text>Ficha informativa del proyecto — Folio {c.codigo_cotizacion}</Text>
        </View>

        <Row a="Cliente" b={c.cliente_nombre} />
        {c.cliente_telefono ? <Row a="Contacto" b={c.cliente_telefono} /> : null}
        <Row a="Fecha de emisión" b={emision.toLocaleDateString("es-CL")} />
        <Row a={`Vigencia (${VIGENCIA_DIAS} días corridos)`} b={`hasta ${vence.toLocaleDateString("es-CL")}`} />

        <Text style={s.h2}>El proyecto</Text>
        <Row a="Ubicación del terreno" b={c.direccion_terreno} />
        <Row a="Tipo de proyecto" b={c.tipo_proyecto === "SOLO_RADIER" ? "Radier" : "Casa prefabricada"} />
        <Row a="Superficie" b={`${c.superficie_m2} m²`} />
        {c.estado ? <Row a="Estado" b={etiquetaEstado(c.estado)} /> : null}
        {c.avance !== undefined && c.estado && c.estado !== "BORRADOR" ? <Row a="Avance de la obra" b={`${c.avance} %`} /> : null}

        <Text style={s.h2}>Valor del proyecto</Text>
        <Row a="Valor neto" b={clp(neto)} />
        <Row a="IVA 19 %" b={clp(iva)} />
        <Row a="TOTAL (IVA incluido)" b={clp(c.costo_total)} strong />

        <Text style={s.h2}>Cronograma de pagos</Text>
        {c.hitos_pago.map((h) => (
          <View key={h.id}>
            <Row a={`${NOMBRE_HITO[h.fase] || h.fase} (${h.porcentaje} %)${h.estado ? ` — ${ESTADO_PAGO[h.estado] || h.estado}` : ""}`} b={clp(h.monto_pago)} />
            {DESTINO_HITO[h.fase] ? <Text style={[s.muted, { marginBottom: 3 }]}>{DESTINO_HITO[h.fase]}</Text> : null}
          </View>
        ))}

        {c.nivelacion_modalidad === "CLIENTE" ? (
          <Text style={s.note}>
            El relleno de estabilizado ({c.nivelacion_m3} m³) para la base del radier lo adquiere el cliente directamente.
          </Text>
        ) : null}
        <Text style={s.note}>
          Documento informativo y resumen del proyecto, no constituye contrato. Generado por DENASERV WEB. Valores en pesos chilenos (CLP). Oferta válida por {VIGENCIA_DIAS} días corridos desde la emisión.
        </Text>
      </Page>
    </Document>
  );
}
