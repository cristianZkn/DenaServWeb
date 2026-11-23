/** Ilustración de una casa (SVG) para el catálogo cuando no hay foto: el ancho crece con los m² y las ventanas con los dormitorios. */
export default function CasaIlustrada({ m2, dormitorios, plano = false }: { m2: number; dormitorios: number; plano?: boolean }) {
  const ancho = plano ? 230 : Math.round(120 + (m2 - 36) * 4.5); // 36 m² → 120 · 54 m² → 201 · 72 m² → 282
  const x0 = 200 - ancho / 2;
  const x1 = 200 + ancho / 2;
  const suelo = 205;
  const alto = 78;
  const techo = suelo - alto;
  const ventanas = Math.max(1, Math.min(4, dormitorios + 1));
  const paso = ancho / (ventanas + 1);
  const trazo = plano ? "#aed4cf" : "#12332f";
  const dash = plano ? "6 5" : undefined;

  return (
    <svg viewBox="0 0 400 260" role="img" aria-label={plano ? "Plano de una casa a medida" : `Ilustración de una casa de ${m2} metros cuadrados`} className="h-full w-full">
      <defs>
        <linearGradient id={`cielo-${m2}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={plano ? "#0b201e" : "#aed4cf"} />
          <stop offset="1" stopColor={plano ? "#163f3b" : "#eef6f5"} />
        </linearGradient>
      </defs>
      <rect width="400" height="260" fill={`url(#cielo-${m2})`} />
      {plano && <path d="M0 40H400M0 80H400M0 120H400M0 160H400M0 200H400M40 0V260M80 0V260M120 0V260M160 0V260M200 0V260M240 0V260M280 0V260M320 0V260M360 0V260" stroke="#7ab7b0" strokeOpacity="0.15" />}
      {!plano && <circle cx="335" cy="52" r="20" fill="#fbbf24" opacity="0.9" />}
      {!plano && <path d="M0 215c60-26 120-26 190-8 70 18 130 8 210-14v67H0z" fill="#7ab7b0" opacity="0.55" />}
      <rect y={suelo} width="400" height="55" fill={plano ? "#0b201e" : "#46958d"} opacity={plano ? 0.6 : 0.7} />

      {/* Cuerpo */}
      <rect x={x0} y={techo} width={ancho} height={alto} fill={plano ? "none" : "#f6f8f8"} stroke={trazo} strokeWidth="3" strokeDasharray={dash} />
      {/* Techo a dos aguas */}
      <path d={`M${x0 - 14} ${techo + 2}L200 ${techo - 52}L${x1 + 14} ${techo + 2}z`} fill={plano ? "none" : "#1a4e48"} stroke={trazo} strokeWidth="3" strokeLinejoin="round" strokeDasharray={dash} />
      {!plano && <path d={`M${x0 - 14} ${techo + 2}L200 ${techo - 52}L${x1 + 14} ${techo + 2}`} fill="none" stroke="#7ab7b0" strokeWidth="2" opacity="0.5" />}
      {/* Chimenea en las casas de 2 o más dormitorios */}
      {dormitorios >= 2 && <rect x={x1 - 52} y={techo - 38} width="14" height="30" fill={plano ? "none" : "#3c474c"} stroke={trazo} strokeWidth="2.5" />}
      {/* Puerta */}
      <rect x={x1 - paso * 0.75 - 12} y={suelo - 46} width="24" height="46" rx="2" fill={plano ? "none" : "#b7791f"} stroke={trazo} strokeWidth="2.5" strokeDasharray={dash} />
      {/* Ventanas */}
      {Array.from({ length: ventanas }, (_, k) => {
        const cx = x0 + paso * (k + 1) - (k === ventanas - 1 && ventanas > 1 ? paso * 0.25 : 0);
        return (
          <g key={k}>
            <rect x={cx - 15} y={techo + 16} width="30" height="26" rx="2" fill={plano ? "none" : "#fde68a"} stroke={trazo} strokeWidth="2.5" strokeDasharray={dash} />
            <path d={`M${cx} ${techo + 16}V${techo + 42}M${cx - 15} ${techo + 29}H${cx + 15}`} stroke={trazo} strokeWidth="1.5" />
          </g>
        );
      })}
      {plano && (
        <g stroke="#fbbf24" strokeWidth="1.5" fill="#fbbf24" fontSize="11" fontFamily="sans-serif">
          <path d={`M${x0} ${suelo + 22}H${x1}M${x0} ${suelo + 16}v12M${x1} ${suelo + 16}v12`} fill="none" />
          <text x="200" y={suelo + 40} textAnchor="middle" stroke="none">a su medida</text>
        </g>
      )}
    </svg>
  );
}
