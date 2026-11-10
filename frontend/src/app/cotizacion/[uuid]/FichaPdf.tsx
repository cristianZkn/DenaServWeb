import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

export interface FichaData {
  codigo_cotizacion: string;
  cliente_nombre: string;
  cliente_telefono: string | null;
  direccion_terreno: string;
  superficie_m2: number;
  distancia_flete_km: number;
  base_terreno?: { nombre: string } | null;
  revestimiento?: { nombre: string } | null;
  costo_materiales: number;
  costo_mano_obra: number;
  costo_flete: number;
  costo_total: number;
  fecha_creacion: string;
  detalles_insumo?: { id: number; etapa_obra: string; cantidad_calculada: number; subtotal_costo: number; catalogo_tipo?: { nombre: string; unidad_medida: string } | null }[];
  hitos_pago: { id: number; fase: string; porcentaje: number; monto_pago: number }[];
}

const VIGENCIA_DIAS = 15;
const clp = (n: number) => "$" + Math.round(Number(n)).toLocaleString("es-CL");

const s = StyleSheet.create({
  page: { padding: 36, fontSize: 10, fontFamily: "Helvetica", color: "#0f172a" },
  header: { backgroundColor: "#1e3a8a", color: "white", padding: 14, marginBottom: 14 },
  title: { fontSize: 18, fontFamily: "Helvetica-Bold" },
  h2: { fontSize: 12, fontFamily: "Helvetica-Bold", marginTop: 14, marginBottom: 6, borderBottom: "1 solid #cbd5e1", paddingBottom: 3 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  bold: { fontFamily: "Helvetica-Bold" },
  note: { fontSize: 8, color: "#64748b", marginTop: 16 },
});

const Row = ({ a, b, strong }: { a: string; b: string; strong?: boolean }) => (
  <View style={s.row}>
    <Text style={strong ? s.bold : undefined}>{a}</Text>
    <Text style={strong ? s.bold : undefined}>{b}</Text>
  </View>
);

export default function FichaPdf({ c }: { c: FichaData }) {
  const emision = new Date(c.fecha_creacion);
  const vence = new Date(emision.getTime() + VIGENCIA_DIAS * 86400000);
  // El total guardado ya incluye IVA 19% (precios de la empresa y retail son con IVA).
  const neto = Math.round(Number(c.costo_total) / 1.19);
  const iva = Math.round(Number(c.costo_total)) - neto;

  return (
    <Document title={`Cotización ${c.codigo_cotizacion}`}>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <Text style={s.title}>DENASERV</Text>
          <Text>Ficha técnica y presupuesto — Folio {c.codigo_cotizacion}</Text>
        </View>

        <Row a="Cliente" b={c.cliente_nombre} />
        {c.cliente_telefono ? <Row a="Contacto" b={c.cliente_telefono} /> : null}
        <Row a="Fecha de emisión" b={emision.toLocaleDateString("es-CL")} />
        <Row a={`Vigencia (${VIGENCIA_DIAS} días corridos)`} b={`hasta ${vence.toLocaleDateString("es-CL")}`} />

        <Text style={s.h2}>Especificaciones técnicas</Text>
        <Row a="Dirección del terreno" b={c.direccion_terreno} />
        <Row a="Superficie" b={`${c.superficie_m2} m²`} />
        <Row a="Base" b={c.base_terreno?.nombre ?? "No especificada"} />
        <Row a="Revestimiento exterior" b={c.revestimiento?.nombre ?? "No especificado"} />
        <Row a="Distancia de traslado" b={`${c.distancia_flete_km} km`} />

        {[["ETAPA_1", "Lista de materiales — Etapa 1 (obra gruesa)"], ["ETAPA_2", "Lista de materiales — Etapa 2 (terminaciones)"]].map(([et, titulo]) => {
          const items = (c.detalles_insumo ?? []).filter((d) => d.etapa_obra === et);
          return items.length === 0 ? null : (
            <View key={et}>
              <Text style={s.h2}>{titulo}</Text>
              {items.map((d) => (
                <Row key={d.id} a={`${d.catalogo_tipo?.nombre ?? "Insumo"} — ${d.cantidad_calculada} ${d.catalogo_tipo?.unidad_medida ?? ""}`} b={clp(d.subtotal_costo)} />
              ))}
            </View>
          );
        })}

        <Text style={s.h2}>Desglose económico</Text>
        {[
          ["Materiales", c.costo_materiales],
          ["Mano de obra", c.costo_mano_obra],
          ["Flete y logística", c.costo_flete],
          ["Gestión y utilidad", Math.max(0, Math.round(Number(c.costo_total) - c.costo_materiales - c.costo_mano_obra - c.costo_flete))],
        ]
          .filter(([, v]) => Number(v) > 0)
          .map(([l, v]) => (
            <Row key={l as string} a={l as string} b={clp(Number(v))} />
          ))}
        <Row a="Neto" b={clp(neto)} />
        <Row a="IVA 19%" b={clp(iva)} />
        <Row a="TOTAL (IVA incluido)" b={clp(c.costo_total)} strong />

        <Text style={s.h2}>Cronograma de pagos (40-30-30)</Text>
        {c.hitos_pago.map((h) => (
          <Row key={h.id} a={`${h.fase.replace(/_/g, " ")} (${h.porcentaje}%)`} b={clp(h.monto_pago)} />
        ))}

        <Text style={s.note}>
          Documento generado por DENASERV WEB. Valores en pesos chilenos (CLP). Oferta válida por {VIGENCIA_DIAS} días corridos desde la emisión.
        </Text>
      </Page>
    </Document>
  );
}
