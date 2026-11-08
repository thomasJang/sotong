import { io } from 'socket.io-client';

// 같은 호스트의 /socket.io 엔드포인트로 연결
// Vite 프록시 및 프로덕션 Express 서빙 모두 완벽 호환
export const socket = io({
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000
});
