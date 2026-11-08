import React, { useState, useEffect, useRef } from 'react';
import { socket } from '../socket';
import {
  Users, QrCode, PlusCircle, Play, Square, Trash2,
  CheckCircle, MessageSquare, ListFilter, BarChart3,
  Lock, AlertCircle, Sparkles, ExternalLink, RefreshCw, X
} from 'lucide-react';
import QRModal from './QRModal';

export default function InstructorView() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  // 상태 데이터
  const [questions, setQuestions] = useState([]);
  const [activeQuestionId, setActiveQuestionId] = useState(null);
  const [summaries, setSummaries] = useState({});
  const [onlineStudentsCount, setOnlineStudentsCount] = useState(0);

  // 현재 대시보드에서 조회 중인 질문 ID (기본은 활성 질문 또는 첫 번째 질문)
  const [selectedQuestionId, setSelectedQuestionId] = useState(null);

  // 모달 및 폼 상태
  const [isQrOpen, setIsQrOpen] = useState(false);
  const [isNewQuestionOpen, setIsNewQuestionOpen] = useState(false);
  const [isResettingQuestions, setIsResettingQuestions] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [resetError, setResetError] = useState('');
  const resetDialogRef = useRef(null);
  const authAttemptRef = useRef(0);
  const logoutPendingRef = useRef(false);

  useEffect(() => {
    if (isResetConfirmOpen) resetDialogRef.current?.showModal();
    else resetDialogRef.current?.close();
  }, [isResetConfirmOpen]);

  // 새 질문 작성 폼 필드
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState('choice'); // 'choice' | 'text'
  const [newOptions, setNewOptions] = useState(['예', '아니요']);
  const [activateImmediately, setActivateImmediately] = useState(true);

  // 접속 초기화 및 소켓 리스너
  useEffect(() => {
    const restoreAuthentication = () => {
      if (logoutPendingRef.current) return;
      const savedPw = localStorage.getItem('instructor_pw');
      if (savedPw) attemptAuth(savedPw);
      else setIsAuthenticated(false);
    };
    const handleDisconnect = () => {
      authAttemptRef.current++;
      setIsAuthenticated(false);
      setIsAuthLoading(false);
      setIsQrOpen(false);
      setIsNewQuestionOpen(false);
      setIsResetConfirmOpen(false);
    };

    // 소켓 이벤트 리스너 등록
    const handleActiveChanged = ({ activeQuestionId: id }) => {
      setActiveQuestionId(id);
      if (id) {
        setSelectedQuestionId(id);
      }
    };

    const handleListUpdated = ({ questions: list }) => {
      setQuestions(list);
      setSelectedQuestionId(previous => (
        list.some(question => question.id === previous) ? previous : (list[0]?.id || null)
      ));
    };

    const handleSummaryUpdated = ({ questionId, summary }) => {
      setSummaries(prev => ({
        ...prev,
        [questionId]: summary
      }));
    };

    const handleSummariesSync = ({ summaries: allSummaries }) => {
      setSummaries(allSummaries);
    };

    const handleStudentsCount = ({ onlineCount }) => {
      setOnlineStudentsCount(onlineCount);
    };

    socket.on('question:active_changed', handleActiveChanged);
    socket.on('questions:list_updated', handleListUpdated);
    socket.on('question:summary_updated', handleSummaryUpdated);
    socket.on('summaries:sync', handleSummariesSync);
    socket.on('students:count', handleStudentsCount);
    socket.on('connect', restoreAuthentication);
    socket.on('disconnect', handleDisconnect);
    if (socket.connected) restoreAuthentication();

    return () => {
      socket.off('question:active_changed', handleActiveChanged);
      socket.off('questions:list_updated', handleListUpdated);
      socket.off('question:summary_updated', handleSummaryUpdated);
      socket.off('summaries:sync', handleSummariesSync);
      socket.off('students:count', handleStudentsCount);
      socket.off('connect', restoreAuthentication);
      socket.off('disconnect', handleDisconnect);
    };
  }, []);

  const attemptAuth = (pw) => {
    const attemptId = ++authAttemptRef.current;
    setIsAuthLoading(true);
    setErrorMsg('');

    socket.timeout(8000).emit('instructor:auth', { password: pw }, (error, res) => {
      if (attemptId !== authAttemptRef.current) return;
      setIsAuthLoading(false);
      if (error) {
        setErrorMsg('서버 연결을 확인한 뒤 다시 시도해주세요.');
        return;
      }
      if (res.success) {
        setIsAuthenticated(true);
        localStorage.setItem('instructor_pw', pw);

        setQuestions(res.data.questions || []);
        setActiveQuestionId(res.data.activeQuestionId);
        setSelectedQuestionId(res.data.activeQuestionId || (res.data.questions?.[0]?.id || null));
        setSummaries(res.data.summaries || {});
        setOnlineStudentsCount(res.data.onlineStudentsCount || 0);
      } else {
        setErrorMsg(res.message || '비밀번호가 올바르지 않습니다.');
      }
    });
  };

  const handlePasswordSubmit = (e) => {
    e.preventDefault();
    attemptAuth(password);
  };

  const handleLogout = () => {
    if (isLoggingOut) return;
    authAttemptRef.current++;
    const finishLogout = () => {
      setIsAuthLoading(false);
      localStorage.removeItem('instructor_pw');
      setIsAuthenticated(false);
      setPassword('');
      setIsQrOpen(false);
      setIsNewQuestionOpen(false);
      setIsResetConfirmOpen(false);
    };
    if (!socket.connected) {
      finishLogout();
      return;
    }

    setIsLoggingOut(true);
    logoutPendingRef.current = true;
    socket.volatile.timeout(5000).emit('instructor:logout', (error, res) => {
      logoutPendingRef.current = false;
      setIsLoggingOut(false);
      if (error || !res?.success) {
        alert(res?.message || '종료 결과를 확인하지 못했습니다. 연결 상태를 확인해주세요.');
        return;
      }
      finishLogout();
    });
  };

  // 새 질문 모달 열기
  const handleOpenNewQuestion = () => {
    setNewTitle('');
    setNewType('choice');
    setNewOptions(['예', '아니요']);
    setActivateImmediately(true);
    setIsNewQuestionOpen(true);
  };

  // 새 질문 등록
  const handleCreateQuestion = (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    socket.emit(
      'instructor:create_question',
      {
        title: newTitle.trim(),
        type: newType,
        options: newType === 'choice' ? newOptions.filter(o => o.trim()) : [],
        activateImmediately
      },
      (res) => {
        if (res.success) {
          setIsNewQuestionOpen(false);
          setNewTitle('');
          setNewOptions(['예', '아니요']);
          setSelectedQuestionId(res.question.id);
        } else {
          alert(res.message || '질문 등록 실패');
        }
      }
    );
  };

  // 질문 활성화 (출제 시작)
  const handleActivateQuestion = (id) => {
    socket.emit('instructor:activate_question', { questionId: id }, (res) => {
      if (!res.success) alert(res.message);
    });
  };

  // 질문 비활성화 (대기 상태)
  const handleDeactivateQuestion = () => {
    socket.emit('instructor:deactivate_question', (res) => {
      if (!res.success) alert(res.message);
    });
  };

  // 질문 삭제
  const handleDeleteQuestion = (id) => {
    if (!window.confirm('정말 이 질문을 삭제하시겠습니까? 관련 답변 데이터도 함께 삭제됩니다.')) return;
    socket.emit('instructor:delete_question', { questionId: id }, (res) => {
      if (!res.success) alert(res.message);
    });
  };

  const handleResetQuestions = () => {
    if (isResettingQuestions || questions.length === 0) return;
    setResetError('');
    setIsResetConfirmOpen(true);
  };

  const handleConfirmReset = () => {
    if (isResettingQuestions) return;
    if (!socket.connected) {
      setResetError('서버 연결을 확인한 뒤 다시 시도해주세요.');
      return;
    }

    setResetError('');
    setIsResettingQuestions(true);
    socket.volatile.timeout(5000).emit('instructor:reset_questions', (error, res) => {
      setIsResettingQuestions(false);
      if (error || !res?.success) {
        setResetError(res?.message || '초기화 결과를 확인하지 못했습니다. 연결 상태를 확인해주세요.');
        return;
      }
      setIsResetConfirmOpen(false);
    });
  };

  // 선택지 추가/제거
  const handleAddOption = () => {
    setNewOptions([...newOptions, `보기 ${newOptions.length + 1}`]);
  };

  const handleRemoveOption = (index) => {
    if (newOptions.length <= 2) {
      alert('객관식 보기는 최소 2개 이상이어야 합니다.');
      return;
    }
    setNewOptions(newOptions.filter((_, idx) => idx !== index));
  };

  const handleOptionChange = (index, value) => {
    const updated = [...newOptions];
    updated[index] = value;
    setNewOptions(updated);
  };

  // 로그인 화면
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-8 border border-slate-100 flex flex-col items-center">
          <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center text-3xl mb-4 text-white shadow-lg shadow-indigo-300">
            🎙️
          </div>
          <h1 className="text-2xl font-bold text-slate-800 mb-1">강의자 대시보드</h1>
          <p className="text-sm text-slate-500 mb-6 text-center">
            강의 진행을 위한 비밀번호를 입력해주세요.
          </p>

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
              disabled={isAuthLoading || !password}
              className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold rounded-2xl shadow-lg shadow-indigo-200 transition active-press text-base"
            >
              {isAuthLoading ? '인증 확인 중...' : '강의자 모드로 입장'}
            </button>
          </form>

          <div className="mt-8 pt-4 border-t border-slate-100 w-full text-center">
            <a
              href="/"
              className="text-xs text-slate-400 hover:text-indigo-600 transition"
            >
              ← 학생 참여 페이지로 이동
            </a>
          </div>
        </div>
      </div>
    );
  }

  const selectedQuestion = questions.find(q => q.id === selectedQuestionId) || questions[0];
  const selectedSummary = selectedQuestion ? summaries[selectedQuestion.id] : null;
  const isSelectedActive = selectedQuestion && activeQuestionId === selectedQuestion.id;

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans">
      {/* 글로벌 탑 네비게이션 */}
      <header className="bg-slate-900 text-white sticky top-0 z-30 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-lg font-bold shadow">
              🎓
            </div>
            <div>
              <h1 className="text-base font-bold leading-tight">강의 소통 대시보드</h1>
              <span className="text-[11px] text-slate-400">실시간 인터랙티브 세션</span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* 접속 학생 수 뱃지 */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 rounded-xl border border-slate-700 text-xs font-medium">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <Users className="w-3.5 h-3.5 text-slate-400" />
              <span>접속 학생: <b className="text-emerald-400">{onlineStudentsCount}</b>명</span>
            </div>

            {/* QR코드 모달 열기 버튼 */}
            <button
              onClick={() => setIsQrOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs sm:text-sm font-semibold shadow transition"
            >
              <QrCode className="w-4 h-4" />
              <span>학생 참여 QR</span>
            </button>

            {/* 로그아웃 버튼 */}
            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="text-xs text-slate-400 hover:text-white px-2 py-1.5 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isLoggingOut ? '종료 중...' : '종료'}
            </button>
          </div>
        </div>
      </header>

      {/* 본문 레이아웃: 2열 구조 */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* 좌측 패널: 질문 목록 및 제어 (lg:col-span-4) */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <ListFilter className="w-5 h-5 text-indigo-600" />
                <h2 className="font-bold text-slate-800 text-base">질문 목록</h2>
                <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-semibold">
                  {questions.length}개
                </span>
              </div>
              <button
                onClick={handleOpenNewQuestion}
                className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg transition"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                새 질문
              </button>
            </div>

            {/* 질문 리스트 */}
            <div className="space-y-2.5 overflow-y-auto max-h-[calc(100vh-280px)] pr-1">
              {questions.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-xs">
                  등록된 질문이 없습니다.<br />새 질문을 등록해보세요!
                </div>
              ) : (
                questions.map((q, idx) => {
                  const isActive = activeQuestionId === q.id;
                  const isSelected = selectedQuestionId === q.id;
                  const summary = summaries[q.id];
                  const resCount = summary?.totalResponses || 0;

                  return (
                    <div
                      key={q.id}
                      onClick={() => setSelectedQuestionId(q.id)}
                      className={`p-3.5 rounded-xl border transition cursor-pointer relative ${
                        isSelected
                          ? 'border-indigo-500 bg-indigo-50/40 shadow-sm'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[11px] px-2 py-0.5 rounded-md font-bold ${
                            q.type === 'choice'
                              ? 'bg-sky-100 text-sky-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}>
                            {q.type === 'choice' ? '객관식' : '주관식'}
                          </span>
                          {isActive && (
                            <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md font-bold bg-rose-500 text-white animate-pulse">
                              <span className="w-1.5 h-1.5 rounded-full bg-white"></span>
                              진행중
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-400">
                          응답 <b>{resCount}</b>명
                        </span>
                      </div>

                      <h3 className="font-semibold text-slate-800 text-sm line-clamp-2 leading-snug">
                        {idx + 1}. {q.title}
                      </h3>

                      {/* 액션 버튼 */}
                      <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
                        {isActive ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeactivateQuestion();
                            }}
                            className="flex items-center gap-1 text-rose-600 hover:text-rose-700 font-semibold px-2 py-1 rounded hover:bg-rose-50 transition"
                          >
                            <Square className="w-3.5 h-3.5" />
                            진행 종료
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleActivateQuestion(q.id);
                            }}
                            className="flex items-center gap-1 text-indigo-600 hover:text-indigo-700 font-semibold px-2 py-1 rounded hover:bg-indigo-50 transition"
                          >
                            <Play className="w-3.5 h-3.5 fill-current" />
                            질문 시작
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteQuestion(q.id);
                          }}
                          className="text-slate-400 hover:text-rose-500 p-1 rounded hover:bg-slate-100 transition"
                          title="질문 삭제"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <div className="mt-4 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={handleResetQuestions}
                disabled={questions.length === 0 || isResettingQuestions}
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-semibold text-rose-600 hover:bg-rose-100 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-4 h-4" />
                {isResettingQuestions ? '초기화 중...' : '질문 모두 초기화'}
              </button>
            </div>
          </div>
        </div>

        {/* 우측 패널: 선택된 질문의 실시간 답변 분석 및 현황 (lg:col-span-8) */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          {selectedQuestion ? (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col min-h-[500px]">
              {/* 상단 컨트롤 바 */}
              <div className="pb-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${
                      selectedQuestion.type === 'choice'
                        ? 'bg-sky-100 text-sky-800'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}>
                      {selectedQuestion.type === 'choice' ? '객관식 투표' : '주관식 피드백'}
                    </span>
                    {isSelectedActive ? (
                      <span className="flex items-center gap-1.5 text-xs px-2.5 py-0.5 rounded-full font-bold bg-rose-100 text-rose-700">
                        <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
                        현재 학생들에게 출제 중
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">대기/마감 상태</span>
                    )}
                  </div>
                  <h2 className="text-xl font-extrabold text-slate-900 leading-tight">
                    {selectedQuestion.title}
                  </h2>
                </div>

                {/* 질문 상태 제어 버튼 */}
                <div className="flex items-center gap-2">
                  {isSelectedActive ? (
                    <button
                      onClick={handleDeactivateQuestion}
                      className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 shadow transition active-press"
                    >
                      <Square className="w-4 h-4 fill-white" />
                      <span>질문 닫기 (대기 화면으로)</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => handleActivateQuestion(selectedQuestion.id)}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 shadow transition active-press"
                    >
                      <Play className="w-4 h-4 fill-white" />
                      <span>이 질문 시작하기</span>
                    </button>
                  )}
                </div>
              </div>

              {/* 통계 요약 뱃지 */}
              <div className="py-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <div className="text-xs text-slate-500 font-medium">총 응답 수</div>
                  <div className="text-2xl font-black text-indigo-600 mt-0.5">
                    {selectedSummary?.totalResponses || 0}
                    <span className="text-xs font-normal text-slate-500 ml-1">명</span>
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <div className="text-xs text-slate-500 font-medium">접속 학생 대비 응답률</div>
                  <div className="text-2xl font-black text-emerald-600 mt-0.5">
                    {onlineStudentsCount > 0
                      ? Math.round(((selectedSummary?.totalResponses || 0) / onlineStudentsCount) * 100)
                      : 0}%
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 col-span-2 sm:col-span-1">
                  <div className="text-xs text-slate-500 font-medium">실시간 동기화</div>
                  <div className="text-sm font-bold text-slate-700 mt-1 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    수정 즉시 반영됨
                  </div>
                </div>
              </div>

              {/* 답변 상세 렌더링 */}
              <div className="flex-1 mt-2">
                {selectedQuestion.type === 'choice' ? (
                  // 1. 객관식 차트 & 응답자 목록
                  <div className="space-y-4">
                    <h3 className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
                      <BarChart3 className="w-4 h-4 text-indigo-500" />
                      선택지별 응답 현황
                    </h3>

                    <div className="space-y-3">
                      {selectedQuestion.options?.map((option, idx) => {
                        const count = selectedSummary?.optionCounts?.[option] || 0;
                        const total = selectedSummary?.totalResponses || 0;
                        const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
                        const voters = selectedSummary?.optionStudents?.[option] || [];

                        return (
                          <div
                            key={idx}
                            className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/50 hover:bg-slate-50 transition"
                          >
                            <div className="flex items-center justify-between text-sm font-semibold mb-2">
                              <div className="flex items-center gap-2">
                                <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center">
                                  {idx + 1}
                                </span>
                                <span className="text-slate-800">{option}</span>
                              </div>
                              <div className="text-right">
                                <span className="text-base font-extrabold text-indigo-600">{count}명</span>
                                <span className="text-xs text-slate-400 ml-1.5">({percentage}%)</span>
                              </div>
                            </div>

                            {/* 프로그레스 바 */}
                            <div className="w-full bg-slate-200 h-3 rounded-full overflow-hidden">
                              <div
                                className="bg-indigo-600 h-full rounded-full transition-all duration-500 ease-out"
                                style={{ width: `${percentage}%` }}
                              ></div>
                            </div>

                            {/* 선택한 학생들 태그 */}
                            {voters.length > 0 && (
                              <div className="mt-2.5 pt-2 border-t border-slate-200/60 flex flex-wrap gap-1.5 items-center">
                                <span className="text-[11px] text-slate-400 font-medium mr-1">응답자:</span>
                                {voters.map((v) => (
                                  <span
                                    key={v.studentId}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-700 text-[11px] shadow-2xs"
                                  >
                                    <span>{v.icon}</span>
                                    <span>{v.name}</span>
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  // 2. 주관식 답변 카드 리스트
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
                      <MessageSquare className="w-4 h-4 text-emerald-500" />
                      학생들이 작성한 주관식 답변 ({selectedSummary?.answers?.length || 0})
                    </h3>

                    {(!selectedSummary?.answers || selectedSummary.answers.length === 0) ? (
                      <div className="py-12 text-center text-slate-400 text-sm border-2 border-dashed border-slate-200 rounded-2xl">
                        아직 제출된 답변이 없습니다.<br />
                        학생들이 답변을 입력하면 이곳에 실시간으로 표시됩니다.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[460px] overflow-y-auto pr-1">
                        {selectedSummary.answers.map((item, idx) => (
                          <div
                            key={idx}
                            className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm hover:shadow transition flex flex-col justify-between"
                          >
                            <div className="text-slate-800 text-sm whitespace-pre-wrap leading-relaxed font-medium mb-3">
                              "{item.answer}"
                            </div>
                            <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs text-slate-500">
                              <div className="flex items-center gap-1.5 font-semibold text-slate-700">
                                <span className="text-base">{item.studentIcon}</span>
                                <span>{item.studentName}</span>
                              </div>
                              <span className="text-[11px] text-slate-400">
                                {new Date(item.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center text-slate-400 flex flex-col items-center justify-center">
              <Sparkles className="w-10 h-10 text-slate-300 mb-2" />
              <p>좌측에서 질문을 선택하거나 새 질문을 등록하세요.</p>
            </div>
          )}
        </div>
      </div>

      {/* 새 질문 등록 모달 */}
      {isNewQuestionOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-100">
            <div className="px-6 py-4 bg-indigo-600 text-white flex items-center justify-between">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <PlusCircle className="w-5 h-5" />
                새 질문 만들기
              </h3>
              <button
                onClick={() => setIsNewQuestionOpen(false)}
                className="p-1 rounded-full hover:bg-white/20 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateQuestion} className="p-6 space-y-4">
              {/* 질문 유형 선택 */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  질문 유형
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewType('choice')}
                    className={`py-2.5 px-4 rounded-xl border text-sm font-bold flex items-center justify-center gap-2 transition ${
                      newType === 'choice'
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <span>📊 객관식 (투표형)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewType('text')}
                    className={`py-2.5 px-4 rounded-xl border text-sm font-bold flex items-center justify-center gap-2 transition ${
                      newType === 'text'
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <span>💬 주관식 (자유 의견)</span>
                  </button>
                </div>
              </div>

              {/* 질문 제목 입력 */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  질문 내용
                </label>
                <input
                  type="text"
                  required
                  placeholder="예: 오늘 강의 내용 중 가장 이해가 잘 안 된 부분은?"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white text-sm"
                />
              </div>

              {/* 객관식 보기 입력 */}
              {newType === 'choice' && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-slate-700">
                      보기 목록 (최소 2개)
                    </label>
                    <button
                      type="button"
                      onClick={handleAddOption}
                      className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold"
                    >
                      + 보기 추가
                    </button>
                  </div>

                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {newOptions.map((opt, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-500 text-xs font-bold flex items-center justify-center flex-shrink-0">
                          {idx + 1}
                        </span>
                        <input
                          type="text"
                          required
                          value={opt}
                          onChange={(e) => handleOptionChange(idx, e.target.value)}
                          placeholder={`선택지 ${idx + 1}`}
                          className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                        />
                        {newOptions.length > 2 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveOption(idx)}
                            className="p-1 text-slate-400 hover:text-rose-500 rounded"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 등록 즉시 학생들에게 출제할지 여부 */}
              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={activateImmediately}
                    onChange={(e) => setActivateImmediately(e.target.checked)}
                    className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                  />
                  <span className="text-xs text-slate-700 font-medium">
                    등록하자마자 바로 학생들에게 질문 보내기 (출제 시작)
                  </span>
                </label>
              </div>

              {/* 액션 버튼 */}
              <div className="pt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsNewQuestionOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-semibold text-sm hover:bg-slate-50 transition"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm shadow transition"
                >
                  등록하기
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <dialog
        ref={resetDialogRef}
        aria-labelledby="reset-questions-title"
        aria-describedby="reset-questions-description"
        onCancel={(event) => {
          if (isResettingQuestions) event.preventDefault();
        }}
        onClose={() => setIsResetConfirmOpen(false)}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-slate-200 p-6 shadow-2xl backdrop:bg-slate-900/60 backdrop:backdrop-blur-sm"
      >
        <h2 id="reset-questions-title" className="text-lg font-bold text-slate-900">질문을 모두 초기화할까요?</h2>
        <p id="reset-questions-description" className="mt-3 text-sm leading-relaxed text-slate-600">
          등록된 질문과 모든 학생의 응답이 삭제됩니다. 진행 중인 질문도 종료되며 삭제한 내용은 복구할 수 없습니다.
          학생 접속은 유지됩니다.
        </p>
        {resetError && <p role="alert" className="mt-3 text-sm text-rose-600">{resetError}</p>}
        <div className="mt-6 flex gap-2">
          <button
            type="button"
            autoFocus
            onClick={() => setIsResetConfirmOpen(false)}
            disabled={isResettingQuestions}
            className="flex-1 rounded-xl border border-slate-300 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleConfirmReset}
            disabled={isResettingQuestions}
            className="flex-1 rounded-xl bg-rose-600 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-40"
          >
            {isResettingQuestions ? '초기화 중...' : '모두 삭제하고 초기화'}
          </button>
        </div>
      </dialog>

      {/* QR코드 모달 */}
      <QRModal isOpen={isQrOpen} onClose={() => setIsQrOpen(false)} />
    </div>
  );
}
