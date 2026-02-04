import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/landing.css';

const LandingPage = () => {
    const [showModeModal, setShowModeModal] = useState(false);
    const [showRulesModal, setShowRulesModal] = useState(false);
    const [deferredPrompt, setDeferredPrompt] = useState(null);
    const [showInstallBtn, setShowInstallBtn] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        createBackgroundElements();

        const handleBeforeInstallPrompt = (e) => {
            e.preventDefault();
            setDeferredPrompt(e);
            setShowInstallBtn(true);
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        window.addEventListener('appinstalled', () => {
            setShowInstallBtn(false);
            console.log('PWA was installed');
        });

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        };
    }, []);

    const createBackgroundElements = () => {
        const equations = ['x² - 4 = 0', '2x + 1 = 5', 'y = mx + b', 'Δ = b² - 4ac', 'f(x)', 'x → ∞'];
        const container = document.querySelector('.background-grid');
        if (!container) return;

        for (let i = 0; i < 15; i++) {
            const el = document.createElement('div');
            el.className = 'equation-bg';
            el.textContent = equations[Math.floor(Math.random() * equations.length)];
            el.style.left = `${Math.random() * 100}vw`;
            el.style.top = `${Math.random() * 100}vh`;
            el.style.opacity = Math.random() * 0.1;
            el.style.transform = `rotate(${Math.random() * 40 - 20}deg)`;
            container.appendChild(el);
        }
    };

    const handlePlayClick = () => {
        setShowModeModal(true);
    };

    const handleModeSelect = (mode) => {
        if (mode === 'online') {
            const roomId = 'qw-' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
            const joinLink = `${window.location.origin}/quadwar/game?mode=online&join=${roomId}`;

            navigator.clipboard.writeText(joinLink).then(() => {
                alert('Link Copied! Joining as Host...');
                navigate(`/game?mode=online&host=${roomId}`);
            }).catch(err => {
                console.error('Failed to copy: ', err);
                navigate(`/game?mode=online&host=${roomId}`);
            });
        } else {
            navigate(`/game?mode=${mode}`);
        }
    };

    const handleInstallClick = () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            deferredPrompt.userChoice.then((choiceResult) => {
                if (choiceResult.outcome === 'accepted') {
                    console.log('User accepted the A2HS prompt');
                }
                setDeferredPrompt(null);
                setShowInstallBtn(false);
            });
        }
    };

    return (
        <div className="landing-body">
            <div className="background-grid"></div>

            <div className="container">
                <header className="hero">
                    <p>
                        <img src="/icons/landing_image.png" alt="Quadratic War Icon" className="hero-icon" />
                    </p>
                    <h1 className="title">QUADRATIC WAR</h1>
                    <p className="subtitle">An abstract strategy game where algebra meets warfare. Form equations, eliminate enemies, and master the grid.</p>
                </header>

                <div className="cta-container">
                    <button onClick={handlePlayClick} className="play-btn btn-primary">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="5 3 19 12 5 21 5 3"></polygon>
                        </svg>
                        PLAY GAME
                    </button>
                    <button onClick={() => setShowRulesModal(true)} className="play-btn btn-secondary">HOW TO PLAY</button>
                    {showInstallBtn && (
                        <button onClick={handleInstallClick} className="play-btn btn-success">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                <polyline points="7 10 12 15 17 10"></polyline>
                                <line x1="12" y1="15" x2="12" y2="3"></line>
                            </svg>
                            INSTALL APP
                        </button>
                    )}
                </div>
            </div>

            <footer>
                &copy; 2026 Numeral Maths Club - TRKHSS Vaniyamkulam. All Rights Reserved.
            </footer>

            {/* Mode Selection Modal */}
            <div className={`modal-overlay ${showModeModal ? 'active' : ''}`} onClick={(e) => e.target.classList.contains('modal-overlay') && setShowModeModal(false)}>
                <div className="game-modes">
                    <h2 className="modal-title">Select Mode</h2>
                    <button className="mode-btn" onClick={() => handleModeSelect('local')}>
                        <span>VS Player (Local)</span>
                        <span className="arrow">→</span>
                    </button>
                    <button className="mode-btn" onClick={() => handleModeSelect('cpu')}>
                        <span>VS Computer</span>
                        <span className="arrow">→</span>
                    </button>
                    <button className="mode-btn" onClick={() => handleModeSelect('online')}>
                        <span>Online PvP</span>
                        <span className="arrow">→</span>
                    </button>
                    <div style={{ textAlign: 'center', marginTop: '2rem' }}>
                        <span style={{ fontSize: '0.8rem', color: '#666', cursor: 'pointer' }} onClick={() => setShowModeModal(false)}>Close</span>
                    </div>
                </div>
            </div>

            {/* Rules Modal */}
            <div className={`modal-overlay ${showRulesModal ? 'active' : ''}`} onClick={(e) => e.target.classList.contains('modal-overlay') && setShowRulesModal(false)}>
                <div className="game-modes rules-content">
                    <h2 className="modal-title">How to Play</h2>
                    <div className="rules-section">
                        <h3>Objective</h3>
                        <p>Form equations <strong>ax² + bx + c = 0</strong> using adjacent pieces to eliminate your opponent.</p>
                    </div>
                    <div className="rules-section">
                        <h3>Movement</h3>
                        <ul>
                            <li><strong>Quadratic (x²)</strong>: Moves 3 spaces (Diagonal/Straight).</li>
                            <li><strong>Linear (x)</strong>: Moves 2 spaces (Straight only).</li>
                            <li><strong>Constant (1)</strong>: Moves 1 space forward.</li>
                        </ul>
                    </div>
                    <div className="rules-section">
                        <h3>Resolution</h3>
                        <p>The discriminant <strong>Δ = b² - 4ac</strong> decides the outcome:</p>
                        <ul>
                            <li><span className="highlight-good">Δ ≥ 0</span> (Real Roots): Destroy opponent's pieces.</li>
                            <li><span className="highlight-bad">Δ &lt; 0</span> (Complex Roots): Your pieces backfire and are destroyed!</li>
                        </ul>
                    </div>
                    <div style={{ textAlign: 'center', marginTop: '2rem' }}>
                        <button className="play-btn small-btn" onClick={() => setShowRulesModal(false)} style={{ width: 'auto', padding: '0.8rem 2rem' }}>GOT IT</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LandingPage;
