import React, { useState, useEffect } from 'react';
import { X, Copy, Check, ExternalLink, QrCode } from 'lucide-react';
import QRCode from 'qrcode';

export default function QRModal({ isOpen, onClose }) {
  const [studentUrl, setStudentUrl] = useState('');
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen) return;

    // 기본 URL 계산: 현재 브라우저의 호스트 정보 기반
    const currentOrigin = window.location.origin;
    const defaultStudentUrl = `${currentOrigin}/`;

    // 서버 정보 조회 시도
    fetch('/api/server-info')
      .then(res => res.json())
      .then(data => {
        // 만약 현재 브라우저가 localhost로 접속 중이고, 서버가 로컬 네트워크 IP를 알고 있다면
        // 학생이 모바일로 접속할 수 있도록 서버의 로컬 IP URL을 기본으로 제안
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
          const mobileUrl = `http://${data.localIp}:${window.location.port || '5173'}/`;
          setStudentUrl(mobileUrl);
          generateQR(mobileUrl);
        } else {
          setStudentUrl(defaultStudentUrl);
          generateQR(defaultStudentUrl);
        }
      })
      .catch(() => {
        setStudentUrl(defaultStudentUrl);
        generateQR(defaultStudentUrl);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [isOpen]);

  const generateQR = async (url) => {
    try {
      const dataUrl = await QRCode.toDataURL(url, {
        width: 380,
        margin: 2,
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
      });
      setQrCodeUrl(dataUrl);
    } catch (e) {
      console.error(e);
    }
  };

  const handleUrlChange = (e) => {
    const newUrl = e.target.value;
    setStudentUrl(newUrl);
    if (newUrl.trim()) {
      generateQR(newUrl.trim());
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(studentUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-100 flex flex-col">
        {/* 헤더 */}
        <div className="px-6 py-4 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <QrCode className="w-6 h-6 text-indigo-200" />
            <h3 className="font-bold text-lg">학생 접속용 QR 코드</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/20 transition-colors text-white/90 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 바디 */}
        <div className="p-6 flex flex-col items-center text-center">
          <p className="text-sm text-slate-600 mb-4">
            스마트폰 카메라로 아래 QR 코드를 스캔하면<br />
            학생 참여 화면으로 바로 이동합니다.
          </p>

          <div className="p-3 bg-white border-2 border-dashed border-indigo-200 rounded-2xl shadow-inner mb-4 flex items-center justify-center">
            {qrCodeUrl ? (
              <img
                src={qrCodeUrl}
                alt="학생 접속용 QR코드"
                className="w-64 h-64 rounded-xl object-contain"
              />
            ) : (
              <div className="w-64 h-64 flex items-center justify-center text-slate-400">
                QR 코드 생성 중...
              </div>
            )}
          </div>

          <div className="w-full bg-slate-50 p-3 rounded-xl border border-slate-200 mb-4 text-left">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span className="font-medium">접속 URL</span>
              <span className="text-indigo-600 font-semibold">비밀번호: 1234</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={studentUrl}
                onChange={handleUrlChange}
                className="flex-1 bg-white border border-slate-300 px-3 py-2 text-xs rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
              />
              <button
                onClick={handleCopy}
                className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg flex items-center gap-1 transition-colors whitespace-nowrap"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? '복사됨' : '복사'}
              </button>
            </div>
          </div>

          <div className="flex gap-2 w-full">
            <a
              href={studentUrl}
              target="_blank"
              rel="noreferrer"
              className="flex-1 py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 font-medium text-sm flex items-center justify-center gap-1.5 hover:bg-slate-100 transition-colors"
            >
              <ExternalLink className="w-4 h-4 text-slate-500" />
              새 탭에서 학생 페이지 열기
            </a>
            <button
              onClick={onClose}
              className="py-2.5 px-6 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-medium text-sm transition-colors"
            >
              닫기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
