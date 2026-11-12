// Yillik/oylik narx almashtirgichi. Boshqa JS yo'q: JS o'chiq bo'lsa oylik narx va
// "yillik: ..." izohi sahifada oddiy matn sifatida turadi, almashtirgich yashirin.
(() => {
  const toggle = document.querySelector('.toggle');
  if (!toggle) return;
  toggle.hidden = false;
  const buttons = toggle.querySelectorAll('button[data-period]');
  const apply = (period) => {
    for (const b of buttons) {
      const on = b.dataset.period === period;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    }
    for (const el of document.querySelectorAll('[data-monthly][data-yearly]')) {
      el.textContent = period === 'yearly' ? el.dataset.yearly : el.dataset.monthly;
    }
  };
  for (const b of buttons) b.addEventListener('click', () => apply(b.dataset.period));
})();
