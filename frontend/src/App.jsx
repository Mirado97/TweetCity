import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useWallet } from "./hooks/useWallet";
import { Navbar } from "./components/Navbar";
import { BackgroundGrid } from "./components/BackgroundGrid";
import { FloatingParticles } from "./components/FloatingParticles";
import LandingPage from "./pages/LandingPage";
import MintPage from "./pages/MintPage";
import CityPage from "./pages/CityPage";
import LeaderboardPage from "./pages/LeaderboardPage";
import GuidePage from "./pages/GuidePage";
import AdminPage from "./pages/AdminPage";
import TestV2Page from "./pages/TestV2Page";
import "./App.css";

const LS_TOKEN = "tweetcity_my_token";

function getInitialState() {
  const params = new URLSearchParams(window.location.search);
  const sharedCity = params.get("city");
  if (sharedCity) {
    window.history.replaceState({}, "", window.location.pathname);
    return { page: "city", tokenId: sharedCity };
  }
  const saved = localStorage.getItem(LS_TOKEN);
  return { page: saved ? "city" : "home", tokenId: saved };
}

const pageVariants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit:    { opacity: 0, y: -20 },
};

export default function App() {
  const init = getInitialState();
  const [page, setPage] = useState(init.page);
  const [cityTokenId, setCityTokenId] = useState(init.tokenId);
  const { address, signer, connect, disconnect } = useWallet();

  function nav(p, tokenId) {
    setPage(p);
    if (tokenId) {
      setCityTokenId(tokenId);
      localStorage.setItem(LS_TOKEN, tokenId);
    }
  }

  return (
    <div className="w-full min-h-screen bg-[#0a0a0f] relative noise-bg">
      <BackgroundGrid />
      <FloatingParticles />

      <Navbar
        currentPage={page}
        onNavigate={nav}
        tokenId={cityTokenId}
        address={address}
        onConnect={connect}
        onDisconnect={disconnect}
      />

      <main className="w-full relative z-10">
        <AnimatePresence mode="wait">
          {page === "home" && (
            <motion.div key="home" className="w-full" variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.35 }}>
              <LandingPage onMintClick={() => nav("mint")} />
            </motion.div>
          )}
          {page === "mint" && (
            <motion.div key="mint" className="w-full" variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.35 }}>
              <MintPage address={address} onConnect={connect} onMinted={(id) => nav("city", id)} />
            </motion.div>
          )}
          {page === "city" && cityTokenId && (
            <motion.div key="city" className="w-full" variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.35 }}>
              <CityPage tokenId={cityTokenId} signer={signer} address={address} />
            </motion.div>
          )}
          {page === "leaderboard" && (
            <motion.div key="leaderboard" className="w-full" variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.35 }}>
              <LeaderboardPage onCityClick={(id) => nav("city", id)} />
            </motion.div>
          )}
          {page === "guide" && (
            <motion.div key="guide" className="w-full" variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.35 }}>
              <GuidePage />
            </motion.div>
          )}
          {page === "admin" && (
            <motion.div key="admin" className="w-full" variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.35 }}>
              <AdminPage address={address} signer={signer} onConnect={connect} />
            </motion.div>
          )}
          {page === "testv2" && (
            <motion.div key="testv2" className="w-full" variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.35 }}>
              <TestV2Page />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
