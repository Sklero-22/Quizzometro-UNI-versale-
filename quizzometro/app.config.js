// Estende app.json: per la web app su GitHub Pages l'indirizzo base (es. /nome-repository)
// viene passato dall'automazione tramite la variabile WEB_BASE_URL. Per Android non cambia nulla.
module.exports = ({ config }) => ({
  ...config,
  experiments: {
    ...config.experiments,
    ...(process.env.WEB_BASE_URL ? { baseUrl: process.env.WEB_BASE_URL } : {}),
  },
});
