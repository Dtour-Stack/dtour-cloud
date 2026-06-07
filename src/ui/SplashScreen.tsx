export function SplashScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a]">
      <div className="flex flex-col items-center gap-3">
        <img
          src="/brand/dtour/logo.svg"
          alt="Dtour"
          className="splash-pulse h-12 w-12"
        />
        <p className="text-sm text-white/30">Loading the cloud...</p>
      </div>
    </div>
  );
}
