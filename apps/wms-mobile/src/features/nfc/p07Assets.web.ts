/** Browser ESM has no CommonJS require; keep the exact locked artwork bytes. */
export const P07_ASSETS = {
  artwork: { uri: new URL('./assets/B07-artwork-source.png', import.meta.url).href },
  productBox: { uri: new URL('./assets/product-box-demo.png', import.meta.url).href },
};
