import React, { useState, useEffect, useRef } from 'react';
import { socket } from '../socket';
import { Sparkles, MessageCircle, Send, CheckCircle2, RefreshCw, Lock, AlertCircle, Clock } from 'lucide-react';
import confetti from 'canvas-confetti';

export default function StudentView() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);
  const [sessionNotice, setSessionNotice] = useState('');
  const authAttemptRef = useRef(0);

  // 학생 정보 (로컬 스토리지에 캐싱)
  const [student, setStudent] = useState(() => {
    const saved = localStorage.getItem('student_profile');
    return saved ? JSON.parse(saved) : null;
  });

  // 현재 활성화된 질문
  const [activeQuestion, setActiveQuestion] = useState(null);
  // 내가 제출한 답변
  const [myAnswer, setMyAnswer] = useState('');
  // 주관식 입력 텍스트 버퍼
  const [textInput, setTextInput] = useState('');
  // 답변 전송/변경 상태
  const [isSubmittingAnswer, setIsSubmittingAnswer] = useState(false);
  const [lastSavedNotice, setLastSavedNotice] = useState(null);

  // 접속 초기화
  useEffect(() => {
    const restoreAuthentication = () => {
      const savedPw = localStorage.getItem('student_pw');
      if (savedPw) attemptAuth(savedPw, { restoreSession: true });
      else clearAuthentication();
    };
    const handleSessionEnded = () => {
      clearAuthentication('강의가 종료되었습니다. 다시 입장하려면 비밀번호를 입력해주세요.');
    };
    const handleDisconnect = () => {
      authAttemptRef.current++;
      setIsAuthenticated(false);
      setIsSubmittingAuth(false);
      setIsSubmittingAnswer(false);
    };

    // 소켓 이벤트 수신
    const handleActiveChanged = ({ activeQuestion: question }) => {
      setActiveQuestion(question);
      if (question) {
        // 내 기존 답변이 있는지 동기화
        const attemptId = authAttemptRef.current;
        socket.emit('student:sync_state', (res) => {
          if (attemptId !== authAttemptRef.current) return;
          if (res?.myAnswer !== undefined && res?.myAnswer !== null) {
            setMyAnswer(res.myAnswer);
            setTextInput(res.myAnswer);
          } else {
            setMyAnswer('');
            setTextInput('');
          }
        });
      } else {
        setMyAnswer('');
        setTextInput('');
      }
    };

    socket.on('question:active_changed', handleActiveChanged);
    socket.on('students:session_ended', handleSessionEnded);
    socket.on('connect', restoreAuthentication);
    socket.on('disconnect', handleDisconnect);
    if (socket.connected) restoreAuthentication();

    return () => {
      socket.off('question:active_changed', handleActiveChanged);
      socket.off('students:session_ended', handleSessionEnded);
      socket.off('connect', restoreAuthentication);
      socket.off('disconnect', handleDisconnect);
    };
  }, []);

  // 인증 요청 함수
  const attemptAuth = (pw, { restoreSession = false } = {}) => {
    const attemptId = ++authAttemptRef.current;
    setIsSubmittingAuth(true);
    setErrorMsg('');

    let currentStudentId = null;
    try {
      currentStudentId = JSON.parse(localStorage.getItem('student_profile'))?.id || null;
    } catch {
      localStorage.removeItem('student_profile');
    }

    socket.timeout(8000).emit('student:auth', {
      password: pw,
      studentId: currentStudentId,
      restoreSession,
      sessionId: localStorage.getItem('student_session_id')
    }, (error, res) => {
      if (attemptId !== authAttemptRef.current) return;
      setIsSubmittingAuth(false);
      if (error) {
        setErrorMsg('서버 연결을 확인한 뒤 다시 시도해주세요.');
        return;
      }
      if (res.success) {
        setIsAuthenticated(true);
        setSessionNotice('');
        setStudent(res.student);
        localStorage.setItem('student_pw', pw);
        localStorage.setItem('student_profile', JSON.stringify(res.student));
        localStorage.setItem('student_session_id', res.sessionId);

        setActiveQuestion(res.activeQuestion);
        setMyAnswer(res.myAnswer ?? '');
        setTextInput(res.myAnswer ?? '');
      } else {
        if (restoreSession || res.sessionEnded) {
          clearAuthentication(res.message || '다시 입장해주세요.');
          return;
        }
        setErrorMsg(res.message || '비밀번호가 올바르지 않습니다.');
      }
    });
  };

  const handlePasswordSubmit = (e) => {
    e.preventDefault();
    attemptAuth(password);
  };

  const clearAuthentication = (notice = '') => {
    authAttemptRef.current++;
    localStorage.removeItem('student_pw');
    localStorage.removeItem('student_session_id');
    setIsAuthenticated(false);
    setIsSubmittingAuth(false);
    setIsSubmittingAnswer(false);
    setPassword('');
    setActiveQuestion(null);
    setMyAnswer('');
    setTextInput('');
    setLastSavedNotice(null);
    setErrorMsg('');
    setSessionNotice(notice);
  };

  const handleLogout = () => {
    socket.volatile.emit('student:logout');
    clearAuthentication();
  };

  // 답변 제출 및 변경 처리
  const handleSubmitAnswer = (answerValue) => {
    if (!activeQuestion || !answerValue || !answerValue.toString().trim()) return;

    setIsSubmittingAnswer(true);
    const attemptId = authAttemptRef.current;
    socket.emit(
      'student:submit_answer',
      {
        questionId: activeQuestion.id,
        answer: answerValue
      },
      (res) => {
        if (attemptId !== authAttemptRef.current) return;
        setIsSubmittingAnswer(false);
        if (res?.success) {
          const isChange = myAnswer && myAnswer !== answerValue;
          setMyAnswer(answerValue);
          setLastSavedNotice(isChange ? '답변이 성공적으로 변경되었습니다! 👍' : '답변이 제출되었습니다! 🎉');

          // 폭죽 효과 (첫 제출 시)
          if (!isChange) {
            confetti({
              particleCount: 50,
              spread: 60,
              origin: { y: 0.8 },
              colors: ['#4f46e5', '#06b6d4', '#10b981']
            });
          }

          setTimeout(() => {
            setLastSavedNotice(null);
          }, 3500);
        } else {
          alert(res?.message || '답변 제출에 실패했습니다.');
        }
      }
    );
  };

  // 비밀번호 입력 화면
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-sky-50 to-emerald-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white rounded-3xl shadow-xl p-8 border border-slate-100 flex flex-col items-center">
          <div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center text-3xl mb-4 shadow-inner">
            🎓
          </div>
          <h1 className="text-2xl font-bold text-slate-800 mb-1">강의 소통 참여하기</h1>
          <p className="text-sm text-slate-500 mb-6 text-center">
            강의자가 안내한 학생 입장 비밀번호를<br />입력해 주세요.
          </p>

          {sessionNotice && <p role="status" className="mb-4 text-sm text-indigo-700 text-center">{sessionNotice}</p>}

          <form onSubmit={handlePasswordSubmit} className="w-full space-y-4">
            <div>
              <div className="relative">
                <input
                  type="password"
                  inputMode="numeric"
                  placeholder="비밀번호 입력"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white text-center font-mono text-lg tracking-wider"
                  autoFocus
                />
                <Lock className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
              </div>
              {errorMsg && (
                <div className="mt-2 text-xs text-rose-500 flex items-center justify-center gap-1 font-medium">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {errorMsg}
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmittingAuth || !password}
              className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold rounded-2xl shadow-lg shadow-indigo-200 transition active-press text-base"
            >
              {isSubmittingAuth ? '입장 확인 중...' : '입장하기'}
            </button>
          </form>

          <div className="mt-8 pt-4 border-t border-slate-100 w-full text-center">
            <a
              href="/instructor"
              className="text-xs text-slate-400 hover:text-indigo-600 transition"
            >
              강의자 페이지로 이동 →
            </a>
          </div>
        </div>
      </div>
    );
  }

  // 입장 후 학생 본 화면
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col max-w-lg mx-auto shadow-2xl bg-white min-h-[100dvh]">
      {/* 상단 프로필 헤더 */}
      <header className="px-5 py-3.5 bg-white border-b border-slate-100 sticky top-0 z-20 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-2xl shadow-sm">
            {student?.icon || '🐾'}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-slate-800 text-sm">{student?.name || '익명 참여자'}</span>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            </div>
            <p className="text-[11px] text-slate-400">익명 소통 중</p>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="text-xs text-slate-400 hover:text-slate-600 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition"
        >
          나가기
        </button>
      </header>

      {/* 상태 알림 토스트 (답변 저장/수정 완료 시) */}
      {lastSavedNotice && (
        <div className="mx-4 mt-3 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center gap-2 shadow-sm animate-bounce">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span className="font-medium">{lastSavedNotice}</span>
        </div>
      )}

      {/* 메인 컨텐츠 영역 */}
      <main className="flex-1 p-5 flex flex-col justify-center">
        {!activeQuestion ? (
          // 상태 1: 강의자의 질문이 없을 때
          <div className="flex flex-col items-center justify-center text-center py-12 px-4">
            <div className="relative mb-6">
              <div className="w-28 h-28 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-5xl shadow-inner animate-pulse-subtle">
                ⏳
              </div>
              <div className="absolute -bottom-1 -right-1 bg-white p-2 rounded-full shadow border border-slate-100 text-indigo-600">
                <Sparkles className="w-5 h-5" />
              </div>
            </div>

            <h2 className="text-xl font-bold text-slate-800 mb-2">
              질문이 없습니다
            </h2>
            <p className="text-sm text-slate-500 max-w-xs leading-relaxed mb-6">
              강의자가 질문을 올릴 때까지 잠시만 기다려주세요.<br />
              질문이 등록되면 화면이 자동으로 바뀝니다!
            </p>

            <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-slate-100 text-slate-600 text-xs font-medium">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-500" />
              <span>실시간 연결 대기 중</span>
            </div>
          </div>
        ) : (
          // 상태 2: 강의자의 질문이 있을 때
          <div className="flex flex-col h-full justify-between space-y-6">
            {/* 질문 카드 */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-700 font-bold text-xs">
                  {activeQuestion.type === 'choice' ? '객관식 질문' : '주관식 질문'}
                </span>
                <span className="text-xs text-slate-400 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  다음 질문 전까지 변경 가능
                </span>
              </div>

              <h2 className="text-xl font-extrabold text-slate-900 leading-snug">
                {activeQuestion.title}
              </h2>

              {myAnswer && (
                <div className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 text-xs rounded-lg border border-emerald-200 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>답변 제출 완료 (언제든 변경 가능)</span>
                </div>
              )}
            </div>

            {/* 객관식 화면 */}
            {activeQuestion.type === 'choice' && (
              <div className="space-y-3 flex-1 flex flex-col justify-center my-4">
                {activeQuestion.options?.map((option, idx) => {
                  const isSelected = myAnswer === option;
                  return (
                    <button
                      key={idx}
                      type="button"
                      disabled={isSubmittingAnswer}
                      onClick={() => handleSubmitAnswer(option)}
                      className={`w-full p-4 rounded-2xl border-2 text-left font-medium text-base transition-all duration-150 flex items-center justify-between active-press ${
                        isSelected
                          ? 'border-indigo-600 bg-indigo-50/70 text-indigo-900 shadow-md ring-2 ring-indigo-500/20'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 shadow-sm'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                            isSelected
                              ? 'bg-indigo-600 text-white'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {idx + 1}
                        </span>
                        <span className="leading-relaxed">{option}</span>
                      </div>

                      {isSelected && (
                        <CheckCircle2 className="w-5 h-5 text-indigo-600 flex-shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* 주관식 화면 */}
            {activeQuestion.type === 'text' && (
              <div className="space-y-4 flex-1 flex flex-col justify-center my-4">
                <div className="relative">
                  <textarea
                    rows={5}
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    placeholder="자유롭게 여러분의 생각을 작성해주세요..."
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white text-base resize-none shadow-inner"
                  />
                  <div className="absolute bottom-3 right-3 text-xs text-slate-400">
                    {textInput.length}자
                  </div>
                </div>

                <button
                  type="button"
                  disabled={isSubmittingAnswer || !textInput.trim() || textInput.trim() === myAnswer}
                  onClick={() => handleSubmitAnswer(textInput.trim())}
                  className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-bold rounded-2xl shadow-lg shadow-indigo-200 transition flex items-center justify-center gap-2 active-press text-base"
                >
                  <Send className="w-4 h-4" />
                  <span>
                    {myAnswer ? (textInput.trim() === myAnswer ? '현재 저장된 답변' : '답변 변경하여 다시 제출') : '답변 제출하기'}
                  </span>
                </button>
              </div>
            )}

            {/* 풋터 안내 */}
            <div className="text-center text-xs text-slate-400 pb-2">
              💡 질문이 바뀌기 전까지 원하는 만큼 답변을 바꿀 수 있습니다.
            </div>
          </div>
        )}
      </main>

      {/* 테스트 편의용 하단 바로가기 링크 */}
      <footer className="py-2.5 px-4 bg-slate-50 border-t border-slate-100 text-center">
        <a
          href="/instructor"
          className="text-[11px] text-slate-400 hover:text-indigo-600 transition"
        >
          강의자 페이지 열기
        </a>
      </footer>
    </div>
  );
}
