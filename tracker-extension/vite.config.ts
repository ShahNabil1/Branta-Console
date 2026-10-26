import { defineConfig } from 'vite';
export default defineConfig({base:'./',build:{rollupOptions:{input:{popup:'popup.html',sidepanel:'sidepanel.html',offscreen:'offscreen.html',background:'src/background/worker.ts',counters:'src/content/counters.ts'},output:{entryFileNames:chunk=>['background','counters'].includes(chunk.name)?'[name].js':'assets/[name]-[hash].js'}}}});
