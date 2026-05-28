import { motion } from 'framer-motion';
import { ArrowRight, Sparkles, Shield, Zap, Globe, MessageCircle, Building2 } from 'lucide-react';
import { LEVEL_NAMES, LEVEL_THRESHOLDS } from '../components/CityRendererV2';

const features = [
  { icon: MessageCircle, title: 'Twitter Sync', description: 'Your followers, tweets, and engagement shape your unique city architecture.', color: 'from-sky-400 to-blue-500' },
  { icon: Sparkles, title: 'Generative Art', description: 'Every city is procedurally generated with distinct styles and color palettes.', color: 'from-purple-400 to-pink-500' },
  { icon: Shield, title: 'On-Chain Forever', description: 'Minted as an NFT on Mantle blockchain. Your city lives forever on-chain.', color: 'from-emerald-400 to-teal-500' },
  { icon: Zap, title: 'Level Up', description: 'Grow your Twitter to evolve your city from a Hamlet to a World Capital.', color: 'from-amber-400 to-orange-500' },
];

const cityLevels = [
  { name: 'Hamlet',      followers: '< 50',    icon: '🏠' },
  { name: 'Village',     followers: '50+',     icon: '🏘️' },
  { name: 'Borough',     followers: '250+',    icon: '🏙️' },
  { name: 'Town',        followers: '1K+',     icon: '🌆' },
  { name: 'Township',    followers: '3K+',     icon: '🌃' },
  { name: 'City',        followers: '10K+',    icon: '🗼' },
  { name: 'Metropolis',  followers: '30K+',    icon: '🌇' },
  { name: 'Megalopolis', followers: '100K+',   icon: '🏯' },
  { name: 'Megacity',    followers: '300K+',   icon: '🌁' },
  { name: 'World Capital', followers: '1M+',   icon: '🌐' },
];

export default function LandingPage({ onMintClick }) {
  return (
    <div className="w-full pt-20 md:pt-24">
      {/* Hero */}
      <section className="relative px-4 sm:px-6 lg:px-8 py-16 md:py-24 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#00d4ff]/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#a855f7]/10 rounded-full blur-3xl pointer-events-none" />

        <div className="w-full">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <motion.div initial={{ opacity: 0, x: -40 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8, ease: 'easeOut' }}>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#00d4ff]/10 border border-[#00d4ff]/20 text-[#00d4ff] text-xs font-semibold mb-6">
                <Sparkles className="w-3.5 h-3.5" />
                Now on Mantle Blockchain
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black leading-tight mb-6">
                Your Twitter becomes a{' '}
                <span className="gradient-text">Living City</span>
              </h1>
              <p className="text-lg text-[#94a3b8] leading-relaxed mb-8 max-w-lg">
                Transform your Twitter presence into a unique generative 3D city NFT.
                Every follower builds a building. Every tweet adds density.
                Your social footprint, immortalized on-chain.
              </p>
              <div className="flex flex-wrap gap-4">
                <motion.button
                  onClick={onMintClick}
                  className="group relative flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-[#00d4ff] to-[#a855f7] text-white font-semibold shadow-lg shadow-[#00d4ff]/25 hover:shadow-[#00d4ff]/50 transition-all overflow-hidden"
                  whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                  Mint Your City
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </motion.button>
                <motion.button
                  onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl glass text-[#f1f5f9] font-semibold hover:bg-[#16161f] transition-colors"
                  whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                >
                  <MessageCircle className="w-4 h-4" />
                  Learn More
                </motion.button>
              </div>
              <div className="flex items-center gap-6 mt-10 text-sm text-[#64748b]">
                <div className="flex items-center gap-2"><Globe className="w-4 h-4" /><span>Mantle Network</span></div>
                <div className="flex items-center gap-2"><Building2 className="w-4 h-4" /><span>Generative 3D Cities</span></div>
              </div>
            </motion.div>

            {/* Hero card */}
            <motion.div initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8, delay: 0.2, ease: 'easeOut' }} className="relative">
              <div className="relative aspect-square max-w-md mx-auto">
                <div className="absolute inset-0 bg-gradient-to-br from-[#00d4ff]/30 to-[#a855f7]/30 rounded-full blur-3xl animate-pulse-glow" />
                <div className="relative glass rounded-2xl p-6 glow-cyan">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#00d4ff] to-[#a855f7] flex items-center justify-center text-lg">🏙️</div>
                      <div>
                        <div className="font-bold text-[#f1f5f9]">@your_twitter</div>
                        <div className="text-xs text-[#64748b]">Metropolis · Level 7</div>
                      </div>
                    </div>
                    <div className="px-2 py-1 rounded-md bg-[#00d4ff]/10 text-[#00d4ff] text-xs font-mono font-bold">NFT</div>
                  </div>
                  <div className="aspect-video rounded-xl bg-[#0a0a0f] relative overflow-hidden mb-4">
                    <div className="absolute inset-0 bg-gradient-to-b from-sky-900/20 to-[#0a0a0f]" />
                    <div className="absolute bottom-0 left-0 right-0 flex items-end justify-center gap-1 px-4 pb-2">
                      {[40, 65, 35, 80, 55, 70, 45, 90, 60, 50, 75, 40].map((h, i) => (
                        <motion.div
                          key={i}
                          initial={{ height: 0 }}
                          animate={{ height: `${h}%` }}
                          transition={{ delay: 0.5 + i * 0.05, duration: 0.6, ease: 'easeOut' }}
                          className="flex-1 rounded-t-sm"
                          style={{
                            background: `linear-gradient(to top, ${i % 3 === 0 ? '#00d4ff' : i % 3 === 1 ? '#a855f7' : '#ec4899'}40, ${i % 3 === 0 ? '#00d4ff' : i % 3 === 1 ? '#a855f7' : '#ec4899'}80)`,
                            maxWidth: 24,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {[{ label: 'Population', value: '18.4K' }, { label: 'Tweets', value: '4,201' }, { label: 'Likes', value: '2,847' }].map((s) => (
                      <div key={s.label} className="text-center p-2 rounded-lg bg-[#0a0a0f]/50">
                        <div className="text-sm font-bold text-[#f1f5f9]">{s.value}</div>
                        <div className="text-[10px] text-[#64748b] uppercase tracking-wider">{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="px-4 sm:px-6 lg:px-8 py-20" id="how-it-works">
        <div className="w-full">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-16">
            <span className="text-[#00d4ff] text-sm font-semibold uppercase tracking-wider">Features</span>
            <h2 className="text-3xl sm:text-4xl font-bold mt-3 mb-4">How it works</h2>
            <p className="text-[#94a3b8] max-w-2xl mx-auto">Your Twitter metrics directly influence your city's appearance, size, and prestige.</p>
          </motion.div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, i) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}
                className="group glass rounded-2xl p-6 hover:bg-[#16161f] transition-all cursor-default gradient-border"
              >
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${feature.color} flex items-center justify-center mb-4 shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                  <feature.icon className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-lg font-bold text-[#f1f5f9] mb-2 group-hover:text-[#00d4ff] transition-colors">{feature.title}</h3>
                <p className="text-sm text-[#94a3b8] leading-relaxed">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* City Levels */}
      <section className="px-4 sm:px-6 lg:px-8 py-20">
        <div className="w-full">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-16">
            <span className="text-[#a855f7] text-sm font-semibold uppercase tracking-wider">Progression</span>
            <h2 className="text-3xl sm:text-4xl font-bold mt-3 mb-4">City Levels</h2>
            <p className="text-[#94a3b8] max-w-2xl mx-auto">Grow your Twitter following to evolve your city from a tiny hamlet to a World Capital.</p>
          </motion.div>
          <div className="flex flex-wrap justify-center gap-4">
            {cityLevels.map((level, i) => (
              <motion.div
                key={level.name}
                initial={{ opacity: 0, scale: 0.9 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ delay: i * 0.06 }}
                className="glass rounded-xl p-5 text-center min-w-[130px] hover:bg-[#16161f] transition-colors group"
              >
                <div className="text-3xl mb-2 group-hover:scale-110 transition-transform">{level.icon}</div>
                <div className="font-bold text-[#f1f5f9] text-sm">{level.name}</div>
                <div className="text-xs text-[#64748b] mt-1">{level.followers} followers</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 sm:px-6 lg:px-8 py-20">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="w-full text-center">
          <div className="glass rounded-3xl p-10 md:p-16 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-[#00d4ff]/5 to-[#a855f7]/5" />
            <div className="relative z-10">
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">Ready to build your city?</h2>
              <p className="text-[#94a3b8] mb-8 max-w-lg mx-auto">
                Connect your wallet, enter your Twitter handle, and watch your social presence transform into a unique 3D city NFT.
              </p>
              <motion.button
                onClick={onMintClick}
                className="group relative inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-[#00d4ff] to-[#a855f7] text-white font-bold text-lg shadow-xl shadow-[#00d4ff]/30 hover:shadow-[#00d4ff]/50 transition-shadow overflow-hidden"
                whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                <Sparkles className="w-5 h-5" />
                Mint Your City Now
              </motion.button>
            </div>
          </div>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="px-4 sm:px-6 lg:px-8 py-8 border-t border-[rgba(255,255,255,0.06)]">
        <div className="w-full flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-[#00d4ff]" />
            <span className="font-bold text-[#f1f5f9]">TweetCity</span>
          </div>
          <p className="text-sm text-[#64748b]">Built on Mantle Blockchain · Mantle Turing Test Hackathon 2026</p>
        </div>
      </footer>
    </div>
  );
}
