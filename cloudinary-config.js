window.FP_CLOUDINARY = {
  // Cloudinary configurado para a Folha do Paiquerê.
  // O preset deve ser do tipo unsigned e não deve exigir API Secret no navegador.
  enabled: true,
  cloudName: "gknvvzw5",
  uploadPreset: "folhadopaiquere_preset",

  // Limites locais; o upload preset do Cloudinary também deve impor limites.
  maxImageBytes: 8 * 1024 * 1024,
  maxRawBytes: 2 * 1024 * 1024,
  folder: "folha-do-paiquere"
};
