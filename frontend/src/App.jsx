import { useState } from "react";
import { useWallet } from "./hooks/useWallet";
import LandingPage from "./pages/LandingPage";
import MintPage from "./pages/MintPage";
import CityPage from "./pages/CityPage";
import LeaderboardPage from "./pages/LeaderboardPage";
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

  return (
    <div className="app">
      <nav className="navbar">
        <div className="nav-logo" onClick={() => nav("home")}>TweetCity</div>
        <div className="nav-links">
          <button onClick={() => nav("home")}>Home</button>
          <button onClick={() => nav("mint")}>Mint</button>
          {cityTokenId && (
            <button onClick={() => nav("city", { tokenId: cityTokenId })}>My City</button>
          )}
          <button onClick={() => nav("leaderboard")}>Leaderboard</button>
        </div>
        <div className="nav-wallet">
          {address ? (
            <span className="addr-pill">{address.slice(0, 6)}...{address.slice(-4)}</span>
          ) : (
            <button className="btn-connect" onClick={connect}>Connect Wallet</button>
          )}
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
      </main>

      {walletError && <div className="global-error">{walletError}</div>}
    </div>
  );
}
