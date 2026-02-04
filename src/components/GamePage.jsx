import React, { useState, useEffect, useCallback, useRef } from 'react';
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

    const forceUpdate = useCallback(() => {
        setUpdateKey(prev => prev + 1);
    }, []);

    useEffect(() => {
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
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, []);

    const setupOnlineMode = () => {
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
    };

    const executeMove = (fromR, fromC, toR, toC) => {
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
                checkCpuTurn();
            }, 2000);
        } else {
            forceUpdate();
            checkGameOver();
            checkCpuTurn();
        }
    };

    const handleMove = (row, col) => {
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
    };

    const checkGameOver = () => {
        if (gameRef.current.gameOver) {
            alert("GAME OVER! Winner: " + (gameRef.current.winner === CONSTANTS.PLAYER_RED ? "Red" : "Blue"));
        }
    };

    const checkCpuTurn = () => {
        if (gameMode === 'cpu' && gameRef.current.currentPlayer === CONSTANTS.PLAYER_RED && !gameRef.current.gameOver && !isAnimating) {
            setTimeout(() => {
                const cpuMove = gameRef.current.aiMove();
                if (cpuMove) {
                    executeMove(cpuMove.from.r, cpuMove.from.c, cpuMove.to.r, cpuMove.to.c);
                } else {
                    gameRef.current.currentPlayer = CONSTANTS.PLAYER_RED;
                    forceUpdate();
                }
            }, 500);
        }
    };

    const handleRestart = () => {
        if (window.confirm("Are you sure you want to restart? Current game progress will be lost.")) {
            if (isOnline && network) {
                network.sendMessage('RESTART', {});
            }
            window.location.reload();
        }
    };

    const handleExit = () => {
        if (window.confirm("Are you sure you want to return to the menu? Current game progress will be lost.")) {
            navigate('/');
        }
    };

    const rotateBoard = isOnline && myPlayer === CONSTANTS.PLAYER_RED;

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
                    {game.currentPlayer === CONSTANTS.PLAYER_RED ? 'RED' : 'BLUE'}'s Turn
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
