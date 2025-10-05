/* responsive.css – drop-in */
:root{
  --bg:#f6f7fb;
  --ink:#1b1f23;
  --brand:#003366;
  --card:#ffffff;
  --line-rer:#d71920;
  --line-77:#ff9800;
  --line-201:#1b8e5a;
  --radius:14px;
  --shadow:0 6px 18px #00000014;
  /* Hauteurs typées pour le mode 1080x1920 portrait */
  --headerH:72px;
  --alertH:44px;
}

*{box-sizing:border-box}
html,body{height:100%;scroll-behavior:smooth}
body{
  margin:0;
  font-family: system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial, "Noto Sans", "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";
  color:var(--ink);
  background:var(--bg);
  line-height:1.25;
  font-size:clamp(14px, 1.8vw, 18px);
}

/* Header */
header{
  display:flex; align-items:center; justify-content:space-between;
  gap:12px; padding:10px 16px;
  background:var(--brand); color:#fff; min-height:var(--headerH);
}
header .logos{display:flex; align-items:center; gap:10px; flex-wrap:wrap}
header img{max-height:42px; height:auto; width:auto}

/* Alerte trafic */
.alert-banner{
  min-height:var(--alertH);
  display:flex; align-items:center; gap:10px;
  padding:8px 14px;
  background:#fff6d4; color:#6b4c00; border-top:1px solid #00000010; border-bottom:1px solid #00000010;
  overflow:hidden; white-space:nowrap; text-overflow:ellipsis;
}

/* Grille des cartes */
main{
  padding:14px;
}
.wrapper{
  display:grid; gap:14px;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
}

/* Cartes */
.transport-block{
  background:var(--card);
  border-radius:var(--radius);
  box-shadow:var(--shadow);
  padding:12px;
  min-width:0;  /* clamp overflow on small screens */
}

.transport-block h2{
  margin:0 0 8px 0;
  font-size:clamp(18px, 2.4vw, 22px);
  display:flex; align-items:center; gap:8px; flex-wrap:wrap;
}

.badge{
  display:inline-flex; align-items:center; gap:6px;
  font-weight:700; padding:4px 10px; border-radius:999px; color:#fff;
  box-shadow: inset 0 -2px 0 #00000020;
}
.badge.rer{background:var(--line-rer)}
.badge.l77{background:var(--line-77)}
.badge.l201{background:var(--line-201)}

.passage{
  display:flex; align-items:center; justify-content:space-between;
  padding:8px 0; border-top:1px dashed #00000015;
  gap:10px; min-width:0;
}
.passage:first-child{border-top:none}
.passage .when{font-variant-numeric:tabular-nums}

/* Listes d'arrêts défilantes */
.stops{
  margin-top:8px; padding-top:8px; border-top:1px solid #00000010;
  display:flex; gap:10px; overflow:auto hidden; -webkit-overflow-scrolling:touch;
}
.stop-pill{
  white-space:nowrap; border:1px solid #00000014; padding:6px 10px; border-radius:999px; background:#fafbfe;
}

/* États */
.state-imminent{color:#0a7a2a; font-weight:700}
.state-delayed{color:#b45309; font-weight:600}
.state-cancel{color:#b00020; font-weight:700; text-decoration:line-through}

/* --- Portrait plein écran 1080×1920 : pas de scroll, 4 cartes égales --- */
@media (orientation:portrait) and (min-height: 1000px){
  html,body{overflow:hidden}
  main{
    height: calc(100dvh - var(--headerH) - var(--alertH));
    padding:12px 14px 16px;
  }
  .wrapper{
    height:100%;
    grid-template-columns:1fr;
    grid-template-rows: repeat(4, minmax(0, 1fr));
  }
  .transport-block{display:flex; flex-direction:column; min-height:0}
  .transport-block .scroll{
    overflow:auto; margin-top:6px;
  }
}

/* --- Mobile ≤ 600px : 1 colonne, compacter --- */
@media (max-width: 600px){
  header img{max-height:32px}
  .wrapper{grid-template-columns:1fr}
  .transport-block{padding:10px}
}

/* --- Large desktop ≥ 1200px : colonnes plus larges --- */
@media (min-width: 1200px){
  .wrapper{grid-template-columns: repeat(2, minmax(380px, 1fr))}
}
