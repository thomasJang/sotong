import assert from 'node:assert/strict';
import { io } from 'socket.io-client';

const serverUrl = process.env.SERVER_URL || 'http://localhost:3001';
const instructorPassword = process.env.INSTRUCTOR_PASSWORD || '1937';
const studentPassword = process.env.STUDENT_PASSWORD || '1234';
const sockets = [];
let questionId;
let instructor;
const deadline = setTimeout(() => {
  console.error('Interaction test timed out');
  process.exit(1);
}, 25000);

function connect() {
  const socket = io(serverUrl, { transports: ['websocket'], reconnection: false });
  sockets.push(socket);
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}
function emit(socket, event, ...args) {
  return socket.timeout(5000).emitWithAck(event, ...args);
}
function event(socket, name, predicate = () => true) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { socket.off(name, handler); reject(new Error(`Missing ${name}`)); }, 5000);
    function handler(data) {
      if (!predicate(data)) return;
      clearTimeout(timeout);
      socket.off(name, handler);
      resolve(data);
    }
    socket.on(name, handler);
  });
}
async function run() {
  const infoRes = await fetch(`${serverUrl}/api/server-info`);
  assert.equal(infoRes.status, 200);
  const info = await infoRes.json();
  assert.ok(info.qrDataUrl.startsWith('data:image/png;base64,'));
  if (process.env.EXPECTED_PUBLIC_URL) assert.equal(info.studentUrl, process.env.EXPECTED_PUBLIC_URL);
  console.log('API and QR passed');

  instructor = await connect();
  assert.equal((await emit(instructor, 'instructor:auth', { password: `${instructorPassword}-invalid` })).success, false);
  const login = await emit(instructor, 'instructor:auth', { password: instructorPassword });
  assert.equal(login.success, true);
  const student1 = await connect();
  const student2 = await connect();
  assert.equal((await emit(student1, 'student:auth', { password: `${studentPassword}-invalid` })).success, false);
  const s1 = await emit(student1, 'student:auth', { password: studentPassword });
  const s2 = await emit(student2, 'student:auth', { password: studentPassword });
  assert.equal(s1.success, true);
  assert.equal(s2.success, true);
  assert.notEqual(s1.student.name, s2.student.name);
  assert.equal((await emit(student1, 'instructor:create_question', { title: 'unauthorized' })).success, false);
  console.log('WebSocket authentication, roles and distinct nicknames passed');

  const arrival = event(student1, 'question:active_changed', d => d.activeQuestion?.title === 'Deployment verification');
  const created = await emit(instructor, 'instructor:create_question', {
    title: 'Deployment verification', type: 'choice', options: ['JavaScript', 'Python', 'Go'], activateImmediately: true
  });
  assert.equal(created.success, true);
  questionId = created.question.id;
  assert.equal((await arrival).activeQuestion.id, questionId);
  assert.equal((await emit(student1, 'student:submit_answer', { questionId, answer: 'JavaScript' })).success, true);
  assert.equal((await emit(student2, 'student:submit_answer', { questionId, answer: 'Python' })).success, true);
  const summaryEvent = event(instructor, 'question:summary_updated', d => d.questionId === questionId && d.summary.optionCounts.Go === 1);
  assert.equal((await emit(student1, 'student:submit_answer', { questionId, answer: 'Go' })).success, true);
  const { summary } = await summaryEvent;
  assert.equal(summary.totalResponses, 2);
  assert.equal(summary.optionCounts.Go, 1);
  assert.equal(summary.optionCounts.Python, 1);
  assert.equal(summary.optionCounts.JavaScript, 0);
  assert.equal((await emit(student1, 'student:sync_state')).myAnswer, 'Go');
  console.log('Question delivery, answer edits and live totals passed');

  const closed = event(student1, 'question:active_changed', d => d.activeQuestion === null);
  assert.equal((await emit(instructor, 'instructor:deactivate_question')).success, true);
  await closed;
  assert.equal((await emit(student1, 'student:submit_answer', { questionId, answer: 'Go' })).success, false);
  assert.equal((await emit(instructor, 'instructor:delete_question', { questionId })).success, true);
  questionId = null;
  console.log('Question closure, rejected late answers and cleanup passed');
  console.log('INTERACTION_VERIFIED');
}
try {
  await run();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  if (questionId && instructor?.connected) {
    await emit(instructor, 'instructor:delete_question', { questionId }).catch(() => {});
  }
  sockets.forEach(socket => socket.disconnect());
  clearTimeout(deadline);
}
