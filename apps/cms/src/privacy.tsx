import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { LightRays } from "./components/LightRays";
import { Button } from "@ilm/ui";
import { Shield, Lock, Eye, Database } from "lucide-react";

export function PrivacyPage({ onConnectGitHub }: { readonly onConnectGitHub: () => void }) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [activeSection, setActiveSection] = useState("core-philosophy");

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);

      const sections = ["core-philosophy", "github-data", "ai-providers", "analytics"];
      const scrollPosition = window.scrollY + 200;

      for (const section of sections) {
        const el = document.getElementById(section);
        if (el) {
          const top = el.offsetTop;
          const height = el.offsetHeight;
          if (scrollPosition >= top && scrollPosition < top + height) {
            setActiveSection(section);
            break;
          }
        }
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
      setActiveSection(id);
    }
  };

  return (
    <div className="bg-black text-white min-h-screen font-sans selection:bg-cyan-500/30">
      {/* Background LightRays */}
      <div className="fixed inset-0 pointer-events-none opacity-40 z-0">
        <LightRays
          raysOrigin="bottom-right"
          raysColor="#0ea5e9"
          raysSpeed={1.0}
          lightSpread={0.9}
          rayLength={1.8}
          followMouse={false}
          mouseInfluence={0.1}
          noiseAmount={0.08}
          distortion={0.05}
        />
      </div>

      {/* Navbar */}
      <div className="fixed top-0 left-0 right-0 z-50 flex justify-center pt-6 px-4">
        <nav
          className={`transition-all duration-300 rounded-full px-4 md:px-6 py-3 flex items-center justify-between w-full max-w-5xl ${isScrolled ? "glass-nav shadow-[0_8px_32px_rgba(0,0,0,0.5)] border border-white/10" : "bg-transparent border border-transparent"}`}
        >
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-cyan-400 to-purple-500 flex items-center justify-center font-bold text-black shadow-lg">
              Ilm
            </div>
            <Link to="/" className="font-semibold tracking-tight text-white">
              Ilm
            </Link>
          </div>
          <div className="hidden md:flex items-center gap-8 text-xs font-semibold tracking-wide uppercase text-zinc-400">
            <Link to="/" className="hover:text-white transition-colors">
              Home
            </Link>
            <Link to="/docs" className="hover:text-white transition-colors">
              Documentation
            </Link>
            <a
              href="https://github.com/ij-roy/Ilm"
              target="_blank"
              rel="noreferrer"
              className="hover:text-white transition-colors flex items-center gap-2"
            >
              <GithubIcon className="w-4 h-4" /> Open Source
            </a>
          </div>
          <div>
            <Button
              onClick={onConnectGitHub}
              className="bg-white text-black hover:bg-zinc-200 h-9 px-5 py-0 text-xs uppercase tracking-wide font-bold rounded-full shadow-[0_0_15px_rgba(255,255,255,0.2)]"
            >
              Get Started
            </Button>
          </div>
        </nav>
      </div>

      {/* Main Container */}
      <div className="max-w-6xl mx-auto px-6 pt-32 pb-24 relative z-10 flex flex-col lg:flex-row gap-12">
        {/* Sidebar */}
        <aside className="lg:w-64 flex-shrink-0 lg:sticky lg:top-32 h-fit">
          <div className="glass-card border border-white/10 rounded-2xl p-6 space-y-6">
            <h3 className="text-sm font-semibold tracking-wider uppercase text-zinc-400 flex items-center gap-2">
              <Shield className="w-4 h-4 text-cyan-400" /> Privacy Sections
            </h3>
            <ul className="space-y-3 text-sm">
              <li>
                <button
                  onClick={() => scrollToSection("core-philosophy")}
                  className={`w-full text-left transition-colors font-medium ${activeSection === "core-philosophy" ? "text-cyan-400" : "text-zinc-400 hover:text-white"}`}
                >
                  Core Philosophy
                </button>
              </li>
              <li>
                <button
                  onClick={() => scrollToSection("github-data")}
                  className={`w-full text-left transition-colors font-medium ${activeSection === "github-data" ? "text-cyan-400" : "text-zinc-400 hover:text-white"}`}
                >
                  GitHub & Repository Data
                </button>
              </li>
              <li>
                <button
                  onClick={() => scrollToSection("ai-providers")}
                  className={`w-full text-left transition-colors font-medium ${activeSection === "ai-providers" ? "text-cyan-400" : "text-zinc-400 hover:text-white"}`}
                >
                  AI API Keys (BYOK)
                </button>
              </li>
              <li>
                <button
                  onClick={() => scrollToSection("analytics")}
                  className={`w-full text-left transition-colors font-medium ${activeSection === "analytics" ? "text-cyan-400" : "text-zinc-400 hover:text-white"}`}
                >
                  Analytics & Tracking
                </button>
              </li>
            </ul>
          </div>
        </aside>

        {/* Content */}
        <main className="flex-1 space-y-16">
          <section
            id="core-philosophy"
            className="glass-card border border-white/10 rounded-3xl p-8 md:p-10 space-y-6"
          >
            <div className="h-10 w-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
              <Shield className="w-6 h-6 text-cyan-400" />
            </div>
            <h1 className="text-4xl font-bold tracking-tight">Privacy Policy</h1>
            <p className="text-zinc-300 leading-relaxed">
              At Ilm, privacy is not a feature—it is our core architectural philosophy.
            </p>
            <p className="text-zinc-400 leading-relaxed text-sm">
              Because Ilm is an entirely client-side application (running locally in your browser)
              without a central database, we physically cannot collect, sell, or analyze your
              content. Your words, your drafts, and your images belong exclusively to you.
            </p>
            <div className="border-l-2 border-cyan-500 pl-4 py-1 bg-cyan-950/20 rounded-r-md">
              <p className="text-sm font-medium text-cyan-300">
                You own your content. We don't have servers that store it. It's that simple.
              </p>
            </div>
          </section>

          <section
            id="github-data"
            className="glass-card border border-white/10 rounded-3xl p-8 md:p-10 space-y-6"
          >
            <div className="h-10 w-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
              <Database className="w-6 h-6 text-purple-400" />
            </div>
            <h2 className="text-3xl font-bold tracking-tight">GitHub & Repository Data</h2>
            <p className="text-zinc-300 leading-relaxed">
              When you authenticate Ilm via GitHub, we use a GitHub App to request installation
              tokens specifically limited to the repositories you select.
            </p>
            <ul className="space-y-4 text-zinc-400 text-sm list-disc list-inside">
              <li>
                <strong className="text-white">What we access:</strong> Only the repositories you
                explicitly approve.
              </li>
              <li>
                <strong className="text-white">What we write:</strong> Markdown files, images, and
                config files to your repository when you save or publish.
              </li>
              <li>
                <strong className="text-white">Token Storage:</strong> Authentication tokens are
                stored securely in your browser's local storage. They are never sent to a backend
                server.
              </li>
            </ul>
          </section>

          <section
            id="ai-providers"
            className="glass-card border border-white/10 rounded-3xl p-8 md:p-10 space-y-6"
          >
            <div className="h-10 w-10 rounded-xl bg-pink-500/10 border border-pink-500/20 flex items-center justify-center">
              <Lock className="w-6 h-6 text-pink-400" />
            </div>
            <h2 className="text-3xl font-bold tracking-tight">AI API Keys (BYOK)</h2>
            <p className="text-zinc-300 leading-relaxed">
              Ilm supports "Bring Your Own Key" (BYOK) for AI generation features.
            </p>
            <p className="text-zinc-400 leading-relaxed text-sm">
              If you provide an API key (e.g. OpenAI, Google Gemini, or Anthropic), it is encrypted
              and stored locally in your browser. All AI requests are made directly from your
              browser to the AI provider. Ilm has no middleware, meaning we never intercept your
              prompts, your API keys, or your responses.
            </p>
          </section>

          <section
            id="analytics"
            className="glass-card border border-white/10 rounded-3xl p-8 md:p-10 space-y-6"
          >
            <div className="h-10 w-10 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center justify-center">
              <Eye className="w-6 h-6 text-green-400" />
            </div>
            <h2 className="text-3xl font-bold tracking-tight">Analytics & Tracking</h2>
            <p className="text-zinc-300 leading-relaxed">
              Ilm does not use internal tracking, analytics cookies, or behavioral monitoring tools
              on our CMS platform.
            </p>
            <p className="text-zinc-400 leading-relaxed text-sm">
              If you configure your blog to use Google Analytics or Search Console, you retain full
              ownership of those accounts and the data they collect from your readers. Ilm simply
              reads this data via API to display it in your dashboard, without storing any metrics
              on our end.
            </p>
          </section>
        </main>
      </div>

      {/* Footer */}
      <footer className="border-t border-white/10 bg-black py-12 px-6 relative z-10">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded bg-gradient-to-br from-cyan-400 to-purple-500 flex items-center justify-center font-bold text-black text-xs">
              Ilm
            </div>
            <span className="font-semibold text-zinc-300">Ilm</span>
          </div>

          <div className="flex gap-6 text-sm text-zinc-500">
            <a href="https://github.com/ij-roy/Ilm" className="hover:text-white transition-colors">
              GitHub
            </a>
            <Link to="/docs" className="hover:text-white transition-colors">
              Documentation
            </Link>
            <Link to="/privacy" className="text-white transition-colors">
              Privacy
            </Link>
          </div>

          <div className="text-zinc-600 text-sm">
            © {new Date().getFullYear()} Ilm. Made with ❤️ by IJ Roy.
          </div>
        </div>
      </footer>
    </div>
  );
}

function GithubIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      role="img"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      fill="currentColor"
    >
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}
