import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let readable = 'حدث خطأ غير متوقع في الاتصال بقاعدة البيانات أو عرض الصفحة.';
    try {
      const parsed = JSON.parse(error.message) as { error?: string; operationType?: string };
      if (parsed?.error) {
        if (parsed.error.includes('Quota exceeded')) {
          readable = 'تم بلوغ الحد اليومي المجاني لقراءة قاعدة البيانات، وسيُعاد ضبطه تلقائيًا في اليوم التالي.';
        } else if (parsed.error.includes('permission') || parsed.error.includes('PERMISSION_DENIED')) {
          readable = 'ليست لديك صلاحية كافية لتنفيذ هذه العملية. تأكد من تسجيل الدخول بالحساب الصحيح.';
        } else {
          readable = parsed.error;
        }
      }
    } catch {
      if (error.message && error.message.length < 220) {
        readable = error.message;
      }
    }
    return { hasError: true, message: readable };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          dir="rtl"
          className="min-h-screen w-full game-pattern-bg flex items-center justify-center p-4"
        >
          <div className="shannes-panel max-w-md w-full p-6 text-center space-y-4">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-[#FFE5E7] border-2 border-[#1F112E] flex items-center justify-center">
              <AlertTriangle className="w-7 h-7 text-[#DC2626]" />
            </div>
            <h1 className="font-display font-black text-xl text-[#1F112E]">
              حدث عطل مؤقت
            </h1>
            <p className="text-sm font-bold text-[#1F112E]/75 leading-relaxed">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false, message: '' });
                window.location.reload();
              }}
              className="game-btn-purple px-6 py-2.5 rounded-xl font-display font-black text-sm inline-flex items-center gap-2 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>إعادة تحميل الصفحة</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
