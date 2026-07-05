import { useState, useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { LightRays } from "./components/LightRays";
import { PenTool, Rocket, Search, BarChart2, Database, ArrowRight, Code2 } from "lucide-react";
import { Button } from "@ilm/ui";

export function LandingPage({ onConnectGitHub }: { readonly onConnectGitHub: () => void }) {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="bg-black text-white min-h-screen font-sans selection:bg-cyan-500/30">
      {/* Navbar */}
      <div className="fixed top-0 left-0 right-0 z-50 flex justify-center pt-6 px-4">
        <nav
          className={`transition-all duration-300 rounded-full px-4 md:px-6 py-3 flex items-center justify-between w-full max-w-5xl ${isScrolled ? "glass-nav shadow-[0_8px_32px_rgba(0,0,0,0.5)] border border-white/10" : "bg-transparent border border-transparent"}`}
        >
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-cyan-400 to-purple-500 flex items-center justify-center font-bold text-black shadow-lg">
              Ilm
            </div>
            <span className="font-semibold tracking-tight text-white hidden sm:block">Ilm</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-xs font-semibold tracking-wide uppercase text-zinc-400">
            <a href="#features" className="hover:text-white transition-colors">
              Features
            </a>
            <a href="#how-it-works" className="hover:text-white transition-colors">
              How it Works
            </a>
            <a
              href="https://github.com/ij-roy/Ilm"
              target="_blank"
              rel="noreferrer"
              className="hover:text-white transition-colors flex items-center gap-2"
            >
              <Github className="w-4 h-4" /> Open Source
            </a>
          </div>
          <div>
            <Button
              onClick={onConnectGitHub}
              className="bg-white text-black hover:bg-zinc-200 h-10 px-6 py-2 text-sm font-bold rounded-full shadow-[0_0_15px_rgba(255,255,255,0.1)] hover:shadow-[0_0_25px_rgba(255,255,255,0.4)] transition-all hover:scale-105 active:scale-95"
            >
              Get Started
            </Button>
          </div>
        </nav>
      </div>

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center pt-20 overflow-hidden">
        {/* LightRays WebGL Background */}
        <div className="absolute inset-0 pointer-events-none opacity-60">
          <LightRays
            raysOrigin="top-center"
            raysColor="#06b6d4"
            raysSpeed={1.5}
            lightSpread={0.8}
            rayLength={1.5}
            followMouse={true}
            mouseInfluence={0.2}
            noiseAmount={0.1}
            distortion={0.05}
          />
        </div>

        <div className="relative z-10 max-w-4xl mx-auto px-6 text-center">
          <h1
            className="text-5xl md:text-7xl font-bold tracking-tight mb-8 leading-tight animate-fade-in-up"
            style={{ animationDelay: "100ms" }}
          >
            Own Your Publishing <br className="hidden md:block" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-500">
              Workflow
            </span>
          </h1>

          <p
            className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto mb-10 leading-relaxed animate-fade-in-up"
            style={{ animationDelay: "200ms" }}
          >
            Ilm is a Git-native, database-free CMS that writes portable Markdown directly to your
            GitHub repository. Your content, completely under your control.
          </p>

          <div
            className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-fade-in-up"
            style={{ animationDelay: "300ms" }}
          >
            <Button
              onClick={onConnectGitHub}
              className="bg-white text-black hover:bg-zinc-200 h-12 px-8 text-base w-full sm:w-auto flex items-center gap-2 font-medium"
            >
              <Github className="w-5 h-5" /> Continue with GitHub
            </Button>
            <a
              href="#features"
              className="h-12 px-8 flex items-center justify-center rounded-md border border-white/10 hover:bg-white/5 text-base w-full sm:w-auto font-medium transition-colors"
            >
              Explore Features
            </a>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-24 px-6 relative z-10 bg-black">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Everything you need, nothing you don't.
            </h2>
            <p className="text-zinc-400 max-w-2xl mx-auto">
              A powerful writing experience that respects your ownership.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <FeatureCard
              icon={<Database className="w-6 h-6 text-cyan-400" />}
              title="Zero Database"
              description="No vendor lock-in. Ilm writes raw markdown directly to your GitHub repository."
            />
            <FeatureCard
              icon={<PenTool className="w-6 h-6 text-purple-400" />}
              title="Rich Editor"
              description="Notion-style block editor powered by TipTap, with intelligent AI suggestions."
            />
            <FeatureCard
              icon={<Rocket className="w-6 h-6 text-pink-400" />}
              title="One-Click Publish"
              description="Saves become commits. Publishing moves files from drafts to posts automatically."
            />
            <FeatureCard
              icon={<Search className="w-6 h-6 text-green-400" />}
              title="SEO Built-In"
              description="Automatic validation for OpenGraph, Twitter Cards, and Schema.org metadata."
            />
            <FeatureCard
              icon={<BarChart2 className="w-6 h-6 text-blue-400" />}
              title="Integrated Analytics"
              description="Connect Google Analytics and Search Console to view stats where you write."
            />
            <FeatureCard
              icon={<Code2 className="w-6 h-6 text-orange-400" />}
              title="Framework Agnostic"
              description="Works with Astro, Next.js, or any static site generator that builds from markdown."
            />
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section
        id="how-it-works"
        className="py-24 px-6 relative z-10 bg-black/50 border-t border-white/5"
      >
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">How Ilm works</h2>
            <p className="text-zinc-400">Three simple steps to absolute content freedom.</p>
          </div>

          <div className="space-y-12">
            <Step
              number="01"
              title="Connect Your Repository"
              description="Install the Ilm GitHub App. Grant access only to the repositories you want to use as your CMS backend."
            />
            <div className="h-12 w-px bg-gradient-to-b from-cyan-500/50 to-transparent ml-8 md:ml-12"></div>
            <Step
              number="02"
              title="Write & Edit"
              description="Use the rich text editor to draft your content. Every save creates a direct commit to your repository's drafts folder."
            />
            <div className="h-12 w-px bg-gradient-to-b from-purple-500/50 to-transparent ml-8 md:ml-12"></div>
            <Step
              number="03"
              title="Publish & Deploy"
              description="Hit publish. Ilm moves the markdown file to your posts directory. Your CI/CD (like GitHub Actions or Vercel) automatically builds and deploys your static site."
            />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-32 px-6 relative z-10 overflow-hidden">
        {/* Subtle background glow */}
        <div className="absolute inset-0 flex items-center justify-center opacity-30 pointer-events-none">
          <div className="w-[600px] h-[600px] bg-cyan-500 rounded-full blur-[120px] mix-blend-screen opacity-20"></div>
          <div className="w-[600px] h-[600px] bg-purple-500 rounded-full blur-[120px] mix-blend-screen opacity-20 -ml-32"></div>
        </div>

        <div className="max-w-3xl mx-auto text-center relative z-10 glass-card p-12 md:p-16 rounded-3xl border border-white/10">
          <h2 className="text-4xl font-bold mb-6">Ready to take control?</h2>
          <p className="text-xl text-zinc-400 mb-10">
            Join developers building modern, portable, and fiercely independent technical blogs.
          </p>
          <Button
            onClick={onConnectGitHub}
            className="bg-gradient-to-r from-cyan-500 to-purple-600 text-white hover:opacity-90 h-14 px-10 text-lg rounded-full font-medium shadow-[0_0_40px_rgba(6,182,212,0.3)] hover:shadow-[0_0_60px_rgba(168,85,247,0.4)] transition-all"
          >
            Continue with GitHub <ArrowRight className="ml-2 w-5 h-5" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 bg-black py-12 px-6">
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
            <Link to="/privacy" className="hover:text-white transition-colors">
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

function FeatureCard({
  icon,
  title,
  description
}: {
  readonly icon: ReactNode;
  readonly title: string;
  readonly description: string;
}) {
  return (
    <div className="glass-card p-8 rounded-2xl border border-white/10 hover:border-white/20 transition-all duration-300 group hover:-translate-y-1">
      <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center mb-6 border border-white/10 group-hover:bg-white/10 transition-colors">
        {icon}
      </div>
      <h3 className="text-xl font-semibold mb-3">{title}</h3>
      <p className="text-zinc-400 leading-relaxed text-sm">{description}</p>
    </div>
  );
}

function Step({
  number,
  title,
  description
}: {
  readonly number: string;
  readonly title: string;
  readonly description: string;
}) {
  return (
    <div className="flex gap-6 md:gap-8 items-start group">
      <div className="flex-shrink-0 w-16 h-16 md:w-24 md:h-24 rounded-2xl glass-card border border-white/10 flex items-center justify-center text-xl md:text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-br from-cyan-400 to-purple-500">
        {number}
      </div>
      <div className="pt-2 md:pt-6">
        <h3 className="text-xl md:text-2xl font-bold mb-3">{title}</h3>
        <p className="text-zinc-400 leading-relaxed text-sm md:text-base">{description}</p>
      </div>
    </div>
  );
}

function Github(props: React.SVGProps<SVGSVGElement>) {
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
