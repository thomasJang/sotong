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

  // 전체 초기화 검증은 격리된 로컬 서버에서만 명시적으로 실행합니다.
  if (process.env.TEST_RESET_QUESTIONS === '1') {
    const observer = await connect();
    assert.equal((await emit(observer, 'instructor:reset_questions')).success, false);
    assert.equal((await emit(observer, 'instructor:auth', { password: instructorPassword })).success, true);
    const choice = await emit(instructor, 'instructor:create_question', {
      title: 'Reset choice fixture', type: 'choice', options: ['A', 'B'], activateImmediately: true
    });
    assert.equal(choice.success, true);
    assert.equal((await emit(student1, 'student:submit_answer', { questionId: choice.question.id, answer: 'A' })).success, true);
    const text = await emit(instructor, 'instructor:create_question', {
      title: 'Reset text fixture', type: 'text', activateImmediately: true
    });
    assert.equal(text.success, true);
    assert.equal((await emit(student2, 'student:submit_answer', { questionId: text.question.id, answer: 'Remove this answer' })).success, true);
    assert.equal((await emit(student1, 'instructor:reset_questions')).success, false);
    const beforeReset = await emit(observer, 'instructor:auth', { password: instructorPassword });
    assert.ok(beforeReset.data.questions.some(q => q.id === choice.question.id));
    assert.equal(beforeReset.data.activeQuestionId, text.question.id);

    const updates = [instructor, observer].flatMap(socket => [
      event(socket, 'questions:list_updated', data => data.questions.length === 0),
      event(socket, 'summaries:sync', data => Object.keys(data.summaries).length === 0),
      event(socket, 'question:active_changed', data => data.activeQuestionId === null && data.activeQuestion === null)
    ]);
    updates.push(...[student1, student2].map(socket => event(socket, 'question:active_changed', data => data.activeQuestion === null)));
    assert.equal((await emit(instructor, 'instructor:reset_questions')).success, true);
    await Promise.all(updates);
    const afterReset = await emit(observer, 'instructor:auth', { password: instructorPassword });
    assert.deepEqual(afterReset.data.questions, []);
    assert.deepEqual(afterReset.data.summaries, {});
    assert.equal(afterReset.data.activeQuestionId, null);
    assert.equal(afterReset.data.onlineStudentsCount, 2);
    assert.deepEqual(await emit(student2, 'student:sync_state'), { activeQuestion: null, myAnswer: null });
    assert.equal((await emit(student2, 'student:submit_answer', { questionId: text.question.id, answer: 'Late answer' })).success, false);
    assert.equal((await emit(instructor, 'instructor:activate_question', { questionId: choice.question.id })).success, false);
    const restored = await emit(student1, 'student:auth', { password: studentPassword, studentId: s1.student.id });
    assert.deepEqual(restored.student, s1.student);
    assert.equal((await emit(instructor, 'instructor:reset_questions')).success, true);

    const reused = await emit(instructor, 'instructor:create_question', {
      title: 'New session question', type: 'text', activateImmediately: true
    });
    assert.equal(reused.success, true);
    questionId = reused.question.id;
    assert.equal((await emit(student1, 'student:submit_answer', { questionId, answer: 'Works after reset' })).success, true);
    assert.equal((await emit(instructor, 'instructor:delete_question', { questionId })).success, true);
    questionId = null;
    console.log('RESET_VERIFIED: permissions, all questions/answers, all clients, student sessions and reuse');

    const session = await emit(instructor, 'instructor:create_question', {
      title: 'Instructor departure fixture', type: 'text', activateImmediately: true
    });
    assert.equal(session.success, true);
    questionId = session.question.id;
    assert.equal((await emit(student1, 'student:submit_answer', { questionId, answer: 'Keep this answer' })).success, true);
    assert.equal((await emit(student1, 'instructor:logout')).success, false);
    assert.equal((await emit(instructor, 'instructor:logout')).success, true);
    assert.equal((await emit(student1, 'student:sync_state')).activeQuestion.id, questionId);
    assert.equal((await emit(instructor, 'instructor:create_question', { title: 'Logged out' })).success, false);

    const disconnected = event(student1, 'question:active_changed', data => data.activeQuestion === null);
    observer.disconnect();
    await disconnected;
    assert.equal((await emit(student1, 'student:submit_answer', { questionId, answer: 'Too late' })).success, false);
    const returnLogin = await emit(instructor, 'instructor:auth', { password: instructorPassword });
    assert.equal(returnLogin.data.activeQuestionId, null);
    assert.equal(returnLogin.data.summaries[questionId].totalResponses, 1);
    assert.equal(returnLogin.data.summaries[questionId].answers[0].answer, 'Keep this answer');
    assert.equal((await emit(instructor, 'instructor:activate_question', { questionId })).success, true);
    const ended = event(student2, 'question:active_changed', data => data.activeQuestion === null);
    assert.equal((await emit(instructor, 'instructor:logout')).success, true);
    await ended;
    assert.equal((await emit(student2, 'student:sync_state')).activeQuestion, null);
    assert.equal((await emit(instructor, 'instructor:logout')).success, false);
    assert.equal((await emit(instructor, 'instructor:auth', { password: instructorPassword })).success, true);
    assert.equal((await emit(instructor, 'instructor:delete_question', { questionId })).success, true);
    questionId = null;
    console.log('DEPARTURE_VERIFIED: last instructor logout/disconnect closes questions, other instructors and answers preserved');
  }
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
