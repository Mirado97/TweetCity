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
import MarketPage from "./pages/MarketPage";
import GuidePage from "./pages/GuidePage";
import AdminPage from "./pages/AdminPage";
import TestV2Page from "./pages/TestV2Page";
import "./App.css";

const LS_TOKEN = "tweetcity_my_token";

// LS now holds JSON {tokenId, ownerAddress}. Old format was a bare string.
// Returns { my, legacyTokenId } — `my` is the full record (Navbar-ready),
// `legacyTokenId` is just the tokenId so we can auto-open the city and let
// CityPage re-record the new format once it confirms ownership.
function readMyCity() {
  const raw = localStorage.getItem(LS_TOKEN);
  if (!raw) return { my: null, legacyTokenId: null };
  try {
    const v = JSON.parse(raw);
    if (v && typeof v === "object" && v.tokenId && v.ownerAddress) {
      return { my: v, legacyTokenId: null };
    }
  } catch {}
  // Bare-string legacy: keep tokenId for one-shot auto-open, clear LS
  // until CityPage confirms owner and writes the new shape.
  localStorage.removeItem(LS_TOKEN);
  return { my: null, legacyTokenId: String(raw) };
}

function writeMyCity(tokenId, ownerAddress) {
  if (!tokenId || !ownerAddress) return;
  localStorage.setItem(LS_TOKEN, JSON.stringify({
    tokenId: String(tokenId),
    ownerAddress: ownerAddress.toLowerCase(),
  }));
}

function getInitialState() {
  const params = new URLSearchParams(window.location.search);
  const sharedCity = params.get("city");
  const { my, legacyTokenId } = readMyCity();
  if (sharedCity) {
    window.history.replaceState({}, "", window.location.pathname);
    return { page: "city", tokenId: sharedCity, myCity: my };
  }
  if (my)            return { page: "city", tokenId: my.tokenId,    myCity: my };
  if (legacyTokenId) return { page: "city", tokenId: legacyTokenId, myCity: null };
  return { page: "home", tokenId: null, myCity: null };
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
  const [myCity, setMyCity] = useState(init.myCity); // { tokenId, ownerAddress } | null
  const { address, signer, connect, disconnect } = useWallet();

  function nav(p, tokenId) {
    setPage(p);
    if (tokenId) setCityTokenId(tokenId);
    // No LS write here — only CityPage's onOwnerConfirmed() records My City.
  }

  // CityPage tells us when current address is verified owner of tokenId.
  // We persist that mapping so Navbar's "My City" button stays consistent.
  function onCityOwnerConfirmed(tokenId, ownerAddress) {
    writeMyCity(tokenId, ownerAddress);
    setMyCity({ tokenId: String(tokenId), ownerAddress: ownerAddress.toLowerCase() });
  }

  // Navbar shows "My City" link only when connected wallet matches the saved owner.
  const myCityForNavbar = (myCity && address && myCity.ownerAddress === address.toLowerCase())
    ? myCity.tokenId
    : null;

  return (
    <div className="w-full min-h-screen bg-[#0a0a0f] relative noise-bg">
      <BackgroundGrid />
      <FloatingParticles />

      <Navbar
        currentPage={page}
        onNavigate={nav}
        tokenId={myCityForNavbar}
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
              <MintPage address={address} signer={signer} onConnect={connect} onMinted={(id) => nav("city", id)} />
            </motion.div>
          )}
          {page === "city" && cityTokenId && (
            <motion.div key="city" className="w-full" variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.35 }}>
              <CityPage tokenId={cityTokenId} signer={signer} address={address} onOwnerConfirmed={onCityOwnerConfirmed} />
            </motion.div>
          )}
          {page === "leaderboard" && (
            <motion.div key="leaderboard" className="w-full" variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.35 }}>
              <LeaderboardPage onCityClick={(id) => nav("city", id)} />
            </motion.div>
          )}
          {page === "market" && (
            <motion.div key="market" className="w-full" variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.35 }}>
              <MarketPage onCityClick={(id) => nav("city", id)} />
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
