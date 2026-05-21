import { Monitor, Keyboard, Mouse, Gamepad2 } from 'lucide-react';

const MobileWarning = () => {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-6 bg-[#05080a]">
      <div className="max-w-md w-full text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl border border-sky-500/30 bg-sky-500/10 mb-6">
          <Monitor className="w-10 h-10 text-sky-400" strokeWidth={1.75} />
        </div>

        <h1 className="text-3xl font-bold text-white mb-3">Desktop Required</h1>
        <p className="text-gray-400 text-sm leading-relaxed mb-6">
          Forest Survival is built for keyboard &amp; mouse. Please open it on a desktop or
          laptop for the intended experience.
        </p>

        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-left">
          <p className="text-[11px] font-semibold tracking-[0.15em] text-gray-500 uppercase mb-2.5">
            Requirements
          </p>
          <ul className="space-y-1.5 text-sm text-gray-300">
            <li className="flex items-center gap-2"><Monitor className="w-4 h-4 text-gray-500" strokeWidth={2} /> Desktop or laptop · 1024px+ screen</li>
            <li className="flex items-center gap-2"><Keyboard className="w-4 h-4 text-gray-500" strokeWidth={2} /> Physical keyboard</li>
            <li className="flex items-center gap-2"><Mouse className="w-4 h-4 text-gray-500" strokeWidth={2} /> Mouse or trackpad</li>
            <li className="flex items-center gap-2"><Gamepad2 className="w-4 h-4 text-gray-500" strokeWidth={2} /> A modern web browser</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default MobileWarning;
