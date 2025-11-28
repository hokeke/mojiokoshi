import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, Square, FileText, Wand2, Scissors, Copy, Trash2, Check, AlertCircle, Sparkles, ChevronDown, Settings, X } from 'lucide-react';

export default function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimText, setInterimText] = useState('');
  const [processedText, setProcessedText] = useState('');
  const [summary, setSummary] = useState('');
  const [activeTab, setActiveTab] = useState('raw');
  const [isProcessing, setIsProcessing] = useState(false);
  const [copyStatus, setCopyStatus] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [summaryStyle, setSummaryStyle] = useState('summary');
  const [audioLevel, setAudioLevel] = useState(0);

  // API Key管理用のステート
  const [apiKey, setApiKey] = useState('');
  const [showSettings, setShowSettings] = useState(false);

  const recognitionRef = useRef(null);
  const isRecordingRef = useRef(false);
  const retryCountRef = useRef(0);

  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const dataArrayRef = useRef(null);
  const sourceRef = useRef(null);
  const animationFrameRef = useRef(null);

  // 初期化時にローカルストレージからAPIキーを読み込む
  useEffect(() => {
    const savedKey = localStorage.getItem('gemini_api_key');
    if (savedKey) setApiKey(savedKey);
  }, []);

  // APIキーを保存する関数
  const handleSaveApiKey = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const key = formData.get('apiKey');
    setApiKey(key);
    localStorage.setItem('gemini_api_key', key);
    setShowSettings(false);
    setErrorMsg('');
  };

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  // --- Visualizer & Recognition Logic (省略なしで維持) ---
  const startVisualizer = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      sourceRef.current = audioContextRef.current.createMediaStreamSource(stream);
      sourceRef.current.connect(analyserRef.current);

      const bufferLength = analyserRef.current.frequencyBinCount;
      dataArrayRef.current = new Uint8Array(bufferLength);

      const updateVisualizer = () => {
        if (!analyserRef.current || !isRecordingRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArrayRef.current);
        let sum = 0;
        const count = Math.floor(bufferLength / 4);
        for (let i = 0; i < count; i++) sum += dataArrayRef.current[i];
        const average = sum / count;
        setAudioLevel(Math.min(100, average * 1.5));
        animationFrameRef.current = requestAnimationFrame(updateVisualizer);
      };
      updateVisualizer();
    } catch (err) {
      console.warn("Visualizer init failed:", err);
    }
  };

  const stopVisualizer = () => {
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (sourceRef.current) {
      if (sourceRef.current.mediaStream) sourceRef.current.mediaStream.getTracks().forEach(t => t.stop());
      sourceRef.current.disconnect();
    }
    if (audioContextRef.current) audioContextRef.current.close();
    audioContextRef.current = null;
    analyserRef.current = null;
    sourceRef.current = null;
    setAudioLevel(0);
  };

  const startRecognition = useCallback(() => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      setErrorMsg('このブラウザは音声認識をサポートしていません。Google Chromeをご利用ください。');
      return;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch (e) { }
      recognitionRef.current = null;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'ja-JP';

    recognition.onresult = (event) => {
      if (retryCountRef.current > 0) {
        retryCountRef.current = 0;
        setErrorMsg('');
      }
      let interimTranscript = '';
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript;
        else interimTranscript += event.results[i][0].transcript;
      }
      if (finalTranscript) {
        let text = finalTranscript.trim();
        if (text && !/[、。！？]$/.test(text)) text += '。';
        setTranscript((prev) => prev + text);
      }
      setInterimText(interimTranscript);
    };

    recognition.onerror = (event) => {
      if (event.error === 'not-allowed') {
        setErrorMsg('マイクの使用が許可されていません。');
        setIsRecording(false);
        stopVisualizer();
      } else if (event.error === 'network') {
        setErrorMsg('ネットワークが不安定です。再接続中...');
      }
    };

    recognition.onend = () => {
      setInterimText('');
      if (isRecordingRef.current) {
        const delay = Math.min(1000 * Math.pow(2, retryCountRef.current), 8000);
        if (retryCountRef.current >= 5) {
          setIsRecording(false);
          stopVisualizer();
          setErrorMsg('接続エラーが続いたため停止しました。');
          retryCountRef.current = 0;
          return;
        }
        retryCountRef.current += 1;
        setTimeout(() => { if (isRecordingRef.current) startRecognition(); }, delay);
      } else {
        retryCountRef.current = 0;
        stopVisualizer();
      }
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
      setErrorMsg('');
      startVisualizer();
    } catch (e) {
      setErrorMsg('音声認識を開始できませんでした。');
      setIsRecording(false);
      stopVisualizer();
    }
  }, []);

  const toggleRecording = () => {
    if (isRecording) {
      setIsRecording(false);
      setInterimText('');
      retryCountRef.current = 0;
      if (recognitionRef.current) recognitionRef.current.stop();
      stopVisualizer();
    } else {
      setIsRecording(true);
      setErrorMsg('');
      retryCountRef.current = 0;
      startRecognition();
    }
  };

  useEffect(() => {
    return () => {
      if (recognitionRef.current) recognitionRef.current.abort();
      stopVisualizer();
    };
  }, []);

  const clearAll = () => {
    if (window.confirm('すべてのテキストを消去しますか？')) {
      setTranscript('');
      setInterimText('');
      setProcessedText('');
      setSummary('');
      setActiveTab('raw');
    }
  };

  // Gemini API呼び出し関数（修正版：StateのapiKeyを使用）
  const callGemini = async (promptText) => {
    if (!apiKey) {
      setShowSettings(true);
      throw new Error("APIキーが設定されていません");
    }

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] }),
        }
      );

      if (!response.ok) {
        if (response.status === 400 || response.status === 403) {
          setErrorMsg("APIキーが無効か、権限がありません。設定を確認してください。");
        }
        throw new Error(`API Error: ${response.status}`);
      }

      const data = await response.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || "AIからの応答がありませんでした。";
    } catch (error) {
      console.error("Gemini API Error:", error);
      throw error;
    }
  };

  const handleFormat = async () => {
    if (!transcript) return;
    if (!apiKey) { setShowSettings(true); return; }

    setIsProcessing(true);
    setErrorMsg('');
    try {
      const prompt = `あなたは優秀な日本語の校正者です。以下のテキスト（音声認識結果）を、誤字脱字・誤変換を推測して修正し、フィラーを削除して、読みやすい「です・ます」調の自然なビジネス文書に整形してください。\n\nテキスト:\n${transcript}`;
      const result = await callGemini(prompt);
      setProcessedText(result);
      setActiveTab('formatted');
    } catch (error) {
      if (!error.message.includes("APIキー")) {
        setErrorMsg('AI処理に失敗しました。');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSummarize = async () => {
    if (!transcript) return;
    if (!apiKey) { setShowSettings(true); return; }

    setIsProcessing(true);
    setErrorMsg('');
    try {
      let stylePrompt = '';
      if (summaryStyle === 'detail') stylePrompt = '詳細に分析し、文脈や論理構成を含めて丁寧に解説してください。';
      else if (summaryStyle === 'minutes') stylePrompt = '会議の議事録として、【概要】【主な議題】【決定事項】【ネクストアクション】の形式でまとめてください。';
      else stylePrompt = '概要を1〜2行で述べ、重要なポイントを箇条書きで3〜5点挙げてください。';

      const prompt = `以下のテキストを要約してください。\n${stylePrompt}\n\nテキスト:\n${transcript}`;
      const result = await callGemini(prompt);
      setSummary(result);
      setActiveTab('summary');
    } catch (error) {
      if (!error.message.includes("APIキー")) {
        setErrorMsg('要約処理に失敗しました。');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const copyToClipboard = (text) => {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    setCopyStatus('copied');
    setTimeout(() => setCopyStatus(null), 2000);
  };

  const getCurrentText = () => {
    switch (activeTab) {
      case 'formatted': return processedText;
      case 'summary': return summary;
      default: return transcript + (isRecording && activeTab === 'raw' ? interimText : '');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans selection:bg-indigo-100 relative">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 p-2 rounded-lg text-white">
              <Mic size={20} />
            </div>
            <h1 className="font-bold text-xl tracking-tight text-slate-800 hidden sm:block">AI Transcription Note</h1>
            <h1 className="font-bold text-xl tracking-tight text-slate-800 sm:hidden">AI Note</h1>
          </div>
          <div className="flex items-center gap-3">
            {/* API Key Settings Button */}
            <button
              onClick={() => setShowSettings(true)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${apiKey ? 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100' : 'bg-amber-100 text-amber-800 hover:bg-amber-200 animate-pulse'
                }`}
            >
              <Settings size={16} />
              {apiKey ? '設定済み' : 'API設定'}
            </button>
          </div>
        </div>
      </header>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-fadeIn">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Settings size={18} className="text-slate-500" />
                APIキーの設定
              </h3>
              <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <div className="p-6">
              <p className="text-sm text-slate-600 mb-4 leading-relaxed">
                Gemini APIを利用するために、Google AI Studioで取得したAPIキーを入力してください。<br />
                <span className="text-xs text-slate-400">※キーはブラウザ内にのみ保存され、外部に送信されることはありません。</span>
              </p>
              <form onSubmit={handleSaveApiKey} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Gemini API Key</label>
                  <input
                    type="password"
                    name="apiKey"
                    defaultValue={apiKey}
                    placeholder="AIzaSy..."
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/50 font-mono text-sm"
                    autoFocus
                  />
                </div>
                <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-xl transition-colors">
                  保存して閉じる
                </button>
              </form>
              <div className="mt-4 pt-4 border-t border-slate-100 text-center">
                <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 hover:underline flex items-center justify-center gap-1">
                  APIキーを無料で取得する <Sparkles size={12} />
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      <main className="max-w-5xl mx-auto px-4 py-6 md:py-8 space-y-6">
        {errorMsg && (
          <div className="bg-red-50 text-red-600 p-4 rounded-lg flex items-center gap-3 border border-red-100">
            <AlertCircle size={20} className="shrink-0" />
            <p className="text-sm font-medium">{errorMsg}</p>
          </div>
        )}

        {/* Control Bar */}
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 w-full md:w-auto">
            <button
              onClick={toggleRecording}
              className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold transition-all duration-200 shadow-sm overflow-hidden relative ${isRecording
                  ? 'bg-red-50 text-red-600 border-2 border-red-100'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200 hover:shadow-indigo-300'
                }`}
            >
              {isRecording && (
                <div className="absolute bottom-0 left-0 right-0 bg-red-100 transition-all duration-75 ease-out opacity-30 pointer-events-none"
                  style={{ height: `${Math.max(0, audioLevel)}%` }}
                />
              )}
              <div className="relative flex items-center gap-2 z-10">
                {isRecording ? <><Square size={20} fill="currentColor" /><span>停止</span></> : <><Mic size={20} /><span>録音開始</span></>}
              </div>
            </button>
            {isRecording && (
              <div className="flex items-center gap-2 px-2 h-10 rounded-lg bg-slate-50 border border-slate-100">
                <div className="flex items-end gap-1 h-4 w-6 justify-center">
                  <div className="w-1 bg-red-400 rounded-full transition-all duration-75" style={{ height: `${Math.max(20, audioLevel * 0.5)}%` }}></div>
                  <div className="w-1 bg-red-500 rounded-full transition-all duration-75" style={{ height: `${Math.max(30, audioLevel * 0.8)}%` }}></div>
                  <div className="w-1 bg-red-400 rounded-full transition-all duration-75" style={{ height: `${Math.max(20, audioLevel * 0.6)}%` }}></div>
                </div>
                <span className="text-sm font-medium text-slate-500 animate-pulse hidden sm:inline">聞いています...</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
            <button
              onClick={handleFormat}
              disabled={!transcript || isProcessing}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 hover:bg-indigo-50 hover:border-indigo-200 text-slate-700 hover:text-indigo-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              <Scissors size={16} />
              Geminiで整形
            </button>
            <div className="flex items-center bg-white border border-slate-200 rounded-lg overflow-hidden h-10">
              <div className="relative h-full">
                <select
                  value={summaryStyle}
                  onChange={(e) => setSummaryStyle(e.target.value)}
                  className="appearance-none h-full pl-3 pr-8 bg-transparent text-sm font-medium text-slate-700 focus:outline-none focus:bg-slate-50 cursor-pointer border-r border-slate-200"
                  disabled={isProcessing}
                >
                  <option value="summary">概要</option>
                  <option value="detail">詳細</option>
                  <option value="minutes">議事録</option>
                </select>
                <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
              <button
                onClick={handleSummarize}
                disabled={!transcript || isProcessing}
                className="h-full px-4 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
              >
                <Wand2 size={16} />
                要約
              </button>
            </div>
            <div className="w-px h-8 bg-slate-200 mx-1 hidden md:block"></div>
            <button
              onClick={clearAll}
              className="flex items-center gap-2 px-4 py-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors ml-auto md:ml-0"
              title="全消去"
            >
              <Trash2 size={18} />
            </button>
          </div>
        </div>

        {/* Main Editor */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-[60vh] md:h-[600px] relative">
          <div className="flex border-b border-slate-100 bg-slate-50/50 overflow-x-auto">
            <button
              onClick={() => setActiveTab('raw')}
              className={`flex items-center gap-2 px-6 py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'raw' ? 'border-indigo-600 text-indigo-600 bg-white' : 'border-transparent text-slate-500 hover:bg-slate-100'}`}
            >
              <FileText size={16} />
              原文 <span className="ml-1 bg-slate-100 px-1.5 rounded-full text-xs">{transcript.length + interimText.length}</span>
            </button>
            <button
              onClick={() => { if (!processedText && transcript && !isProcessing) handleFormat(); setActiveTab('formatted'); }}
              className={`flex items-center gap-2 px-6 py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'formatted' ? 'border-indigo-600 text-indigo-600 bg-white' : 'border-transparent text-slate-500 hover:bg-slate-100'}`}
            >
              <Scissors size={16} />
              整形 {processedText && <span className="ml-1 text-xs bg-indigo-50 text-indigo-600 px-1.5 rounded-full">AI</span>}
            </button>
            <button
              onClick={() => { if (!summary && transcript && !isProcessing) handleSummarize(); setActiveTab('summary'); }}
              className={`flex items-center gap-2 px-6 py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'summary' ? 'border-indigo-600 text-indigo-600 bg-white' : 'border-transparent text-slate-500 hover:bg-slate-100'}`}
            >
              <Wand2 size={16} />
              要約 {summary && <span className="ml-1 text-xs bg-indigo-50 text-indigo-600 px-1.5 rounded-full">AI</span>}
            </button>
          </div>

          <div className="flex-1 relative group">
            {isProcessing && (
              <div className="absolute inset-0 bg-white/90 backdrop-blur-sm z-30 flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                  <div className="w-10 h-10 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
                  <span className="text-sm font-bold text-slate-600">Gemini思考中...</span>
                </div>
              </div>
            )}
            <textarea
              value={getCurrentText()}
              onChange={(e) => {
                const val = e.target.value;
                if (activeTab === 'formatted') setProcessedText(val);
                else if (activeTab === 'summary') setSummary(val);
                else setTranscript(val);
              }}
              placeholder={isRecording ? "音声を聞き取っています..." : "ここに文字起こしテキストが表示されます。"}
              className="w-full h-full p-6 resize-none focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-50/50 text-lg leading-relaxed text-slate-700 bg-transparent font-sans"
            />
            {isRecording && activeTab === 'raw' && interimText && (
              <div className="absolute bottom-6 left-6 right-6 pointer-events-none z-10">
                <div className="bg-indigo-50/90 text-indigo-600 px-3 py-2 rounded-lg text-sm inline-flex items-center gap-2 shadow-sm border border-indigo-100 backdrop-blur-sm">
                  <span>認識中: </span><span className="font-medium">{interimText}</span>
                </div>
              </div>
            )}
            <div className="absolute bottom-4 right-4 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => copyToClipboard(getCurrentText())}
                className="flex items-center gap-1.5 px-3 py-2 bg-white shadow-md border border-slate-100 rounded-lg text-sm font-medium text-slate-600 hover:text-indigo-600"
              >
                {copyStatus === 'copied' ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
                {copyStatus === 'copied' ? '完了' : 'コピー'}
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}