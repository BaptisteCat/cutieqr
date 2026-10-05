// Chargé avant le rendu pour éviter un flash : applique le thème choisi, sinon celui du système.
(function () {
  try {
    var t = localStorage.getItem('cutieqr-theme');
    if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  } catch (e) { /* stockage indisponible : thème du système */ }
})();
