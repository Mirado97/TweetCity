import { motion } from "framer-motion";
import {
  BookOpen, Sparkles, Building2, RefreshCw, Gift, Heart,
  Send, CheckCircle2, XCircle, Shield, Clock, Coins,
  MessageCircle, AlertTriangle, ArrowRight,
} from "lucide-react";

const CITY_LEVELS = [
  { name: "Hamlet",        followers: "0 – 49",       icon: "🏠" },
  { name: "Village",       followers: "50 – 249",     icon: "🏘️" },
  { name: "Borough",       followers: "250 – 999",    icon: "🏙️" },
  { name: "Town",          followers: "1K – 2.9K",    icon: "🌆" },
  { name: "Township",      followers: "3K – 9.9K",    icon: "🌃" },
  { name: "City",          followers: "10K – 29.9K",  icon: "🗼" },
  { name: "Metropolis",    followers: "30K – 99.9K",  icon: "🌇" },
  { name: "Megalopolis",   followers: "100K – 299K",  icon: "🏯" },
  { name: "Megacity",      followers: "300K – 999K",  icon: "🌁" },
  { name: "World Capital", followers: "1M+",          icon: "🌐" },
];

const GIFT_GUIDE = [
  {
    icon: "🎨",
    name: "Graffiti",
    color: "from-cyan-400 to-blue-500",
    duty: "Like the buyer's tweet",
    engage: "3 days",
    desc: "The cheapest, fastest gift. Owner simply hits ♥ on the buyer's tweet. A small graffiti tag appears on a wall in the city.",
  },
  {
    icon: "🖼️",
    name: "Street Art",
    color: "from-purple-400 to-pink-500",
    duty: "Like AND retweet the buyer's tweet",
    engage: "7 days",
    desc: "Two-step engagement. Both the like and the retweet must be detectable on the owner's Twitter. A bigger mural shows up in the city.",
  },
  {
    icon: "🚩",
    name: "Flag",
    color: "from-red-400 to-orange-500",
    duty: "Reply to the buyer's tweet",
    engage: "7 days",
    desc: "Owner posts a public reply to the buyer's tweet (any text). A flagpole with a waving banner rises in the city.",
  },
  {
    icon: "📺",
    name: "Billboard",
    color: "from-amber-400 to-yellow-500",
    duty: "Quote-tweet the buyer's tweet",
    engage: "14 days",
    desc: "Owner publishes a quote tweet of the buyer's post (adds their own commentary above it). A glowing billboard appears on the city's main road.",
  },
  {
    icon: "🏛️",
    name: "Monument",
    color: "from-emerald-400 to-teal-500",
    duty: "Post a dedicated tweet @mentioning the buyer",
    engage: "21 days",
    desc: "Owner writes a NEW standalone tweet that mentions the buyer's handle. The post must be created AFTER the gift was accepted. A column with a glowing sphere stands in the city.",
  },
  {
    icon: "🏘️",
    name: "District",
    color: "from-pink-400 to-rose-500",
    duty: "Pin the buyer's tweet to the owner's profile for 7 days",
    engage: "30 days",
    desc: "The most expensive gift. Owner sets the buyer's tweet as the pinned tweet on their profile. A neon ring lights up an entire district of the city.",
  },
];

function Section({ children, className = "" }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      className={`mb-16 ${className}`}
    >
      {children}
    </motion.section>
  );
}

function FlowStep({ num, title, desc, icon: Icon, color }) {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${color} flex items-center justify-center shrink-0 shadow-lg`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div className="w-0.5 flex-1 bg-white/20 mt-2" />
      </div>
      <div className="pb-8">
        <div className="text-[10px] text-[#64748b] uppercase tracking-wider font-bold mb-1">Step {num}</div>
        <h4 className="font-bold text-[#f1f5f9] mb-1">{title}</h4>
        <p className="text-sm text-[#94a3b8] leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

export default function GuidePage() {
  return (
    <div className="w-full pt-20 md:pt-24 px-4 sm:px-8 lg:px-16 xl:px-24 pb-20 relative">
      <div className="absolute top-1/4 left-0 w-96 h-96 bg-[#00d4ff]/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-0 w-96 h-96 bg-[#a855f7]/5 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-5xl mx-auto relative">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#00d4ff]/10 border border-[#00d4ff]/20 text-[#00d4ff] text-xs font-semibold mb-4">
            <BookOpen className="w-3.5 h-3.5" />
            How it works
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold mb-4">
            The <span className="gradient-text">TweetCity</span> Guide
          </h1>
          <p className="text-[#94a3b8] max-w-2xl mx-auto">
            Mint a city from your Twitter profile, grow it with your followers, and earn MNT
            when other users send gifts that require your real on-chain engagement.
          </p>
        </motion.div>

        {/* ─── How a city is born ─── */}
        <Section>
          <div className="flex items-center gap-2 mb-6">
            <Building2 className="w-5 h-5 text-[#00d4ff]" />
            <h2 className="text-2xl font-bold">1. How a city is born</h2>
          </div>
          <div className="glass rounded-2xl p-6 space-y-4 text-[#94a3b8] text-sm leading-relaxed">
            <p>
              You connect MetaMask, enter your Twitter handle, and post a one-time verification
              tweet from that account. The backend checks the tweet, reads your follower count,
              tweet count, following, and recent engagement, then asks Claude AI to classify your
              communication style (Cyberpunk, Eco-Futurism, Medieval, Brutalist, Minimalist, Baroque
              or Bio-Punk).
            </p>
            <p>
              The result is uploaded to IPFS and minted as a TweetCity NFT on the Mantle network.
              The buildings, density, color palette, monument and overall layout are all derived
              deterministically from your Twitter metrics — two users with identical numbers would
              get identical cities.
            </p>
          </div>
        </Section>

        {/* ─── Levels ─── */}
        <Section>
          <div className="flex items-center gap-2 mb-6">
            <Sparkles className="w-5 h-5 text-[#a855f7]" />
            <h2 className="text-2xl font-bold">2. City levels</h2>
          </div>
          <p className="text-[#94a3b8] text-sm mb-6">
            Your city's level — and therefore its size, district mix and central monument —
            scales with your follower count.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {CITY_LEVELS.map((l, i) => (
              <motion.div
                key={l.name}
                initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }}
                transition={{ delay: i * 0.04 }}
                className="glass rounded-xl p-4 text-center hover:bg-[#16161f] transition-colors"
              >
                <div className="text-3xl mb-2">{l.icon}</div>
                <div className="font-bold text-[#f1f5f9] text-sm">{l.name}</div>
                <div className="text-[11px] text-[#64748b] mt-1">{l.followers} followers</div>
              </motion.div>
            ))}
          </div>
        </Section>

        {/* ─── Sync ─── */}
        <Section>
          <div className="flex items-center gap-2 mb-6">
            <RefreshCw className="w-5 h-5 text-emerald-400" />
            <h2 className="text-2xl font-bold">3. Syncing your city</h2>
          </div>
          <div className="glass rounded-2xl p-6 space-y-3 text-[#94a3b8] text-sm leading-relaxed">
            <p>
              Open your city page and press <strong className="text-[#f1f5f9]">Sync City</strong>.
              The backend re-reads your Twitter metrics, recalculates the level, and writes an
              update on-chain. If you crossed a level threshold, a level-up event is recorded with
              a short fantasy proclamation generated by Claude.
            </p>
            <p>
              Sync is rate-limited (you can't spam it). Each sync also writes an ERC-8004 validation
              record so reputation systems can read your verified metrics.
            </p>
          </div>
        </Section>

        {/* ─── Gift flow ─── */}
        <Section>
          <div className="flex items-center gap-2 mb-6">
            <Gift className="w-5 h-5 text-[#f59e0b]" />
            <h2 className="text-2xl font-bold">4. How gifts work — full flow</h2>
          </div>
          <div className="glass rounded-2xl p-6">
            <FlowStep
              num="1"
              title="Owner sets prices"
              desc="As the city owner you open Gift Prices and set MNT prices for each of the 6 gift types. Setting 0 disables that type. Bigger accounts charge more — it's your call."
              icon={Coins} color="from-amber-400 to-yellow-500"
            />
            <FlowStep
              num="2"
              title="A buyer sends a gift"
              desc="Another user visits your city, picks a gift type, pastes a link to THEIR tweet they want you to engage with, and pays your price. 10% protocol fee is taken instantly; the other 90% is locked in escrow on the contract."
              icon={Send} color="from-cyan-400 to-blue-500"
            />
            <FlowStep
              num="3"
              title="You see an Inbox notification"
              desc="An Inbox badge appears in your city header. Open the modal — you'll see the gift type, the tweet link, the locked amount, and a 48-hour countdown to accept or reject."
              icon={Heart} color="from-rose-400 to-pink-500"
            />
            <FlowStep
              num="4"
              title="Accept or Reject"
              desc="Accept (3D artifact spawns in your city right away) — or Reject (buyer is refunded 90% immediately, e.g. if the link is spam). If you ignore for 48h the buyer can claim their money back."
              icon={CheckCircle2} color="from-emerald-400 to-teal-500"
            />
            <FlowStep
              num="5"
              title="Perform the obligation on Twitter"
              desc="Each gift type has a specific Twitter action with its own deadline (see table below). The action must be visible on your account before the engage deadline expires."
              icon={MessageCircle} color="from-sky-400 to-cyan-500"
            />
            <FlowStep
              num="6"
              title="Oracle verifies & you get paid"
              desc="A backend oracle scans Twitter every 10 minutes for accepted gifts. When it sees your action, it calls verifyEngagement on-chain and the locked 90% is transferred to your wallet. If you accepted but missed the deadline, the buyer claims the refund instead and the artifact disappears."
              icon={Shield} color="from-purple-400 to-pink-500"
            />
            {/* Last step has no trailing line */}
            <div className="flex gap-4">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shrink-0 shadow-lg">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="text-[10px] text-[#64748b] uppercase tracking-wider font-bold mb-1">Result</div>
                <h4 className="font-bold text-[#f1f5f9] mb-1">The gift lives in your city forever</h4>
                <p className="text-sm text-[#94a3b8] leading-relaxed">
                  Verified gifts permanently decorate your 3D city — graffiti walls, street art, flags,
                  billboards, monuments and neon districts accumulate as proof of engagement.
                </p>
              </div>
            </div>
          </div>
        </Section>

        {/* ─── 6 Gift Types Table ─── */}
        <Section>
          <div className="flex items-center gap-2 mb-6">
            <MessageCircle className="w-5 h-5 text-[#00d4ff]" />
            <h2 className="text-2xl font-bold">5. The six gift types</h2>
          </div>
          <p className="text-[#94a3b8] text-sm mb-6">
            Each type costs whatever the city owner sets (10% goes to the protocol, 90% to the owner upon verification).
            What differs is the obligation and the time window the owner has to fulfil it.
          </p>
          <div className="grid sm:grid-cols-2 gap-4">
            {GIFT_GUIDE.map((g, i) => (
              <motion.div
                key={g.name}
                initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
                className="glass rounded-2xl p-5 gradient-border"
              >
                <div className="flex items-start gap-3 mb-3">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${g.color} flex items-center justify-center text-2xl shadow-lg`}>
                    {g.icon}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-[#f1f5f9]">{g.name}</h3>
                    <div className="flex items-center gap-3 mt-1 text-[11px]">
                      <span className="flex items-center gap-1 text-[#00d4ff]">
                        <MessageCircle className="w-3 h-3" /> {g.duty}
                      </span>
                    </div>
                  </div>
                </div>
                <p className="text-sm text-[#94a3b8] leading-relaxed mb-3">{g.desc}</p>
                <div className="flex items-center gap-3 pt-3 border-t border-white/10 text-[11px]">
                  <span className="flex items-center gap-1 text-[#f59e0b]">
                    <Clock className="w-3 h-3" /> Accept window: 48h
                  </span>
                  <span className="flex items-center gap-1 text-emerald-400">
                    <Clock className="w-3 h-3" /> Engage window: {g.engage}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        </Section>

        {/* ─── Refunds ─── */}
        <Section>
          <div className="flex items-center gap-2 mb-6">
            <AlertTriangle className="w-5 h-5 text-rose-400" />
            <h2 className="text-2xl font-bold">6. Refunds &amp; safety</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="glass rounded-2xl p-5">
              <XCircle className="w-6 h-6 text-rose-400 mb-3" />
              <h4 className="font-bold text-[#f1f5f9] mb-2">Owner rejects</h4>
              <p className="text-xs text-[#94a3b8] leading-relaxed">
                Owner clicks Reject on a pending gift. The buyer is refunded 90% immediately (the
                10% protocol fee is not returned, since it was paid out at send-time).
              </p>
            </div>
            <div className="glass rounded-2xl p-5">
              <Clock className="w-6 h-6 text-[#f59e0b] mb-3" />
              <h4 className="font-bold text-[#f1f5f9] mb-2">Owner ignores 48h</h4>
              <p className="text-xs text-[#94a3b8] leading-relaxed">
                The buyer opens the city page and sees the gift under "My Gifts to This City"
                with a Claim Refund button. Clicking it returns 90% to the buyer's wallet.
              </p>
            </div>
            <div className="glass rounded-2xl p-5">
              <AlertTriangle className="w-6 h-6 text-amber-400 mb-3" />
              <h4 className="font-bold text-[#f1f5f9] mb-2">Owner accepts but doesn't engage</h4>
              <p className="text-xs text-[#94a3b8] leading-relaxed">
                If the engage window expires before the oracle sees the Twitter action, the buyer
                claims their refund the same way. The artifact disappears from the city.
              </p>
            </div>
          </div>
        </Section>

        {/* ─── Fees ─── */}
        <Section>
          <div className="flex items-center gap-2 mb-6">
            <Coins className="w-5 h-5 text-amber-400" />
            <h2 className="text-2xl font-bold">7. Fees &amp; payouts</h2>
          </div>
          <div className="glass rounded-2xl p-6">
            <div className="grid sm:grid-cols-2 gap-6">
              <div>
                <div className="text-4xl font-bold gradient-text mb-2">10%</div>
                <div className="font-bold text-[#f1f5f9] mb-1">Protocol fee</div>
                <p className="text-sm text-[#94a3b8] leading-relaxed">
                  Deducted at send-time and sent immediately to the protocol treasury. Pays for
                  the oracle's Apify scraping costs and contract gas.
                </p>
              </div>
              <div>
                <div className="text-4xl font-bold text-emerald-400 mb-2">90%</div>
                <div className="font-bold text-[#f1f5f9] mb-1">To the city owner</div>
                <p className="text-sm text-[#94a3b8] leading-relaxed">
                  Locked in escrow on the CityGifts contract. Released to the owner's wallet
                  only after the oracle verifies the on-Twitter action.
                </p>
              </div>
            </div>
          </div>
        </Section>

        {/* ─── CTA ─── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
          className="glass rounded-3xl p-8 sm:p-12 text-center relative overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-[#00d4ff]/5 to-[#a855f7]/5 pointer-events-none" />
          <div className="relative">
            <h2 className="text-2xl sm:text-3xl font-bold mb-3">Ready to build yours?</h2>
            <p className="text-[#94a3b8] text-sm max-w-md mx-auto mb-6">
              Connect your wallet, enter your Twitter handle, and start your on-chain city.
            </p>
            <a
              href="/"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-[#00d4ff] to-[#a855f7] text-white font-semibold shadow-lg shadow-[#00d4ff]/25"
            >
              Back to home <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
