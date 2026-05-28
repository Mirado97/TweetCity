import { motion } from 'framer-motion';
import { Building2, Home, Trophy, PlusCircle, Wallet, LogOut } from 'lucide-react';
import { cn } from '../utils/cn';

const navItems = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'mint', label: 'Mint', icon: PlusCircle },
  { id: 'leaderboard', label: 'Leaderboard', icon: Trophy },
];

export function Navbar({ currentPage, onNavigate, tokenId, address, onConnect, onDisconnect }) {
  return (
    <motion.nav
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="fixed top-0 left-0 right-0 z-50 glass-strong"
    >
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <motion.button
            onClick={() => onNavigate('home')}
            className="flex items-center gap-2.5 group"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#00d4ff] to-[#a855f7] flex items-center justify-center shadow-lg shadow-[#00d4ff]/20">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight">
              <span className="text-[#f1f5f9]">Tweet</span>
              <span className="gradient-text">City</span>
            </span>
          </motion.button>

          {/* Nav Links */}
          <div className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (
              <motion.button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={cn(
                  'relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                  currentPage === item.id ? 'text-[#00d4ff]' : 'text-[#94a3b8] hover:text-[#f1f5f9]'
                )}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
                {currentPage === item.id && (
                  <motion.div
                    layoutId="activeNav"
                    className="absolute inset-0 rounded-lg bg-[#00d4ff]/10 border border-[#00d4ff]/20"
                    transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                  />
                )}
              </motion.button>
            ))}
            {tokenId && (
              <motion.button
                onClick={() => onNavigate('city', tokenId)}
                className={cn(
                  'relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                  currentPage === 'city' ? 'text-[#00d4ff]' : 'text-[#94a3b8] hover:text-[#f1f5f9]'
                )}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Building2 className="w-4 h-4" />
                My City
                {currentPage === 'city' && (
                  <motion.div
                    layoutId="activeNav"
                    className="absolute inset-0 rounded-lg bg-[#00d4ff]/10 border border-[#00d4ff]/20"
                    transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                  />
                )}
              </motion.button>
            )}
            {/* Dev: V2 test page */}
            <motion.button
              onClick={() => onNavigate('testv2')}
              className="relative flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-[#64748b] hover:text-[#94a3b8] transition-colors"
              whileHover={{ scale: 1.02 }}
            >
              V2
            </motion.button>
          </div>

          {/* Wallet */}
          <div className="flex items-center gap-2">
            {address ? (
              <div className="flex items-center gap-2">
                <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#111118] border border-[rgba(255,255,255,0.06)]">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-sm font-mono text-[#94a3b8]">
                    {address.slice(0, 6)}...{address.slice(-4)}
                  </span>
                </div>
                <motion.button
                  onClick={onDisconnect}
                  className="p-2 rounded-lg text-[#64748b] hover:text-[#f1f5f9] hover:bg-[#111118] transition-colors"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  title="Disconnect"
                >
                  <LogOut className="w-4 h-4" />
                </motion.button>
              </div>
            ) : (
              <motion.button
                onClick={onConnect}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-[#00d4ff] to-[#a855f7] text-white text-sm font-semibold shadow-lg shadow-[#00d4ff]/25 hover:shadow-[#00d4ff]/40 transition-shadow"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Wallet className="w-4 h-4" />
                <span className="hidden sm:inline">Connect</span>
              </motion.button>
            )}
          </div>
        </div>
      </div>

      {/* Mobile nav */}
      <div className="md:hidden flex items-center justify-around px-4 py-2 border-t border-[rgba(255,255,255,0.06)]">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={cn(
              'flex flex-col items-center gap-1 p-2 rounded-lg transition-colors',
              currentPage === item.id ? 'text-[#00d4ff]' : 'text-[#64748b]'
            )}
          >
            <item.icon className="w-5 h-5" />
            <span className="text-[10px] font-medium">{item.label}</span>
          </button>
        ))}
        {tokenId && (
          <button
            onClick={() => onNavigate('city', tokenId)}
            className={cn(
              'flex flex-col items-center gap-1 p-2 rounded-lg transition-colors',
              currentPage === 'city' ? 'text-[#00d4ff]' : 'text-[#64748b]'
            )}
          >
            <Building2 className="w-5 h-5" />
            <span className="text-[10px] font-medium">My City</span>
          </button>
        )}
      </div>
    </motion.nav>
  );
}
