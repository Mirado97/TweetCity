import { useState } from "react";
import { useWallet } from "./hooks/useWallet";
import LandingPage from "./pages/LandingPage";
import MintPage from "./pages/MintPage";
import CityPage from "./pages/CityPage";
import LeaderboardPage from "./pages/LeaderboardPage";
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

export default function App() {
  const init = getInitialState();
  const [page, setPage] = useState(init.page);
  const [cityTokenId, setCityTokenId] = useState(init.tokenId);
  const { address, signer, error: walletError, connect } = useWallet();

  function nav(p, extra) {
    setPage(p);
    if (extra?.tokenId) {
      setCityTokenId(extra.tokenId);
      localStorage.setItem(LS_TOKEN, extra.tokenId);
    }
  }

  const navItems = [
    { id: "home", label: "Home" },
    { id: "mint", label: "Mint" },
    ...(cityTokenId ? [{ id: "city", label: "My City", tokenId: cityTokenId }] : []),
    { id: "leaderboard", label: "Leaderboard" },
    { id: "testv2", label: "V2", style: { opacity: 0.5, fontSize: 11 } },
  ];

  return (
    <div className="app">
      <nav className="navbar">
        <div className="navbar-inner">
          <div className="nav-logo" onClick={() => nav("home")}>
            TweetCity
          </div>
          
          <div className="nav-links">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => nav(item.id, item.tokenId ? { tokenId: item.tokenId } : undefined)}
                className={page === item.id ? "active" : ""}
                style={item.style}
              >
                {item.label}
              </button>
            ))}
          </div>
          
          <div className="nav-wallet">
            {address ? (
              <span className="addr-pill">
                <span>●</span>
                <span>{address.slice(0, 6)}...{address.slice(-4)}</span>
              </span>
            ) : (
              <button className="btn btn-connect" onClick={connect}>
                Connect
              </button>
            )}
          </div>
        </div>
      </nav>

      <main className="main">
        {page === "home" && <LandingPage onMintClick={() => nav("mint")} />}
        {page === "mint" && (
          <MintPage address={address} onConnect={connect} onMinted={(id) => nav("city", { tokenId: id })} />
        )}
        {page === "city" && cityTokenId && (
          <CityPage tokenId={cityTokenId} signer={signer} address={address} />
        )}
        {page === "leaderboard" && (
          <LeaderboardPage onCityClick={(id) => nav("city", { tokenId: id })} />
        )}
        {page === "testv2" && <TestV2Page />}
      </main>

      {walletError && <div className="global-error">{walletError}</div>}
    </div>
  );
}