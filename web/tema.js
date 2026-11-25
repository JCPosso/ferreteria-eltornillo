(function () {
  try {
    var t = localStorage.getItem('tema');
    if (t === 'claro' || t === 'oscuro') document.documentElement.dataset.tema = t;
  } catch (e) {
    return;
  }
})();
