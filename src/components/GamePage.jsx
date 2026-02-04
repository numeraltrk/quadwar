import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { GameLogic } from '../logic/logic';
import { NetworkManager } from '../logic/network';
import { CONSTANTS } from '../logic/constants';
import GameCanvas from './GameCanvas';
import LogPanel from './LogPanel';
import '../styles/game.css';
import '../styles/landing.css'; // Inherit base styles

const GamePage = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const query = new URLSearchParams(location.search);
    const modeParam = query.get('mode') || 'local';
    const hostId = query.get('host');
    const joinId = query.get('join');

    const [updateKey, setUpdateKey] = useState(0);
    const gameRef = useRef(new GameLogic());
    const game = gameRef.current;

    const [network, setNetwork] = useState(null);
    const [gameMode, setGameMode] = useState(modeParam);
    const [myPlayer, setMyPlayer] = useState(CONSTANTS.PLAYER_RED);
    const [isOnline, setIsOnline] = useState(false);
    const [logs, setLogs] = useState([]);
    const [isAnimating, setIsAnimating] = useState(false);
    const [pendingEquations, setPendingEquations] = useState(null);
    const [headerTitle, setHeaderTitle] = useState('INITIALIZING...');
    const [isThinking, setIsThinking] = useState(false);

    // AI Worker
    const workerRef = useRef(null);

    const forceUpdate = useCallback(() => {
        setUpdateKey(prev => prev + 1);
    }, []);

    const rotateBoard = useMemo(() => isOnline && myPlayer === CONSTANTS.PLAYER_RED, [isOnline, myPlayer]);

    const checkGameOver = useCallback(() => {
        if (gameRef.current.gameOver) {
            alert("GAME OVER! Winner: " + (gameRef.current.winner === CONSTANTS.PLAYER_RED ? "Red" : "Blue"));
        }
    }, []);


    const executeMove = useCallback((fromR, fromC, toR, toC) => {
        const response = gameRef.current.movePiece(fromR, fromC, toR, toC);
        const results = response.events;

        if (results && results.length > 0) {
            results.forEach(res => {
                setLogs(prev => [{ ...res, player: gameRef.current.currentPlayer }, ...prev]);
            });
        }

        if (response.pending) {
            setIsAnimating(true);
            setPendingEquations(results);

            setTimeout(() => {
                gameRef.current.completeTurn(results);
                setPendingEquations(null);
                setIsAnimating(false);
                forceUpdate();
                checkGameOver();
            }, 2000);
        } else {
            forceUpdate();
            checkGameOver();
        }
    }, [checkGameOver, forceUpdate]);

    const handleMove = useCallback((row, col) => {
        if (isAnimating || gameRef.current.gameOver) return;
        if (isOnline && gameRef.current.currentPlayer !== myPlayer) return;

        const g = gameRef.current;
        if (g.selectedPiece) {
            const validMoves = g.getValidMoves(g.selectedPiece.r, g.selectedPiece.c);
            const isMove = validMoves.some(m => m.r === row && m.c === col);

            if (isMove) {
                const from = { r: g.selectedPiece.r, c: g.selectedPiece.c };
                const to = { r: row, c: col };

                executeMove(from.r, from.c, to.r, to.c);

                if (isOnline && network) {
                    network.sendMove({ from, to });
                }
            } else {
                const p = g.getPiece(row, col);
                if (p && p.player === g.currentPlayer && (!isOnline || p.player === myPlayer)) {
                    g.selectedPiece = { r: row, c: col };
                    forceUpdate();
                } else {
                    g.selectedPiece = null;
                    forceUpdate();
                }
            }
        } else {
            const p = g.getPiece(row, col);
            if (p && p.player === g.currentPlayer) {
                if (isOnline && p.player !== myPlayer) return;
                g.selectedPiece = { r: row, c: col };
                forceUpdate();
            }
        }
    }, [executeMove, forceUpdate, isOnline, myPlayer, network]);

    const setupOnlineMode = useCallback(() => {
        setIsOnline(true);
        setHeaderTitle('CONNECTING...');
        const net = new NetworkManager();
        setNetwork(net);

        net.init(hostId, (id) => {
            console.log("Network Ready. My ID:", id);
            if (joinId) {
                net.connect(joinId);
                setMyPlayer(CONSTANTS.PLAYER_RED); // Joiner is Red
                setHeaderTitle('JOINING...');
            }
        }, (err) => {
            setHeaderTitle('ONLINE ERROR: ' + err);
        });

        net.onConnect = (isHost) => {
            setHeaderTitle(`ONLINE (${isHost ? 'Blue' : 'Red'})`);
            setMyPlayer(isHost ? CONSTANTS.PLAYER_BLUE : CONSTANTS.PLAYER_RED);
        };

        net.onDisconnect = () => {
            alert("Opponent Disconnected! return to Menu.");
            navigate('/');
        };

        net.onData = (msg) => {
            if (msg.type === 'MOVE') {
                const { from, to } = msg.data;
                executeMove(from.r, from.c, to.r, to.c);
            } else if (msg.type === 'RESTART') {
                alert("Opponent is restarting the game.");
                window.location.reload();
            }
        };
    }, [hostId, joinId, navigate, executeMove]);

    const handleRestart = useCallback(() => {
        if (window.confirm("Are you sure you want to restart? Current game progress will be lost.")) {
            if (isOnline && network) {
                network.sendMessage('RESTART', {});
            }
            window.location.reload();
        }
    }, [isOnline, network]);

    const handleExit = useCallback(() => {
        if (window.confirm("Are you sure you want to return to the menu? Current game progress will be lost.")) {
            navigate('/');
        }
    }, [navigate]);

    useEffect(() => {
        if (gameMode === 'cpu' && gameRef.current.currentPlayer === CONSTANTS.PLAYER_RED && !gameRef.current.gameOver && !isAnimating) {
            console.log("[Main] AI Turn Triggered");
            setIsThinking(true);
            const g = gameRef.current;
            workerRef.current.postMessage({
                type: 'MOVE',
                data: {
                    values: g.values,
                    metadata: g.metadata,
                    currentPlayer: g.currentPlayer,
                    redCount: g.redCount,
                    blueCount: g.blueCount,
                    zobristHash: g.zobristHash
                }
            });

            const safety = setTimeout(() => setIsThinking(current => {
                if (current) {
                    console.warn("[Main] AI Safety Timeout Triggered");
                    return false;
                }
                return false;
            }), 15000);
            return () => clearTimeout(safety);
        }
    }, [gameMode, isAnimating, updateKey]); // updateKey ensures it triggers after moves

    useEffect(() => {
        // Init AI Worker
        try {
            workerRef.current = new Worker(new URL('../logic/ai.worker.js', import.meta.url), { type: 'module' });

            workerRef.current.onmessage = (e) => {
                if (e.data.type === 'BEST_MOVE') {
                    console.log("AI Move Received:", e.data.move);
                    setIsThinking(false);
                    if (e.data.move) {
                        const { from, to } = e.data.move;
                        executeMove(from.r, from.c, to.r, to.c);
                    }
                } else if (e.data.type === 'ERROR') {
                    console.error("AI Worker Internal Error:", e.data.message, e.data.stack);
                    setIsThinking(false);
                    setHeaderTitle("AI ERROR: " + e.data.message);
                    // Fallback to local AI
                    const cpuMove = gameRef.current.aiMove();
                    if (cpuMove) executeMove(cpuMove.from.r, cpuMove.from.c, cpuMove.to.r, cpuMove.to.c);
                }
            };
            // ... (onerror handles same)

            workerRef.current.onerror = (err) => {
                console.error("AI Worker Error:", err);
                setIsThinking(false);
                setHeaderTitle("AI ERROR");
                // Fallback to local AI if worker fails
                const cpuMove = gameRef.current.aiMove();
                if (cpuMove) executeMove(cpuMove.from.r, cpuMove.from.c, cpuMove.to.r, cpuMove.to.c);
            };
        } catch (e) {
            console.error("Failed to start AI Worker:", e);
        }

        if (gameMode === 'online') {
            setupOnlineMode();
        } else if (gameMode === 'cpu') {
            setMyPlayer(CONSTANTS.PLAYER_BLUE); // Human is Blue vs CPU
            setHeaderTitle('CPU MODE');
        } else {
            setHeaderTitle('LOCAL MODE');
        }

        const handleBeforeUnload = (e) => {
            if (!gameRef.current.gameOver) {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
            if (workerRef.current) workerRef.current.terminate();
        };
    }, [executeMove, gameMode, setupOnlineMode]);

    return (
        <div id="game-container">
            <div id="board-wrapper">
                <div className="board-top-bar">
                    <button className="icon-btn" onClick={handleExit} title="Back">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="19" y1="12" x2="5" y2="12"></line>
                            <polyline points="12 19 5 12 12 5"></polyline>
                        </svg>
                    </button>
                    <div className="header-title">{headerTitle}</div>
                    <button className="icon-btn" onClick={handleRestart} title="Restart">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38" />
                        </svg>
                    </button>
                </div>

                <GameCanvas
                    game={game}
                    isOnline={isOnline}
                    myPlayer={myPlayer}
                    onMove={handleMove}
                    pendingEquations={pendingEquations}
                    isAnimating={isAnimating}
                    rotateBoard={rotateBoard}
                />

                <div id="turnBar" className={`board-bottom-bar ${game.currentPlayer === CONSTANTS.PLAYER_RED ? 'turn-red' : 'turn-blue'}`}>
                    {isThinking ? 'AI IS THINKING...' : `${game.currentPlayer === CONSTANTS.PLAYER_RED ? 'RED' : 'BLUE'}'s Turn`}
                </div>
            </div>

            <LogPanel logs={logs} />

            {/* Online Menu Modal for Host */}
            {isOnline && hostId && !network?.conn && (
                <div id="onlineMenu" className="game-modal visible">
                    <button onClick={handleExit} style={{ position: 'absolute', top: '10px', right: '10px', background: 'none', border: 'none', color: 'red', fontSize: '1.5rem', cursor: 'pointer' }}>&times;</button>
                    <h3>Online Lobby</h3>
                    <p>Waiting for opponent...</p>
                    <div style={{ margin: '1rem 0', fontSize: '0.9rem', color: '#666' }}>
                        ID: <strong style={{ color: 'var(--accent-blue)' }}>{hostId}</strong>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'green', fontWeight: 'bold' }}>Link Copied to Clipboard!</div>
                    <p style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>Share with friend to join.</p>
                </div>
            )}
        </div>
    );
};

export default GamePage;
