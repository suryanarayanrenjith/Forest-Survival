const MobileWarning = () => {
  return (
    <div className="fixed inset-0 bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 flex items-center justify-center z-[9999] p-6">
      <div className="max-w-md text-center space-y-6">
        {/* Icon */}
        <div className="text-8xl mb-4 animate-bounce">
          💻
        </div>

        {/* Title */}
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-4">
          Desktop Required
        </h1>

        {/* Message */}
        <div className="space-y-4 text-gray-300 text-base md:text-lg">
          <p>
            This game requires a desktop or laptop computer with a keyboard and mouse for the best experience.
          </p>

          <div className="bg-black bg-opacity-40 backdrop-blur-sm rounded-lg p-4 border border-blue-500">
            <p className="text-blue-400 font-semibold mb-2">Minimum Requirements:</p>
            <ul className="text-sm text-left space-y-1">
              <li>• Desktop or Laptop Computer</li>
              <li>• Physical Keyboard</li>
              <li>• Mouse or Trackpad</li>
              <li>• Modern Web Browser</li>
              <li>• Screen width: 1024px or larger</li>
            </ul>
          </div>

          <p className="text-sm text-gray-400 mt-4">
            Mobile support is not available at this time.
          </p>
        </div>

        {/* Decorative Elements */}
        <div className="flex justify-center gap-4 mt-6 text-4xl opacity-50">
          <span>⌨️</span>
          <span>🖱️</span>
          <span>🎮</span>
        </div>
      </div>
    </div>
  );
};

export default MobileWarning;
