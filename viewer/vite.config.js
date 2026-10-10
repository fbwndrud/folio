import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viewerNotices } from '../scripts/viewer-notices.js';

// 빌드 결과는 viewer/dist(커밋하지 않음). server/view 가 그대로 내준다.
// 개발 중에는 FOLIO_VIEW_URL=<folio_view 주소의 origin> 으로 /api 를 떠 있는 뷰어 서버에 넘긴다.
const target = process.env.FOLIO_VIEW_URL;

export default defineConfig({
  plugins: [react(), viewerNotices()],
  // 상대 경로: 내보낸 화면(exports/viewer)을 어느 하위 경로에 올려도 파일을 찾는다.
  base: './',
  build: { outDir: 'dist', emptyOutDir: true, assetsDir: 'static', sourcemap: false },
  server: target ? { proxy: { '/api': { target, changeOrigin: true, headers: { origin: new URL(target).origin } } } } : {},
});
