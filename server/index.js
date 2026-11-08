import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import QRCode from 'qrcode';
import { generateUniqueCharacter } from './nicknameGenerator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_URL = process.env.PUBLIC_URL ? new URL(process.env.PUBLIC_URL).origin : null;
const INSTRUCTOR_PASSWORD = process.env.INSTRUCTOR_PASSWORD || '1937';
const STUDENT_PASSWORD = process.env.STUDENT_PASSWORD || '1234';

// 로컬 IPv4 주소 자동 탐색
function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name] || []) {
      // IPv4이면서 127.0.0.1이 아닌 내부가 아닌 주소
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

const localIp = getLocalIpAddress();

// 상태 저장소
const state = {
  // 등록된 질문 목록
  questions: [
    {
      id: 'default-q1',
      title: '오늘 수업 내용의 이해도는 어떤가요?',
      type: 'choice',
      options: ['아주 잘 이해했어요! 😊', '대체로 이해했어요 👍', '조금 헷갈려요 🤔', '다시 설명이 필요해요 😢'],
      createdAt: Date.now() - 60000
    }
  ],
  // 현재 활성화된 질문 ID (null이면 "질문이 없습니다" 상태)
  activeQuestionId: null,
  // 질문별 학생들의 답변 데이터
  // answers[questionId][studentId] = { answer, studentName, studentIcon, updatedAt }
  answers: {},
  // 현재 세션의 학생들: studentId -> { id, name, icon, socketId, connected }
  students: new Map()
};

// 미들웨어
app.use(cors());
app.use(express.json());

app.get('/healthz', (req, res) => {
  res.json({ status: 'ok' });
});

// 프로덕션 빌드 파일 정적 서빙 지원
const distPath = path.join(__dirname, '../dist');
app.use(express.static(distPath));

// 기본 상태 조회 및 QR 코드용 정보 API
app.get('/api/server-info', async (req, res) => {
  const host = req.headers.host ? req.headers.host.split(':')[0] : localIp;
  const clientPort = process.env.CLIENT_PORT || 5173;
  // 요청이 들어온 host가 localhost가 아니면 그 host를 쓰고, 아니면 감지된 localIp 사용
  const targetHost = (host !== 'localhost' && host !== '127.0.0.1') ? host : localIp;
  const studentUrl = PUBLIC_URL || `http://${targetHost}:${clientPort}`;

  try {
    const qrDataUrl = await QRCode.toDataURL(studentUrl, {
      width: 320,
      margin: 2,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    });

    res.json({
      localIp: targetHost,
      clientPort,
      studentUrl,
      qrDataUrl
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate QR Code' });
  }
});

// 커스텀 URL로 QR 코드 생성 API
app.post('/api/generate-qr', async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    const qrDataUrl = await QRCode.toDataURL(url, {
      width: 320,
      margin: 2,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    });
    res.json({ qrDataUrl });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate QR Code' });
  }
});

// SPA 라우팅 지원 (HTML5 History API)
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
    return next();
  }
  res.sendFile(path.join(distPath, 'index.html'), (err) => {
    if (err) {
      // 빌드 전 개발 환경인 경우 간단 안내
      res.send('API Server is running. In development, open Vite server (http://localhost:5173).');
    }
  });
});

// 활성 질문 객체 조회 헬퍼
function getActiveQuestion() {
  if (!state.activeQuestionId) return null;
  return state.questions.find(q => q.id === state.activeQuestionId) || null;
}

// 특정 질문의 집계 및 답변 통계 계산
function getQuestionSummary(questionId) {
  const question = state.questions.find(q => q.id === questionId);
  if (!question) return null;

  const qAnswers = state.answers[questionId] || {};
  const answerEntries = Object.entries(qAnswers).map(([studentId, data]) => ({
    studentId,
    studentName: data.studentName,
    studentIcon: data.studentIcon,
    answer: data.answer,
    updatedAt: data.updatedAt
  }));

  const totalResponses = answerEntries.length;

  if (question.type === 'choice') {
    // 객관식 통계: 각 보기별 카운트 및 퍼센트, 응답 학생 목록
    const optionCounts = {};
    const optionStudents = {};
    (question.options || []).forEach(opt => {
      optionCounts[opt] = 0;
      optionStudents[opt] = [];
    });

    answerEntries.forEach(item => {
      if (optionCounts[item.answer] !== undefined) {
        optionCounts[item.answer]++;
        optionStudents[item.answer].push({
          studentId: item.studentId,
          name: item.studentName,
          icon: item.studentIcon
        });
      }
    });

    return {
      questionId,
      totalResponses,
      optionCounts,
      optionStudents,
      answers: answerEntries
    };
  } else {
    // 주관식 통계: 최신순 답변 리스트
    return {
      questionId,
      totalResponses,
      answers: answerEntries.sort((a, b) => b.updatedAt - a.updatedAt)
    };
  }
}

// 전체 질문별 답변 집계 맵
function getAllQuestionSummaries() {
  const result = {};
  for (const q of state.questions) {
    result[q.id] = getQuestionSummary(q.id);
  }
  return result;
}

// 현재 활성화된 학생 수 계산
function getOnlineStudentCount() {
  let count = 0;
  for (const s of state.students.values()) {
    if (s.connected) count++;
  }
  return count;
}

function closeQuestionIfNoInstructors() {
  if (io.sockets.adapter.rooms.get('room:instructors')?.size || !state.activeQuestionId) return;
  state.activeQuestionId = null;
  io.emit('question:active_changed', {
    activeQuestionId: null,
    activeQuestion: null
  });
}

// Socket.IO 이벤트 처리
io.on('connection', (socket) => {
  let userRole = null; // 'instructor' | 'student'
  let currentStudentId = null;

  // 1. 강의자 인증 및 접속
  socket.on('instructor:auth', ({ password }, callback) => {
    if (password !== INSTRUCTOR_PASSWORD) {
      return callback({ success: false, message: '비밀번호가 일치하지 않습니다.' });
    }

    userRole = 'instructor';
    socket.join('room:instructors');

    const activeQ = getActiveQuestion();
    callback({
      success: true,
      data: {
        questions: state.questions,
        activeQuestionId: state.activeQuestionId,
        activeQuestion: activeQ,
        summaries: getAllQuestionSummaries(),
        onlineStudentsCount: getOnlineStudentCount()
      }
    });
  });

  socket.on('instructor:logout', async (callback) => {
    if (userRole !== 'instructor') {
      return callback?.({ success: false, message: '권한이 없습니다.' });
    }

    userRole = null;
    await socket.leave('room:instructors');
    closeQuestionIfNoInstructors();
    callback?.({ success: true });
  });

  // 2. 학생 인증 및 입장
  socket.on('student:auth', ({ password, studentId }, callback) => {
    if (password !== STUDENT_PASSWORD) {
      return callback({ success: false, message: '비밀번호가 일치하지 않습니다.' });
    }

    userRole = 'student';
    socket.join('room:students');

    // 기존 학생 복원 또는 신규 학생 생성
    let student = null;
    if (studentId && state.students.has(studentId)) {
      student = state.students.get(studentId);
      student.socketId = socket.id;
      student.connected = true;
    } else {
      // 새로운 학생: 중복되지 않는 닉네임 및 아이콘 배정
      const existingNames = new Set(Array.from(state.students.values()).map(s => s.name));
      const char = generateUniqueCharacter(existingNames);
      const newId = 'std_' + Math.random().toString(36).substring(2, 9);
      student = {
        id: newId,
        name: char.name,
        icon: char.icon,
        socketId: socket.id,
        connected: true,
        joinedAt: Date.now()
      };
      state.students.set(newId, student);
    }

    currentStudentId = student.id;

    // 현재 활성화된 질문과 학생의 기존 답변 확인
    const activeQ = getActiveQuestion();
    let myAnswer = null;
    if (activeQ && state.answers[activeQ.id] && state.answers[activeQ.id][student.id]) {
      myAnswer = state.answers[activeQ.id][student.id].answer;
    }

    // 강의자들에게 접속 학생 수 변경 알림
    io.to('room:instructors').emit('students:count', {
      onlineCount: getOnlineStudentCount(),
      totalRegistered: state.students.size
    });

    callback({
      success: true,
      student: {
        id: student.id,
        name: student.name,
        icon: student.icon
      },
      activeQuestion: activeQ,
      myAnswer
    });
  });

  // 2-1. 학생: 현재 질문 및 내 답변 동기화 요청
  socket.on('student:sync_state', (callback) => {
    const activeQ = getActiveQuestion();
    let myAnswer = null;
    if (activeQ && currentStudentId && state.answers[activeQ.id] && state.answers[activeQ.id][currentStudentId]) {
      myAnswer = state.answers[activeQ.id][currentStudentId].answer;
    }
    callback?.({
      activeQuestion: activeQ,
      myAnswer
    });
  });

  // 3. 학생: 답변 제출 및 변경
  socket.on('student:submit_answer', ({ questionId, answer }, callback) => {
    if (userRole !== 'student' || !currentStudentId) {
      return callback?.({ success: false, message: '학생 인증이 필요합니다.' });
    }

    // 현재 질문이 활성화되어 있는지 확인
    if (state.activeQuestionId !== questionId) {
      return callback?.({ success: false, message: '현재 진행 중인 질문이 아니므로 답변을 제출하거나 변경할 수 없습니다.' });
    }

    const student = state.students.get(currentStudentId);
    if (!student) {
      return callback?.({ success: false, message: '학생 정보를 찾을 수 없습니다.' });
    }

    if (!state.answers[questionId]) {
      state.answers[questionId] = {};
    }

    // 답변 저장 또는 갱신 (다음 질문 전까지 계속 변경 가능)
    state.answers[questionId][currentStudentId] = {
      answer,
      studentName: student.name,
      studentIcon: student.icon,
      updatedAt: Date.now()
    };

    // 최신 요약 정보 계산하여 강의자들에게 실시간 브로드캐스트
    const summary = getQuestionSummary(questionId);
    io.to('room:instructors').emit('question:summary_updated', {
      questionId,
      summary
    });

    callback?.({ success: true, answer });
  });

  // 4. 강의자: 새 질문 생성
  socket.on('instructor:create_question', ({ title, type, options, activateImmediately }, callback) => {
    if (userRole !== 'instructor') {
      return callback?.({ success: false, message: '권한이 없습니다.' });
    }

    if (!title || !title.trim()) {
      return callback?.({ success: false, message: '질문 제목을 입력해주세요.' });
    }

    const newQuestion = {
      id: 'q_' + Math.random().toString(36).substring(2, 9),
      title: title.trim(),
      type: type === 'choice' ? 'choice' : 'text',
      options: type === 'choice' ? (options || []).filter(o => o && o.trim()) : [],
      createdAt: Date.now()
    };

    state.questions.unshift(newQuestion);
    state.answers[newQuestion.id] = {};

    if (activateImmediately) {
      state.activeQuestionId = newQuestion.id;
    }

    // 모든 학생 및 강의자에게 상태 전파
    io.emit('questions:list_updated', { questions: state.questions });

    if (activateImmediately) {
      io.emit('question:active_changed', {
        activeQuestionId: state.activeQuestionId,
        activeQuestion: newQuestion
      });
    }

    const summaries = getAllQuestionSummaries();
    io.to('room:instructors').emit('summaries:sync', { summaries });

    callback?.({ success: true, question: newQuestion });
  });

  // 5. 강의자: 질문 활성화 (학생들에게 문제 출제)
  socket.on('instructor:activate_question', ({ questionId }, callback) => {
    if (userRole !== 'instructor') {
      return callback?.({ success: false, message: '권한이 없습니다.' });
    }

    const question = state.questions.find(q => q.id === questionId);
    if (!question) {
      return callback?.({ success: false, message: '존재하지 않는 질문입니다.' });
    }

    state.activeQuestionId = questionId;

    // 학생들에게 새 활성 질문 알림
    io.emit('question:active_changed', {
      activeQuestionId: state.activeQuestionId,
      activeQuestion: question
    });

    callback?.({ success: true });
  });

  // 6. 강의자: 질문 비활성화 (대기 상태 "질문이 없습니다"로 전환)
  socket.on('instructor:deactivate_question', (callback) => {
    if (userRole !== 'instructor') {
      return callback?.({ success: false, message: '권한이 없습니다.' });
    }

    state.activeQuestionId = null;

    io.emit('question:active_changed', {
      activeQuestionId: null,
      activeQuestion: null
    });

    callback?.({ success: true });
  });

  // 7. 강의자: 질문 삭제
  socket.on('instructor:delete_question', ({ questionId }, callback) => {
    if (userRole !== 'instructor') {
      return callback?.({ success: false, message: '권한이 없습니다.' });
    }

    state.questions = state.questions.filter(q => q.id !== questionId);
    delete state.answers[questionId];

    if (state.activeQuestionId === questionId) {
      state.activeQuestionId = null;
      io.emit('question:active_changed', {
        activeQuestionId: null,
        activeQuestion: null
      });
    }

    io.emit('questions:list_updated', { questions: state.questions });

    const summaries = getAllQuestionSummaries();
    io.to('room:instructors').emit('summaries:sync', { summaries });

    callback?.({ success: true });
  });

  // 강의자: 질문과 답변 전체 초기화 (학생 접속 정보는 유지)
  socket.on('instructor:reset_questions', (callback) => {
    if (userRole !== 'instructor') {
      return callback?.({ success: false, message: '권한이 없습니다.' });
    }

    state.questions = [];
    state.answers = {};
    state.activeQuestionId = null;

    io.emit('questions:list_updated', { questions: [] });
    io.emit('question:active_changed', {
      activeQuestionId: null,
      activeQuestion: null
    });
    io.to('room:instructors').emit('summaries:sync', { summaries: {} });

    callback?.({ success: true });
  });

  // 연결 종료 처리
  socket.on('disconnect', () => {
    if (userRole === 'instructor') {
      closeQuestionIfNoInstructors();
    }
    if (userRole === 'student' && currentStudentId) {
      const student = state.students.get(currentStudentId);
      if (student && student.socketId === socket.id) {
        student.connected = false;
        io.to('room:instructors').emit('students:count', {
          onlineCount: getOnlineStudentCount(),
          totalRegistered: state.students.size
        });
      }
    }
  });
});

server.listen(PORT, HOST, () => {
  console.log(`===============================================`);
  console.log(`🚀 강의 소통 서버 시작 완료!`);
  console.log(`- 서버 포트: http://localhost:${PORT}`);
  console.log(`- 로컬 네트워크 IP: ${localIp}`);
  console.log(`- 강사 페이지: ${PUBLIC_URL || `http://localhost:${PORT}`}/instructor`);
  console.log(`- 학생 페이지: ${PUBLIC_URL || `http://${localIp}:5173`}/`);
  console.log(`===============================================`);
});
