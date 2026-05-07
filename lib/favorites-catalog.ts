"use client";

import { getProducts, type ProductCategory } from "@/lib/pos-data";

export type FavoriteDisplayItem = {
  id: string;
  name: string;
  price: number;
  category: ProductCategory;
  source: "catalog" | "photo-reference";
};

type FavoriteSeedItem = {
  id: string;
  name: string;
  price: number;
};

const favoritePhotoReference: Partial<Record<ProductCategory, FavoriteSeedItem[]>> = {
  Vino: [
    { id: "vino-gewurztraminer-besserehof", name: "Gewurztraminer Besserehof", price: 28 },
    { id: "vino-bott-soave-doc", name: "BOTT. SOAVE DOC", price: 23 },
    { id: "vino-friuliano-ronco-dei-tassi", name: "Friuliano Roncò dei Tassi", price: 24 },
    { id: "vino-metodo-classico", name: "Metodo classico", price: 28 },
    { id: "vino-pinot-grigio-ronco-dei-tassi", name: "Pinot grigio Ronco dei Tassi", price: 24 },
    { id: "vino-sauvignon-ronco-dei-tassi", name: "Sauvignon Ronco dei Tassi", price: 24 },
    { id: "vino-bott-chardonnay", name: "BOTT. CHARDONNAY", price: 24 },
    { id: "vino-bott-vermentino", name: "BOTT. VERMENTINO", price: 24 },
    { id: "vino-gewurztraminer", name: "GEWURZTRAMINER", price: 27 },
    { id: "vino-muller-thurgau", name: "MULLER THURGAU", price: 24 },
    { id: "vino-ribolla-gialla", name: "Ribolla Gialla", price: 25 },
    { id: "vino-dessert-moscato-rosa", name: "X DESSERT Moscato Rosa", price: 22 },
    { id: "vino-bott-legrei-ros", name: "BOTT. LEGREI ROS", price: 24 },
    { id: "vino-chablis-premier", name: "CHABLIS PREMIER", price: 35 },
    { id: "vino-hamelin-cremant", name: "Hamelin cremant de bourgogne", price: 30 },
    { id: "vino-passerina", name: "Passerina", price: 24 },
    { id: "vino-riesling-von-gelben-fels", name: "Riesling von Gelben Fels", price: 35 },
    { id: "vino-bott-lugana-doc", name: "BOTT. LUGANA DOC", price: 24 },
    { id: "vino-chardonnay-riserva-besserehof", name: "Chardonnay Riserva Besserehof", price: 28 },
    { id: "vino-malvasia-ronco-dei-tassi", name: "Malvasia Ronco dei Tassi", price: 24 },
    { id: "vino-pinot-bianco-besserehof", name: "Pinot Bianco Besserehof", price: 24 },
    { id: "vino-sancerre", name: "Sancerre", price: 35 },
  ],
  Distillati: [
    { id: "distillati-903-barrique", name: "903 BARRIQUE", price: 5 },
    { id: "distillati-903-bianca", name: "903 BIANCA", price: 5 },
    { id: "distillati-diplomatico", name: "DIPLOMATICO", price: 8 },
    { id: "distillati-don-papa", name: "DON PAPA", price: 9 },
    { id: "distillati-grey-goose-vodka", name: "GREY GOOSE VODKA", price: 9 },
    { id: "distillati-havana-especial", name: "HAVANA ESPECIAL", price: 9 },
    { id: "distillati-lagavulin-16", name: "LAGAVULIN 16", price: 10 },
    { id: "distillati-le-diciotto-lune", name: "LE DICIOTTO LUNE", price: 4.5 },
    { id: "distillati-prime-uve", name: "PRIME UVE", price: 5 },
    { id: "distillati-rum", name: "Rum", price: 6 },
    { id: "distillati-togouchi", name: "Togouchi", price: 12 },
    { id: "distillati-tottori", name: "Tottori", price: 8 },
    { id: "distillati-ballantines-scot", name: "BALLANTINES SCOT", price: 5 },
    { id: "distillati-four-roses-whisk", name: "FOUR ROSES WHISK", price: 4.5 },
    { id: "distillati-irish-mist", name: "IRISH MIST", price: 4.5 },
    { id: "distillati-nikka-whisky", name: "Nikka whisky", price: 8 },
    { id: "distillati-talisker-whiskey", name: "Talisker whiskey", price: 8 },
    { id: "distillati-cardinal-mendoza", name: "CARDINAL MENDOZA", price: 7 },
    { id: "distillati-grappa-nardini", name: "Grappa Nardini", price: 5 },
    { id: "distillati-kiwami", name: "Kiwami", price: 10 },
    { id: "distillati-oban-14", name: "OBAN 14", price: 10 },
    { id: "distillati-tanqueray", name: "TANQUERAY", price: 6 },
  ],
  Amari: [
    { id: "amari-akashi", name: "Akashi", price: 10 },
    { id: "amari-amaretto", name: "AMARETTO", price: 4 },
    { id: "amari-amaro-del-capo", name: "AMARO DEL CAPO", price: 4 },
    { id: "amari-anima-nera", name: "ANIMA NERA", price: 3 },
    { id: "amari-averna", name: "AVERNA", price: 4 },
    { id: "amari-baileys", name: "BAILEYS", price: 4 },
    { id: "amari-branca-menta", name: "BRANCA MENTA", price: 4 },
    { id: "amari-cynar", name: "CYNAR", price: 3 },
    { id: "amari-diciotto-lune", name: "DICIOTTO LUNE", price: 4 },
    { id: "amari-disaronno", name: "DISARONNO", price: 4 },
    { id: "amari-fernet-branca", name: "FERNET BRANCA", price: 4 },
    { id: "amari-glera-bagnoli", name: "Glera Bagnoli", price: 4 },
    { id: "amari-grappa-amarone", name: "Grappa amarone", price: 6 },
    { id: "amari-grappa-genziana", name: "Grappa genziana", price: 5 },
    { id: "amari-jagermeister", name: "JAGERMEISTER", price: 4 },
    { id: "amari-kahlua", name: "KAHLUA", price: 3 },
    { id: "amari-limoncello", name: "LIMONCELLO", price: 4 },
    { id: "amari-liquirizia", name: "Liquirizia", price: 4 },
    { id: "amari-liquore-fieno", name: "Liquore fieno", price: 5 },
    { id: "amari-maraschino", name: "MARASCHINO", price: 4 },
    { id: "amari-montenegro", name: "MONTENEGRO", price: 4 },
    { id: "amari-prugna-bonollo", name: "PRUGNA BONOLLO", price: 4 },
    { id: "amari-ramazzotti", name: "RAMAZZOTTI", price: 4 },
    { id: "amari-sambuca", name: "SAMBUCA", price: 4 },
  ],
  "Vino mescita": [
    { id: "vino-mescita-calice-fior-darancio", name: "Calice Fior d’Arancio", price: 4 },
    { id: "vino-mescita-calice-cava", name: "Calice cava", price: 7 },
    { id: "vino-mescita-calice-chablis", name: "CALICE CHABLIS", price: 7 },
    { id: "vino-mescita-calice-champagne-brut", name: "Calice champagne brut", price: 13 },
    { id: "vino-mescita-calice-champagne-dosaggio-zero", name: "Calice champagne dosaggio zero", price: 14 },
    { id: "vino-mescita-calice-champagne-rose", name: "Calice champagne rose", price: 14 },
    { id: "vino-mescita-calice-chardonnay", name: "CALICE CHARDONNAY", price: 5.5 },
    { id: "vino-mescita-calice-cremant", name: "Calice cremant", price: 7 },
    { id: "vino-mescita-calice-cuvee-mil", name: "CALICE CUVEE MIL", price: 4.5 },
    { id: "vino-mescita-calice-es-metodo-classico", name: "Calice ES METODO CLASSICO", price: 7 },
    { id: "vino-mescita-calice-es-rose-metodo-classico", name: "calice ES ROSE metodo classico", price: 7.5 },
    { id: "vino-mescita-calice-fulvio-carugate", name: "Calice fulvio carugate", price: 7 },
    { id: "vino-mescita-calice-gewurztraminer", name: "Calice GEWURZTRAMINER", price: 5.5 },
    { id: "vino-mescita-calice-la-fiorita-saten", name: "Calice la fiorita saten", price: 6.5 },
    { id: "vino-mescita-calice-lafiorita-brut", name: "CALICE LAFIORITA BRUT", price: 6 },
    { id: "vino-mescita-calice-lugana", name: "CALICE LUGANA", price: 5.5 },
    { id: "vino-mescita-calice-muller-thurgau", name: "Calice MULLER THURGAU", price: 5.5 },
    { id: "vino-mescita-calice-prosecco", name: "CALICE PROSECCO", price: 4.5 },
    { id: "vino-mescita-calice-rose-fulvio-beo", name: "Calice rose fulvio beo", price: 7.5 },
    { id: "vino-mescita-calice-soave", name: "CALICE SOAVE", price: 6 },
    { id: "vino-mescita-calice-trebbiano", name: "Calice trebbiano", price: 5.5 },
    { id: "vino-mescita-calice-trento-doc", name: "Calice Trento doc", price: 7.5 },
    { id: "vino-mescita-calice-valpolicella", name: "CALICE VALPOLICELLA", price: 6 },
  ],
  Dessert: [
    { id: "dessert-bavarese-3-cioccolati", name: "Bavarese 3 cioccolati", price: 7.5 },
    { id: "dessert-cheesecake", name: "Cheesecake", price: 7.5 },
    { id: "dessert-creme-brulee-pistacchio", name: "Crème brûlée al Pistacchio", price: 7.5 },
    { id: "dessert-dolce-caramello", name: "Dolce caramello", price: 6 },
    { id: "dessert-dolce-lunch", name: "Dolce Lunch", price: 0 },
    { id: "dessert-dolce-pesca", name: "Dolce pesca", price: 6.5 },
    { id: "dessert-gelato-te", name: "Gelato tè", price: 4 },
    { id: "dessert-gelato-zenzero", name: "Gelato zenzero", price: 4 },
    { id: "dessert-gelato-zenzero-lime", name: "Gelato zenzero lime", price: 4 },
    { id: "dessert-marisa", name: "Marisa", price: 7.5 },
    { id: "dessert-meringata", name: "Meringata", price: 6.5 },
    { id: "dessert-mochi", name: "MOCHI", price: 7.5 },
    { id: "dessert-saint-pierre", name: "Saint Pierre", price: 7.5 },
    { id: "dessert-semifreddo-limone", name: "Semifreddo al limone", price: 6.5 },
    { id: "dessert-semifreddo-ciocco-menta", name: "Semifreddo ciocco-menta", price: 6.5 },
    { id: "dessert-semifreddo-pistacchio", name: "Semifreddo pistacchio", price: 6.5 },
    { id: "dessert-sorbetto-melograno", name: "Sorbetto melograno", price: 5 },
    { id: "dessert-sorbetto-1-pallina", name: "SORBETTO 1 PALLINA", price: 2.5 },
    { id: "dessert-sorbetto-anguria", name: "Sorbetto anguria", price: 5 },
    { id: "dessert-sorbetto-cocco", name: "SORBETTO COCCO", price: 5 },
    { id: "dessert-sorbetto-mango", name: "Sorbetto mango", price: 5 },
    { id: "dessert-sorbetto-mela-verde", name: "Sorbetto mela verde", price: 5 },
    { id: "dessert-sorbetto-pesca-gialla", name: "Sorbetto pesca gialla", price: 5 },
    { id: "dessert-sorbetto-yuzu", name: "SORBETTO YUZU", price: 5 },
  ],
  Bao: [
    { id: "bao-affumicato", name: "BAO AFFUMICATO", price: 7 },
    { id: "bao-bbq", name: "BAO BBQ", price: 7 },
    { id: "bao-boulevard", name: "BAO BOULEVARD", price: 7 },
    { id: "bao-california", name: "BAO CALIFORNIA", price: 9 },
    { id: "bao-caramel", name: "BAO CARAMEL", price: 7 },
    { id: "bao-cod", name: "BAO COD", price: 7 },
    { id: "bao-crispy", name: "BAO CRISPY", price: 7 },
    { id: "bao-favignana", name: "BAO FAVIGNANA", price: 9 },
    { id: "bao-genovese", name: "BAO GENOVESE", price: 7 },
    { id: "bao-gricia", name: "BAO GRICIA", price: 7 },
    { id: "bao-heaven", name: "BAO HEAVEN", price: 7 },
    { id: "bao-hot", name: "BAO HOT", price: 7 },
    { id: "bao-mediterraneo", name: "BAO MEDITERRANEO", price: 7 },
    { id: "bao-philadelphia", name: "BAO PHILADELPHIA", price: 6 },
    { id: "bao-pumpkin", name: "BAO PUMPKIN", price: 7 },
    { id: "bao-roll-flambe", name: "BAO ROLL FLAMBÈ", price: 7 },
    { id: "bao-sicily", name: "BAO SICILY", price: 7 },
    { id: "bao-spicy-salmone", name: "BAO SPICY SALMONE", price: 7 },
    { id: "bao-spicy-tonno", name: "BAO SPICY TONNO", price: 7 },
    { id: "bao-super-salmon", name: "BAO SUPER SALMON", price: 7 },
    { id: "bao-super-tuna", name: "BAO SUPER TUNA", price: 7 },
    { id: "bao-tartufo", name: "BAO TARTUFO", price: 7 },
    { id: "bao-yellow", name: "BAO YELLOW", price: 7 },
    { id: "bao-zari", name: "BAO ZARI", price: 7 },
  ],
  Cocktail: [
    { id: "cocktail-caipiroska", name: "CAIPIROSKA", price: 9 },
    { id: "cocktail-gin-tonic", name: "GIN TONIC", price: 9 },
    { id: "cocktail-inki-sparkling-time", name: "Inki Sparkling Time", price: 9 },
    { id: "cocktail-japanese-ice-tea", name: "JAPANESE ICE TEA", price: 9 },
    { id: "cocktail-moscow-mule", name: "MOSCOW MULE", price: 9 },
    { id: "cocktail-vodka-tonic", name: "VODKA TONIC", price: 7 },
    { id: "cocktail-cuba-libre", name: "CUBA LIBRE", price: 9 },
    { id: "cocktail-inki-free", name: "Inki Free", price: 9 },
    { id: "cocktail-inki-it", name: "Inki.it", price: 9 },
    { id: "cocktail-japanese-slipper", name: "JAPANESE SLIPPER", price: 9 },
    { id: "cocktail-rovinki", name: "Rovinki", price: 7 },
    { id: "cocktail-daiquiri", name: "DAIQUIRI", price: 5 },
    { id: "cocktail-inki-mule", name: "Inki mule", price: 9 },
    { id: "cocktail-inkino", name: "Inkino", price: 9 },
    { id: "cocktail-margarita", name: "MARGARITA", price: 5 },
    { id: "cocktail-shot", name: "SHOT", price: 3 },
    { id: "cocktail-gin-lemon", name: "GIN LEMON", price: 9 },
    { id: "cocktail-inki-sour", name: "Inki Sour", price: 9 },
    { id: "cocktail-inkita", name: "Inkita", price: 9 },
    { id: "cocktail-mojito", name: "Mojito", price: 9 },
    { id: "cocktail-virgin-inki-mule", name: "Virgin Inki Mule", price: 5 },
  ],
  Aperitivo: [
    { id: "aperitivo-americano", name: "AMERICANO", price: 5 },
    { id: "aperitivo-analcolico", name: "Analcolico", price: 5 },
    { id: "aperitivo-crodino", name: "Crodino", price: 4 },
    { id: "aperitivo-negroni", name: "NEGRONI", price: 6 },
    { id: "aperitivo-spritz-aperol", name: "SPRITZ APEROL", price: 5 },
    { id: "aperitivo-spritz-bianco", name: "SPRITZ BIANCO", price: 5 },
    { id: "aperitivo-spritz-campari", name: "SPRITZ CAMPARI", price: 5 },
  ],
  Hosomaki: [
    { id: "hoso-maki-plus", name: "HOSOMAKI PLUS 8PZ", price: 8.5 },
    { id: "hosomaki-salmone", name: "Hosomaki salmone", price: 5.5 },
    { id: "hoso-maki-special", name: "HOSOMAKI SPECIAL 8PZ", price: 10 },
    { id: "hosomaki-tonno", name: "Hosomaki tonno", price: 5.5 },
  ],
};

const categoryAliases: Partial<Record<ProductCategory, Record<string, string>>> = {
  Amari: {
    amaromontenegro: "montenegro",
  },
  Dessert: {
    mochigelato: "mochi",
  },
  Hosomaki: {
    hosomakiplus: "hosomakiplus8pz",
    hosomakispecial: "hosomakispecial8pz",
  },
  "Vino mescita": {
    calicechardonnay: "calicechardonnay",
  },
};

function normalizeLabel(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
}

function getCategoryKey(category: ProductCategory, name: string) {
  const normalized = normalizeLabel(name);
  return categoryAliases[category]?.[normalized] ?? normalized;
}

export function getFavoriteCategoryItems(category: ProductCategory) {
  const catalogItems = getProducts()
    .filter((product) => product.category === category)
    .map<FavoriteDisplayItem>((product) => ({
      id: product.id,
      name: product.name,
      price: product.sizeVariants?.find((variant) => variant.label === "8 pezzi")?.price ?? product.price,
      category,
      source: "catalog",
    }));

  const merged = new Map<string, FavoriteDisplayItem>();

  catalogItems.forEach((item) => {
    merged.set(getCategoryKey(category, item.name), item);
  });

  (favoritePhotoReference[category] ?? []).forEach((item) => {
    merged.set(getCategoryKey(category, item.name), {
      ...item,
      category,
      source: "photo-reference",
    });
  });

  return Array.from(merged.values()).sort((left, right) => left.name.localeCompare(right.name, "it", { sensitivity: "base" }));
}
