const GENERATED_IMAGE_FILES = {
  hero: 'assets/hero.b64',
  barrel: 'assets/barrel.b64',
  trailer: 'assets/trailer.b64',
  interior: 'assets/interior.b64'
};

window.GARANT_ASSETS_READY = Promise.all(
  Object.entries(GENERATED_IMAGE_FILES).map(async ([key, path]) => {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`Не удалось загрузить ${path}`);
    const base64 = (await response.text()).trim();
    return [key, `data:image/jpeg;base64,${base64}`];
  })
).then((entries) => {
  const images = Object.fromEntries(entries);
  window.GARANT_ASSETS = {
    hero: images.hero,
    barrel: images.barrel,
    quadro: images.barrel,
    frame: images.hero,
    trailer: images.trailer,
    projectMain: images.hero,
    projectAlt: images.trailer,
    projectBarrel: images.barrel,
    interior: images.interior,
    final: images.hero
  };
  return window.GARANT_ASSETS;
});
