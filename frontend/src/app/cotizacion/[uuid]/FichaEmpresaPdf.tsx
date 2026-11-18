import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { etiquetaEstado } from "@/lib/estados";
import { etiquetaCategoria } from "@/lib/categorias";
import { ESTADO_PAGO, NOMBRE_HITO, Row, clp, s } from "./FichaPdf";

/** Ficha de la empresa (uso interno): detalle completo de materiales, mano de obra, traslado, ganancia, pagos y bitácora. */
export interface EmpresaFicha {
  codigo_cotizacion: string;
  cliente_nombre: string;
  cliente_telefono: string | null;
  cliente_rut?: string | null;
  direccion_terreno: string;
  superficie_m2: number;
  distancia_flete_km: number;
  tipo_proyecto: string;
  estado: string;
  fecha_creacion: string;
  hitos_pago: { id: number; fase: string; porcentaje: number; monto_pago: number; monto_abonado?: number; estado: string }[];
}

export interface Desglose {
  materiales: { nombre: string; categoria: string; unidad: string; proveedor: string | null; cantidad: number; subtotal: number; de_la_lista: boolean }[];
  mano_obra: { concepto: string; m2?: number; tarifa: number; trabajadores: number; subtotal: number }[];
  traslado: { km: number; dias: number; litros: number; precio_litro: number; costo: number } | null;
  costo_materiales: number; costo_mano_obra: number; costo_flete: number; costo_nivelacion: number;
  ganancia: number; neto: number; iva: number; total: number;
  n_trabajadores: number; dias_obra: number; m2_vigas_vista: number;
}

export interface RegistroPdf { id: number; porcentaje: number; comentario: string; fecha: string; usuario: string | null; fotos: string[] }
export interface ControlInterno { neto_cobrado: number; costo_presupuestado: number; ganancia_estimada: number; avance_real: number }

const e = StyleSheet.create({
  fila: { flexDirection: "row", paddingVertical: 2, borderBottom: "0.5 solid #e2e8f0" },
  c1: { flex: 4 }, c2: { flex: 2, textAlign: "right" }, c3: { flex: 2, textAlign: "right" },
  grupo: { fontFamily: "Helvetica-Bold", marginTop: 8, marginBottom: 2, color: "#12332f" },
  reg: { marginBottom: 8, padding: 6, border: "0.5 solid #cbd5e1" },
  fotos: { flexDirection: "row", flexWrap: "wrap", marginTop: 4 },
  foto: { width: 110, height: 80, marginRight: 4, marginBottom: 4, objectFit: "cover" },
});

const num = (n: number) => Number(n).toLocaleString("es-CL", { maximumFractionDigits: 2 });

export default function FichaEmpresaPdf({ c, desglose: d, interno, bitacora }: { c: EmpresaFicha; desglose: Desglose; interno: ControlInterno; bitacora: RegistroPdf[] }) {
  const categorias = Array.from(new Set(d.materiales.map((m) => m.categoria)));

  return (
    <Document title={`Ficha de la empresa ${c.codigo_cotizacion}`}>
      <Page size="A4" style={s.page} wrap>
        <View style={s.header}>
          <Text style={s.title}>DENASERV</Text>
          <Text>Ficha de la empresa (uso interno) — Folio {c.codigo_cotizacion}</Text>
        </View>

        <Text style={s.h2}>Cliente y proyecto</Text>
        <Row a="Cliente" b={c.cliente_nombre} />
        {c.cliente_rut ? <Row a="RUT" b={c.cliente_rut} /> : null}
        {c.cliente_telefono ? <Row a="Contacto" b={c.cliente_telefono} /> : null}
        <Row a="Ubicación del terreno" b={c.direccion_terreno} />
        <Row a="Tipo de proyecto" b={c.tipo_proyecto === "SOLO_RADIER" ? "Radier" : "Casa prefabricada"} />
        <Row a="Superficie" b={`${c.superficie_m2} m²`} />
        {d.m2_vigas_vista > 0 ? <Row a="Superficie con vigas a la vista" b={`${d.m2_vigas_vista} m²`} /> : null}
        <Row a="Estado" b={etiquetaEstado(c.estado)} />
        <Row a="Avance de la obra" b={`${interno.avance_real} %`} />
        <Row a="Fecha de emisión" b={new Date(c.fecha_creacion).toLocaleDateString("es-CL")} />

        <Text style={s.h2}>Materiales</Text>
        {categorias.length === 0 ? <Text style={s.muted}>Este proyecto no tiene materiales detallados.</Text> : null}
        {categorias.map((cat) => (
          <View key={cat}>
            <Text style={e.grupo}>{etiquetaCategoria(cat)}</Text>
            {d.materiales.filter((m) => m.categoria === cat).map((m, i) => (
              <View key={`${cat}-${i}`} style={e.fila} wrap={false}>
                <Text style={e.c1}>{m.nombre}{m.proveedor ? ` (${m.proveedor})` : ""}</Text>
                <Text style={e.c2}>{num(m.cantidad)} {m.unidad.toLowerCase()}</Text>
                <Text style={e.c3}>{clp(m.subtotal)}</Text>
              </View>
            ))}
          </View>
        ))}
        <Row a="Total de materiales" b={clp(d.costo_materiales)} strong />

        <Text style={s.h2}>Mano de obra</Text>
        {d.mano_obra.length === 0 ? <Text style={s.muted}>Sin detalle de mano de obra.</Text> : null}
        {d.mano_obra.map((l, i) => (
          <View key={i} style={e.fila} wrap={false}>
            <Text style={e.c1}>{l.concepto}</Text>
            <Text style={e.c2}>
              {l.m2 !== undefined ? `${num(l.m2)} m² × ${clp(l.tarifa)} × ${l.trabajadores} trab.` : `${l.trabajadores} trab. × ${clp(l.tarifa)}`}
            </Text>
            <Text style={e.c3}>{clp(l.subtotal)}</Text>
          </View>
        ))}
        <Row a={`Total de mano de obra${d.n_trabajadores ? ` (${d.n_trabajadores} trabajadores)` : ""}`} b={clp(d.costo_mano_obra)} strong />

        <Text style={s.h2}>Traslado</Text>
        {d.traslado ? (
          <Row a={`${num(d.traslado.km)} km por día ÷ 10 × ${d.traslado.dias} días = ${num(d.traslado.litros)} L × ${clp(d.traslado.precio_litro)}`} b={clp(d.traslado.costo)} />
        ) : (
          <Row a={`Distancia al terreno: ${c.distancia_flete_km} km`} b={clp(d.costo_flete)} />
        )}

        <Text style={s.h2}>Desglose económico</Text>
        <Row a="Materiales" b={clp(d.costo_materiales)} />
        <Row a="Mano de obra" b={clp(d.costo_mano_obra)} />
        <Row a="Traslado" b={clp(d.costo_flete)} />
        {d.costo_nivelacion > 0 ? <Row a="Relleno de estabilizado" b={clp(d.costo_nivelacion)} /> : null}
        <Row a="Margen de la empresa (ganancia)" b={clp(d.ganancia)} />
        <Row a="Valor neto" b={clp(d.neto)} />
        <Row a="IVA 19 %" b={clp(d.iva)} />
        <Row a="TOTAL (IVA incluido)" b={clp(d.total)} strong />

        <Text style={s.h2}>Control interno</Text>
        <Row a="Neto cobrado" b={clp(interno.neto_cobrado)} />
        <Row a="Costo presupuestado (neto)" b={clp(interno.costo_presupuestado)} />
        <Row a="Ganancia estimada" b={clp(interno.ganancia_estimada)} strong />

        <Text style={s.h2}>Pagos</Text>
        {c.hitos_pago.map((h) => (
          <Row key={h.id} a={`${NOMBRE_HITO[h.fase] || h.fase} (${h.porcentaje} %) — ${ESTADO_PAGO[h.estado] || h.estado}${h.estado === "ABONADO" ? `, abonado ${clp(h.monto_abonado ?? 0)}` : ""}`} b={clp(h.monto_pago)} />
        ))}

        <Text style={s.h2}>Bitácora de avance</Text>
        {bitacora.length === 0 ? <Text style={s.muted}>Aún no hay registros de avance.</Text> : null}
        {bitacora.map((r) => (
          <View key={r.id} style={e.reg} wrap={false}>
            <Text style={s.bold}>{r.porcentaje} % de obra — {new Date(r.fecha).toLocaleDateString("es-CL")}{r.usuario ? ` — ${r.usuario}` : ""}</Text>
            <Text style={{ marginTop: 2 }}>{r.comentario}</Text>
            {r.fotos.length > 0 ? (
              <View style={e.fotos}>
                {r.fotos.map((f, i) => (
                  <Image key={i} src={f} style={e.foto} />
                ))}
              </View>
            ) : null}
          </View>
        ))}

        <Text style={s.note}>Documento de uso exclusivo de la empresa. No compartir con el cliente. Valores en pesos chilenos (CLP).</Text>
      </Page>
    </Document>
  );
}
