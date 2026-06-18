import { useState, useEffect, useRef } from 'react'
import {
  Zap, Cpu, Network, Database, Code2, Coins, Layers,
  ChevronRight, ArrowRight, MessageCircle, Github,
  Terminal, Globe, Shield, Activity, Server,
  PlugZap, Sparkles, Wallet, ServerCrash, BookOpen
} from 'lucide-react'
import AIWriterExample from './AIWriterExample'

// ─── Visual design system ──────────────────────────────────────────────────
function GridOverlay() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 opacity-[0.03]"
      style={{
        backgroundImage: `
          linear-gradient(rgba(0,229,255,1) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0,229,255,1) 1px, transparent 1px)
        `,
        backgroundSize: '64px 64px',
      }}
    />
  )
}

function AmbientGlows() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      <div className="absolute -top-60 left-1/3 w-[700px] h-[700px] rounded-full bg-cyan-500/8 blur-[140px]" />
      <div className="absolute top-1/2 -right-60 w-[600px] h-[600px] rounded-full bg-purple-600/8 blur-[130px]" />
      <div className="absolute bottom-40 left-0 w-[500px] h-[400px] rounded-full bg-cyan-400/5 blur-[120px]" />
    </div>
  )
}

function FadeUp({ children, delay = 0, className = '' }) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setVisible(true)
    }, { threshold: 0.05, rootMargin: '-40px' })
    observer.observe(el)
    // Fallback: ensure content becomes visible
    const timer = setTimeout(() => setVisible(true), 300 + delay)
    return () => { observer.disconnect(); clearTimeout(timer) }
  }, [delay])
  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ${className}`}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(28px)',
        transitionDelay: `${delay}ms`,
        transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      {children}
    </div>
  )
}

function Label({ children, color = 'cyan' }) {
  const styles = {
    cyan: 'border-cyan-400/20 bg-cyan-400/5 text-cyan-400',
    purple: 'border-purple-400/20 bg-purple-400/5 text-purple-400',
    amber: 'border-amber-400/20 bg-amber-400/5 text-amber-400',
  }
  const dot = {
    cyan: 'bg-cyan-400 shadow-[0_0_6px_#00e5ff]',
    purple: 'bg-purple-400 shadow-[0_0_6px_#a855f7]',
    amber: 'bg-amber-400 shadow-[0_0_6px_#fbbf24]',
  }
  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border mb-5 ${styles[color]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot[color]}`} />
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', letterSpacing: '0.1em' }} className="uppercase">
        {children}
      </span>
    </div>
  )
}

function Divider() {
  return <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/8 to-transparent" />
}

function GlassCard({ children, className = '', hoverColor = '' }) {
  const hoverMap = {
    cyan: 'hover:border-cyan-400/25 hover:shadow-[0_0_28px_-8px_#00e5ff40]',
    purple: 'hover:border-purple-400/25 hover:shadow-[0_0_28px_-8px_#a855f740]',
    amber: 'hover:border-amber-400/25 hover:shadow-[0_0_28px_-8px_#fbbf2440]',
    '': 'hover:border-white/15',
  }
  return (
    <div
      className={`rounded-xl border border-white/8 p-6 transition-all duration-300 ${hoverMap[hoverColor] || hoverMap['']} ${className}`}
      style={{ background: 'rgba(10,10,20,0.75)', backdropFilter: 'blur(12px)' }}
    >
      {children}
    </div>
  )
}

export default function Landing({ onNavigateToDashboard, onNavigateToMiner, onNavigateToWiki }) {
  const [activeTab, setActiveTab] = useState('overview')
  const [installPrompt, setInstallPrompt] = useState(null)
  const [mobileOS, setMobileOS] = useState(null)

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault()
      setInstallPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', handler)

    const ua = navigator.userAgent
    if (/Android/i.test(ua)) setMobileOS('android')
    else if (/iPhone|iPad|iPod/i.test(ua)) setMobileOS('ios')

    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (!installPrompt) return
    installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    if (outcome === 'accepted') setInstallPrompt(null)
  }

  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', fn, { passive: true })
    return () => window.removeEventListener('scroll', fn)
  }, [])

  return (
    <div className="relative min-h-screen" style={{ background: '#04040a' }}>
      <GridOverlay />
      <AmbientGlows />

      <div className="relative z-10">
        {/* Navigation */}
        <header
          className="fixed top-0 inset-x-0 z-50 transition-all duration-500"
          style={{
            background: scrolled ? 'rgba(4,4,10,0.88)' : 'transparent',
            backdropFilter: scrolled ? 'blur(20px)' : 'none',
            borderBottom: scrolled ? '1px solid rgba(255,255,255,0.06)' : 'none',
          }}
        >
          <nav className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-400 to-purple-500 flex items-center justify-center shadow-[0_0_16px_#00e5ff40]">
                <Cpu size={13} className="text-black" strokeWidth={2.5} />
              </div>
              <span style={{ fontFamily: "'Oxanium', sans-serif", fontWeight: 700, fontSize: '15px', letterSpacing: '0.04em' }} className="text-white">
                Chimera
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => window.open('/wiki', '_blank')}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-white/45 hover:text-white/70 transition-colors text-sm"
              >
                Wiki
              </button>
              <a
                href="https://github.com/TerexitariusStomp/qvac-chimera"
                target="_blank"
                rel="noopener noreferrer"
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-white/45 hover:text-white/70 transition-colors text-sm"
              >
                <Github size={14} />
                GitHub
              </a>
              <a
                href="#"
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg border border-purple-500/40 bg-purple-500/10 text-purple-300 hover:bg-purple-500/20 hover:border-purple-400/60 transition-all text-sm"
              >
                <MessageCircle size={13} />
                Discord
              </a>
            </div>
          </nav>
        </header>

      {/* Hero Section */}
      <section className="relative min-h-screen flex flex-col items-center justify-center text-center px-6 pt-24 pb-16">
        <FadeUp delay={50}>
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/8 bg-white/3 mb-8 text-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 shadow-[0_0_6px_#4ade80] animate-pulse" />
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px' }} className="text-white/50">Open source · Permissionless</span>
          </div>
        </FadeUp>

        <FadeUp delay={150}>
          <h1
            style={{ fontFamily: "'Oxanium', sans-serif", fontWeight: 800, fontSize: 'clamp(44px, 8vw, 88px)', lineHeight: 1.02, letterSpacing: '-0.025em', color: '#fff' }}
            className="bg-gradient-to-br from-white via-white to-white/35 bg-clip-text text-transparent mb-6 max-w-4xl"
          >
            Decentralized LLM,<br />
            <span style={{ fontFamily: "'Oxanium', sans-serif", color: '#fff' }} className="bg-gradient-to-r from-cyan-400 via-cyan-300 to-purple-400 bg-clip-text text-transparent">
              woven into your app.
            </span>
          </h1>
        </FadeUp>

        <FadeUp delay={250}>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 'clamp(15px, 2vw, 19px)', lineHeight: 1.75 }} className="text-white/70 max-w-2xl mb-10">
            A distributed AI wiki and miner node. The LLMwiki is powered by the same QVAC inference backend that serves task networks like Cortensor, Chutes, and Routstr. All inference runs through one unified QVAC instance.
          </p>
        </FadeUp>

        <FadeUp delay={350}>
          <div className="flex items-center gap-4 flex-wrap justify-center mb-20">
            <button
              onClick={() => window.open('/wiki', '_blank')}
              className="group flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-400 to-cyan-300 text-black text-sm font-semibold hover:from-cyan-300 hover:to-cyan-200 transition-all shadow-[0_0_24px_#00e5ff28] hover:shadow-[0_0_36px_#00e5ff45]"
            >
              <Code2 size={14} />
              Open LLM Wiki
              <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
            </button>
            <button
              onClick={() => window.open('/wiki', '_blank')}
              className="flex items-center gap-2 px-6 py-3 rounded-xl border border-white/10 bg-white/3 text-white/65 text-sm hover:bg-white/6 hover:text-white hover:border-white/18 transition-all"
            >
              <Coins size={14} />
              Run a Node
            </button>
          </div>
        </FadeUp>

        <FadeUp delay={450} className="w-full max-w-3xl">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              {
                icon: Code2,
                who: 'For Developers',
                line: 'Integrate decentralized inference into any app. Your users get AI. You get a revenue share from every task routed through the network.',
                color: 'cyan',
              },
              {
                icon: Coins,
                who: 'For Contributors',
                line: 'Run a Chimera node on your machine. When apps route inference tasks to the network, your hardware earns — proportional to work completed.',
                color: 'purple',
              },
            ].map(c => (
              <div
                key={c.who}
                className={`rounded-xl border p-5 text-left transition-all duration-300 ${c.color === 'cyan' ? 'border-cyan-400/15 bg-cyan-400/4 hover:border-cyan-400/25' : 'border-purple-400/15 bg-purple-400/4 hover:border-purple-400/25'}`}
              >
                <div className="flex items-center gap-2 mb-3">
                  <c.icon size={14} className={c.color === 'cyan' ? 'text-cyan-400' : 'text-purple-400'} />
                  <span style={{ fontFamily: "'Oxanium', sans-serif", fontWeight: 600, fontSize: '13px' }} className="text-white/80">
                    {c.who}
                  </span>
                </div>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '13px', lineHeight: 1.65 }} className="text-white/40">
                  {c.line}
                </p>
              </div>
            ))}
          </div>
        </FadeUp>

        <div aria-hidden className="absolute bottom-0 inset-x-0 h-40 bg-gradient-to-t from-[#04040a] to-transparent pointer-events-none" />
      </section>

      {/* Mobile Download Banner */}
      {mobileOS && (
        <section className="relative py-16 px-6">
          <div className="max-w-2xl mx-auto">
            <GlassCard hoverColor="purple">
              <div className="flex items-center gap-3 mb-3">
                <Cpu size={20} className="text-purple-400" />
                <h2 style={{ fontFamily: "'Oxanium', sans-serif", fontWeight: 700, fontSize: '16px' }} className="text-white">
                  {mobileOS === 'android' ? 'Download Chimera Miner for Android' : 'Get Chimera Miner for iPhone'}
                </h2>
              </div>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '13px' }} className="text-white/40 mb-4">
                {mobileOS === 'android'
                  ? 'Install via Termux script. The wiki runs natively and auto-configures miners.'
                  : 'Install via a-Shell. The iOS build connects directly to the mining network via Pear P2P.'}
              </p>
              <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px' }} className="text-white/25">
                Use the emulator below to get your setup script.
              </p>
            </GlassCard>
          </div>
        </section>
      )}

      {/* Key Features */}
      <section className="relative py-32 px-6">
        <Divider />
        <div className="max-w-6xl mx-auto">
          <FadeUp className="text-center mb-16">
            <Label color="purple">Key Features</Label>
            <h2 style={{ fontFamily: "'Oxanium', sans-serif", fontWeight: 700, fontSize: 'clamp(28px, 4vw, 44px)', lineHeight: 1.1 }} className="text-white mb-4">
              One node.<br />
              <span className="bg-gradient-to-r from-purple-400 to-purple-200 bg-clip-text text-transparent">Many networks.</span>
            </h2>
          </FadeUp>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              { icon: Zap, title: 'QVAC Integration', desc: 'Local AI inference with llama-3.2-1b-instruct. On-device processing for privacy and speed.', accent: 'cyan', link: 'https://qvac.tether.io/' },
              { icon: Network, title: 'Pear P2P', desc: 'Decentralized peer-to-peer distribution. Zero infrastructure, direct node-to-node communication.', accent: 'purple', link: 'https://pears.com/' },
              { icon: Database, title: 'Hypercore Storage', desc: 'Secure, distributed append-only log. Replication and integrity verification built-in.', accent: 'amber', link: 'https://github.com/holepunchto/hypercore' },
              { icon: Cpu, title: 'Multi-Miner Support', desc: 'Cortensor, Chutes, Fortytwo, Earnidle, Routstr — all run in parallel monitoring mode.', accent: 'cyan' },
              { icon: Globe, title: 'LLM Wiki (Openviking)', desc: 'AI-generated markdown wiki with search, link graphs, and P2P sync. Queryable AI memory store.', accent: 'purple' },
              { icon: Activity, title: 'Real-Time Task Monitor', desc: 'Immediate detection of inference tasks across all miners. Smart resource management.', accent: 'amber' },
            ].map((f, i) => (
              <FadeUp key={f.title} delay={i * 80}>
                <GlassCard hoverColor={f.accent} className="h-full">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-4 ${f.accent === 'cyan' ? 'bg-cyan-400/10' : f.accent === 'purple' ? 'bg-purple-400/10' : 'bg-amber-400/10'}`}>
                    <f.icon size={18} strokeWidth={1.7} className={f.accent === 'cyan' ? 'text-cyan-400' : f.accent === 'purple' ? 'text-purple-400' : 'text-amber-400'} />
                  </div>
                  <h3 style={{ fontFamily: "'Oxanium', sans-serif", fontWeight: 600, fontSize: '15px' }} className="text-white mb-2">{f.title}</h3>
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '13px', lineHeight: 1.65 }} className="text-white/40 mb-3">{f.desc}</p>
                  {f.link && (
                    <a href={f.link} target="_blank" rel="noopener noreferrer" className="text-xs text-cyan-400/70 hover:text-cyan-300 transition-colors">
                      {f.link.replace(/^https?:\/\//, '').replace(/\/$/, '')} →
                    </a>
                  )}
                </GlassCard>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* Architecture Section */}
      <section className="relative py-32 px-6">
        <Divider />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-purple-950/15 to-transparent pointer-events-none" />
        <div className="max-w-6xl mx-auto relative">
          <FadeUp className="text-center mb-16">
            <Label color="cyan">Architecture</Label>
            <h2 style={{ fontFamily: "'Oxanium', sans-serif", fontWeight: 700, fontSize: 'clamp(28px, 4vw, 44px)', lineHeight: 1.1 }} className="text-white">
              Core components &<br />
              <span className="bg-gradient-to-r from-cyan-400 to-cyan-200 bg-clip-text text-transparent">parallel miners.</span>
            </h2>
          </FadeUp>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <FadeUp delay={100}>
              <GlassCard className="h-full">
                <h3 style={{ fontFamily: "'Oxanium', sans-serif", fontWeight: 600, fontSize: '14px' }} className="text-white mb-5 flex items-center gap-2">
                  <Server size={16} className="text-cyan-400" />
                  Core Components
                </h3>
                <div className="space-y-3">
                  {[
                    { icon: Zap, title: 'QVAC Inference Layer', desc: 'Local AI processing with multiple models', accent: 'cyan' },
                    { icon: Database, title: 'Hypercore Data Store', desc: 'Distributed append-only log storage', accent: 'green' },
                    { icon: Network, title: 'Pear P2P Network', desc: 'Decentralized peer discovery', accent: 'blue' },
                    { icon: Globe, title: 'LLM Wiki (Openviking)', desc: 'AI memory store with search, graph, P2P sync', accent: 'orange' },
                    { icon: Activity, title: 'Task Monitor', desc: 'Real-time inference task detection', accent: 'purple' },
                  ].map(c => (
                    <div key={c.title} className="flex items-center gap-3 p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
                      <c.icon size={14} className={c.accent === 'cyan' ? 'text-cyan-400' : c.accent === 'green' ? 'text-green-400' : c.accent === 'blue' ? 'text-blue-400' : c.accent === 'orange' ? 'text-orange-400' : 'text-purple-400'} />
                      <div className="flex-1">
                        <p style={{ fontFamily: "'Oxanium', sans-serif", fontSize: '13px' }} className="text-white/80">{c.title}</p>
                        <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '12px' }} className="text-white/30">{c.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </GlassCard>
            </FadeUp>

            <FadeUp delay={200}>
              <GlassCard className="h-full">
                <h3 style={{ fontFamily: "'Oxanium', sans-serif", fontWeight: 600, fontSize: '14px' }} className="text-white mb-5 flex items-center gap-2">
                  <Cpu size={16} className="text-purple-400" />
                  Parallel Miners
                </h3>
                <div className="space-y-3">
                  {[
                    { icon: Zap, name: 'Cortensor', desc: 'Decentralized AI network mining', color: 'purple' },
                    { icon: Cpu, name: 'Chutes', desc: 'GPU compute validation mining', color: 'blue' },
                    { icon: Activity, name: 'Fortytwo-Network', desc: 'AI inference network mining', color: 'green' },
                    { icon: Sparkles, name: 'Earnidle', desc: 'Idle compute protocol mining', color: 'orange' },
                    { icon: Zap, name: 'Routstr', desc: 'Decentralized AI inference router', color: 'yellow' },
                  ].map(m => (
                    <div key={m.name} className="flex items-center gap-3 p-3 rounded-lg group hover:bg-white/[0.04] transition-colors" style={{ background: 'rgba(255,255,255,0.03)' }}>
                      <div className={`w-8 h-8 rounded flex items-center justify-center ${m.color === 'purple' ? 'bg-purple-500/15' : m.color === 'blue' ? 'bg-blue-500/15' : m.color === 'green' ? 'bg-green-500/15' : m.color === 'orange' ? 'bg-orange-500/15' : 'bg-yellow-500/15'}`}>
                        <m.icon size={14} className={m.color === 'purple' ? 'text-purple-400' : m.color === 'blue' ? 'text-blue-400' : m.color === 'green' ? 'text-green-400' : m.color === 'orange' ? 'text-orange-400' : 'text-yellow-400'} />
                      </div>
                      <div className="flex-1">
                        <p style={{ fontFamily: "'Oxanium', sans-serif", fontSize: '13px' }} className="text-white/80">{m.name}</p>
                        <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '12px' }} className="text-white/30">{m.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 p-4 rounded-xl border border-cyan-400/15 bg-cyan-400/5">
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '13px' }} className="text-cyan-300/70">
                    <span className="text-cyan-400 font-medium">Parallel Mode:</span> All miners run simultaneously in monitoring mode, detecting inference tasks in real-time.
                  </p>
                </div>
              </GlassCard>
            </FadeUp>
          </div>
        </div>
      </section>

      {/* AI Writer — Phone Emulator */}
      <section className="relative py-32 px-6">
        <Divider />
        <div className="max-w-6xl mx-auto">
          <FadeUp className="text-center mb-16">
            <Label color="amber">Get Started</Label>
            <h2 style={{ fontFamily: "'Oxanium', sans-serif", fontWeight: 700, fontSize: 'clamp(28px, 4vw, 44px)', lineHeight: 1.1 }} className="text-white mb-4">
              Download & run locally.
            </h2>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '16px' }} className="text-white/40 max-w-xl mx-auto">
              Enter your EVM address and download the setup script for your platform. The LLM Wiki runs on localhost:3002 with miner controls in the sidebar.
            </p>
          </FadeUp>
          <AIWriterExample onNavigateBack={() => {}} onNavigateToDashboard={onNavigateToDashboard} />
        </div>
      </section>

      {/* Tech Stack Section */}
      <section className="relative py-32 px-6">
        <Divider />
        <div className="max-w-6xl mx-auto">
          <FadeUp className="text-center mb-16">
            <Label>Technology Stack</Label>
            <h2 style={{ fontFamily: "'Oxanium', sans-serif", fontWeight: 700, fontSize: 'clamp(28px, 4vw, 44px)', lineHeight: 1.1 }} className="text-white">
              Built on proven tech.
            </h2>
          </FadeUp>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
            {[
              { icon: Terminal, name: 'Node.js', role: 'Runtime', accent: 'green' },
              { icon: Zap, name: 'QVAC', role: 'AI Inference', accent: 'cyan' },
              { icon: Network, name: 'Pear', role: 'P2P Network', accent: 'purple' },
              { icon: Database, name: 'Hypercore', role: 'Data Storage', accent: 'orange' },
            ].map((t, i) => (
              <FadeUp key={t.name} delay={i * 80}>
                <div className="rounded-xl border border-white/8 p-6 text-center transition-all duration-300 hover:border-white/15" style={{ background: 'rgba(10,10,20,0.75)', backdropFilter: 'blur(12px)' }}>
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center mx-auto mb-3 ${t.accent === 'cyan' ? 'bg-cyan-400/10' : t.accent === 'purple' ? 'bg-purple-400/10' : t.accent === 'green' ? 'bg-green-400/10' : 'bg-amber-400/10'}`}>
                    <t.icon size={20} strokeWidth={1.5} className={t.accent === 'cyan' ? 'text-cyan-400' : t.accent === 'purple' ? 'text-purple-400' : t.accent === 'green' ? 'text-green-400' : 'text-amber-400'} />
                  </div>
                  <div style={{ fontFamily: "'Oxanium', sans-serif", fontWeight: 700, fontSize: '14px' }} className="text-white mb-1">{t.name}</div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px' }} className="text-white/30 uppercase tracking-wider">{t.role}</div>
                </div>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative py-10 px-6 border-t border-white/6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-gradient-to-br from-cyan-400 to-purple-500 flex items-center justify-center shadow-[0_0_10px_#00e5ff30]">
              <Cpu size={10} className="text-black" strokeWidth={2.5} />
            </div>
            <span style={{ fontFamily: "'Oxanium', sans-serif", fontWeight: 700, fontSize: '13px' }} className="text-white/50">Chimera</span>
          </div>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '12px' }} className="text-white/22">
            Decentralised LLM infrastructure · Open source · Permissionless
          </p>
          <div className="flex gap-4">
            <a href="https://github.com/TerexitariusStomp/qvac-chimera" target="_blank" rel="noopener noreferrer" className="text-white/25 hover:text-white/55 transition-colors">
              <Github size={15} />
            </a>
          </div>
        </div>
      </footer>
      </div>
    </div>
  )
}
