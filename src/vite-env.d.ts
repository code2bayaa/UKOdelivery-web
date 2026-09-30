/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** A full style.json URL — any MapLibre-compatible provider, or a self-hosted style. Wins over the key. */
  readonly VITE_MAP_STYLE?: string
  /** MapTiler key; the component builds the streets-v2 style URL from it. Blank = maps fall back to the sketch panel. */
  readonly VITE_MAPTILER_KEY?: string
}
