import React, { useState, useEffect } from "react";
import "./App.css";

// Color palette (for consistent use in js-generated styles)
const COLORS = {
  primary: "#3f51b5",   // Deep indigo
  secondary: "#f5f5f5", // Paper
  accent: "#ff9800",    // Orange
  bg: "var(--base-dark)",
  text: "var(--text-color)",
};

// Helps build API endpoints regardless of relative/absolute (customizable):
const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:3001";

// PUBLIC_INTERFACE
function useTicTacToeApi() {
  /**
   * Hook providing REST API functions for TicTacToe.
   * Assumes backend at API_BASE. Returns { createGame, joinGame, makeMove, fetchGame, error, loading }.
   */
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Util: POST request
  async function apiPost(url, body) {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(API_BASE + url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await resp.json();
      if (!resp.ok) throw Error(data.detail || "Unknown error");
      return data;
    } catch (e) {
      setError(e?.message || "API error");
      throw e;
    } finally {
      setLoading(false);
    }
  }

  // Util: GET request
  async function apiGet(url) {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(API_BASE + url);
      const data = await resp.json();
      if (!resp.ok) throw Error(data.detail || "Unknown error");
      return data;
    } catch (e) {
      setError(e?.message || "API error");
      throw e;
    } finally {
      setLoading(false);
    }
  }

  const createGame = (nickname) => apiPost("/games", { nickname });
  const joinGame = (game_id, nickname) =>
    apiPost(`/games/${encodeURIComponent(game_id)}/join`, { nickname });
  const makeMove = (game_id, player, position) =>
    apiPost(`/games/${encodeURIComponent(game_id)}/move`, { player, position });
  const fetchGame = (game_id) =>
    apiGet(`/games/${encodeURIComponent(game_id)}`);

  return { createGame, joinGame, makeMove, fetchGame, error, loading };
}

// --- UI Components

function GameBoard({ board, onCellClick, disabled }) {
  // Render a 3x3 grid
  return (
    <div className="ttt-board">
      {board.map((cell, idx) => (
        <button
          key={idx}
          className="ttt-cell"
          onClick={() => onCellClick(idx)}
          disabled={cell || disabled}
          aria-label={"Place at cell " + (idx + 1)}
        >
          {cell}
        </button>
      ))}
    </div>
  );
}

function MessageBar({ message, type }) {
  if (!message) return null;
  const color =
    type === "success"
      ? COLORS.accent
      : type === "info"
      ? COLORS.primary
      : type === "error"
      ? "#e53935"
      : COLORS.text;

  return (
    <div className="ttt-message" style={{ color }}>
      {message}
    </div>
  );
}

function NicknameInput({ value, onChange, disabled }) {
  return (
    <input
      className="ttt-input"
      type="text"
      placeholder="Enter Nickname"
      value={value}
      maxLength={15}
      required
      autoFocus
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      aria-label="Nickname"
    />
  );
}

function GameIdInput({ value, onChange, disabled }) {
  return (
    <input
      className="ttt-input"
      type="text"
      placeholder="Game ID"
      value={value}
      maxLength={16}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      aria-label="Game ID"
    />
  );
}

export default function App() {
  // --- State
  const [nickname, setNickname] = useState("");
  const [gameId, setGameId] = useState("");
  const [joinedGameId, setJoinedGameId] = useState(""); // for ongoing game
  const [playerSymbol, setPlayerSymbol] = useState(""); // 'X' or 'O'
  const [game, setGame] = useState(null); // game state from backend
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("info");

  const { createGame, joinGame, makeMove, fetchGame, error, loading } =
    useTicTacToeApi();

  // Poll for updates if in-game and not finished
  useEffect(() => {
    if (!joinedGameId) return;
    if (!game || (game?.winner == null && game?.status !== "draw")) {
      const interval = setInterval(() => {
        fetchGame(joinedGameId)
          .then(setGame)
          .catch(() => {});
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [joinedGameId, game, fetchGame]);

  // API error messaging
  useEffect(() => {
    if (error) {
      setMessage(error);
      setMessageType("error");
    }
  }, [error]);

  // Stylize: on start clear messages
  function handleClearMsgs() {
    setMessage("");
    setMessageType("info");
  }

  // --- UI handlers
  const handleStartNewGame = async (e) => {
    e.preventDefault();
    if (!nickname.trim()) {
      setMessage("Please enter a nickname.");
      setMessageType("error");
      return;
    }
    handleClearMsgs();
    try {
      const res = await createGame(nickname.trim());
      setPlayerSymbol("X");
      setJoinedGameId(res.game_id);
      setGame(res.game_state);
      setGameId(res.game_id); // for easy copy/share
      setMessage("Game created! Share Game ID with a friend to join: " + res.game_id);
      setMessageType("success");
    } catch {}
  };

  const handleJoinGame = async (e) => {
    e.preventDefault();
    if (!nickname.trim() || !gameId.trim()) {
      setMessage("Enter nickname and game ID.");
      setMessageType("error");
      return;
    }
    handleClearMsgs();
    try {
      const res = await joinGame(gameId.trim(), nickname.trim());
      setPlayerSymbol("O");
      setJoinedGameId(gameId.trim());
      setGame(res.game_state);
      setMessage("Joined game! Your symbol: O");
      setMessageType("success");
    } catch {}
  };

  const handleCellClick = async (idx) => {
    if (
      !game ||
      game.board[idx] ||
      (game.current_player !== playerSymbol) ||
      game.winner ||
      game.status === "draw"
    )
      return;

    try {
      const res = await makeMove(joinedGameId, playerSymbol, idx);
      setGame(res.game_state);
      handleClearMsgs();
    } catch {
      // API hook already sets error
    }
  };

  // Helper: message based on game state
  function getDynamicMessage() {
    if (!game) return "";
    if (game.winner) {
      return game.winner === playerSymbol
        ? "You win! 🎉"
        : "You lose!";
    }
    if (game.status === "draw") return "It's a draw!";
    if (game.current_player === playerSymbol) return "Your turn!";
    return "Waiting for opponent...";
  }

  function handleLeaveGame() {
    setGame(null);
    setJoinedGameId("");
    setPlayerSymbol("");
    setGameId("");
    setNickname("");
    setMessage("Left the game.");
    setMessageType("info");
  }

  // --- RENDER ---

  // Not in-game: show start/join controls
  if (!joinedGameId) {
    return (
      <div className="app">
        <nav className="navbar">
          <div className="container">
            <div style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
              <div className="logo">
                <span className="logo-symbol" style={{ color: COLORS.accent }}>*</span> Tic Tac Toe
              </div>
            </div>
          </div>
        </nav>
        <main>
          <div className="container hero">
            <div className="subtitle">Play online, invite a friend!</div>
            <h1 className="title">Tic Tac Toe</h1>
            <div className="description">
              Enter your nickname to <b>start a new game</b> or <b>join an existing game</b>.<br/>
            </div>

            <form className="ttt-start-form" onSubmit={handleStartNewGame}>
              <NicknameInput value={nickname} onChange={setNickname} disabled={loading} />
              <button className="btn btn-large" style={{ marginTop: 12, marginBottom: 16 }} disabled={loading}>
                Start New Game
              </button>
            </form>

            <form className="ttt-join-form" onSubmit={handleJoinGame}>
              <GameIdInput value={gameId} onChange={setGameId} disabled={loading} />
              <NicknameInput value={nickname} onChange={setNickname} disabled={loading} />
              <button className="btn btn-large" style={{ marginTop: 12 }} disabled={loading}>
                Join Game
              </button>
            </form>

            <MessageBar message={message} type={messageType} />
          </div>
        </main>
      </div>
    );
  }

  // In-game: show board and game controls
  return (
    <div className="app">
      <nav className="navbar">
        <div className="container">
          <div style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
            <div className="logo">
              <span className="logo-symbol" style={{ color: COLORS.accent }}>*</span> Tic Tac Toe
            </div>
            <button className="btn" onClick={handleLeaveGame} style={{ background: COLORS.primary }}>
              Leave Game
            </button>
          </div>
        </div>
      </nav>
      <main>
        <div className="container hero">
          <div className="subtitle">
            Game ID: <span style={{ color: COLORS.primary, fontWeight: 500 }}>{joinedGameId}</span>
          </div>
          <h1 className="title" style={{ marginBottom: 0 }}>
            {nickname} <span style={{ fontWeight: 300, color: COLORS.text, fontSize: "2rem" }}>({playerSymbol})</span>
          </h1>
          <div className="ttt-status-message">
            <MessageBar message={getDynamicMessage()} type="info" />
          </div>
          <GameBoard
            board={game?.board || Array(9).fill("")}
            onCellClick={handleCellClick}
            disabled={loading || !!game?.winner || game?.status === "draw" || game?.players?.length < 2}
          />

          {game?.winner || game?.status === "draw" ? (
            <div style={{ margin: "12px 0" }}>
              <button className="btn" style={{ background: COLORS.accent }} onClick={handleLeaveGame}>
                Play Again
              </button>
            </div>
          ) : null}

          <MessageBar message={message} type={messageType} />
        </div>
      </main>
    </div>
  );
}
