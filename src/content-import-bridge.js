// Stage 13 browser hotfix: Content Pack file input lives in a body-level drawer,
// while the legacy delegated change handler is scoped to #app. Move the hidden
// input under #app immediately before the native file picker opens so its change
// event bubbles through the existing audited handler in main.js.
document.addEventListener('click', event => {
  const trigger = event.target?.closest?.('[data-action="content-import-trigger"]');
  if (!trigger) return;

  const input = document.querySelector('[data-content-pack-file]');
  const app = document.querySelector('#app');
  if (!input || !app || app.contains(input)) return;
  app.appendChild(input);
});
