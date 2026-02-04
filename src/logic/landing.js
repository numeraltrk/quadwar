document.addEventListener('DOMContentLoaded', () => {
    const playBtn = document.getElementById('playBtn');
    const modalOverlay = document.getElementById('modalOverlay');
    const closeModal = document.getElementById('closeModal');
    const modeButtons = document.querySelectorAll('.mode-btn');

    // Open Modal
    playBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        // Add small delay to prevent ghost clicks on mobile (tap passing through to buttons below)
        setTimeout(() => {
            modalOverlay.classList.add('active');
        }, 100);
    });

    // Close Modal on clicking outside
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) {
            modalOverlay.classList.remove('active');
        }
    });

    // Rules Modal Logic
    const rulesBtn = document.getElementById('rulesBtn');
    const rulesModal = document.getElementById('rulesModal');
    const closeRulesBtn = document.getElementById('closeRulesBtn');

    if (rulesBtn) {
        rulesBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            setTimeout(() => {
                rulesModal.classList.add('active');
            }, 100);
        });
    }

    if (closeRulesBtn) {
        closeRulesBtn.addEventListener('click', () => {
            rulesModal.classList.remove('active');
        });
    }

    if (rulesModal) {
        rulesModal.addEventListener('click', (e) => {
            if (e.target === rulesModal) {
                rulesModal.classList.remove('active');
            }
        });
    }

    // Handle Mode Selection
    modeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const mode = btn.dataset.mode;
            navigateToGame(mode);
        });
    });

    function navigateToGame(mode) {
        if (mode === 'online') {
            // Generate Room ID
            const roomId = 'qw-' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
            const joinLink = `${window.location.origin}${window.location.pathname.replace('index.html', '')}game.html?mode=online&join=${roomId}`;

            // Copy to Clipboard
            navigator.clipboard.writeText(joinLink).then(() => {
                // Navigate as Host
                const btn = document.querySelector('.mode-btn[data-mode="online"]');
                const originalText = btn.innerHTML;
                btn.innerHTML = `<span style="color:green; font-weight:bold;">Link Copied! Joining...</span>`;

                setTimeout(() => {
                    window.location.href = `game.html?mode=online&host=${roomId}`;
                }, 1000);
            }).catch(err => {
                console.error('Failed to copy: ', err);
                // Fallback navigation
                window.location.href = `game.html?mode=online&host=${roomId}`;
            });
        } else {
            window.location.href = `game.html?mode=${mode}`;
        }
    }

    // Add some random floating equations for background
    createBackgroundElements();

    // PWA Install Logic
    let deferredPrompt;
    const installBtn = document.getElementById('installBtn');

    window.addEventListener('beforeinstallprompt', (e) => {
        // Prevent Chrome 67 and earlier from automatically showing the prompt
        e.preventDefault();
        // Stash the event so it can be triggered later.
        deferredPrompt = e;
        // Update UI to notify the user they can add to home screen
        installBtn.style.display = 'inline-flex';
    });

    installBtn.addEventListener('click', (e) => {
        // Hide our user interface that shows our A2HS button
        installBtn.style.display = 'none';
        // Show the prompt
        deferredPrompt.prompt();
        // Wait for the user to respond to the prompt
        deferredPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
                console.log('User accepted the A2HS prompt');
            } else {
                console.log('User dismissed the A2HS prompt');
            }
            deferredPrompt = null;
        });
    });

    window.addEventListener('appinstalled', () => {
        // Hide the app-provided install promotion
        installBtn.style.display = 'none';
        console.log('PWA was installed');
    });
});

function createBackgroundElements() {
    const equations = ['x² - 4 = 0', '2x + 1 = 5', 'y = mx + b', 'Δ = b² - 4ac', 'f(x)', 'x → ∞'];
    const container = document.body;

    for (let i = 0; i < 15; i++) {
        const el = document.createElement('div');
        el.className = 'equation-bg';
        el.textContent = equations[Math.floor(Math.random() * equations.length)];

        // Random position
        el.style.left = `${Math.random() * 100}vw`;
        el.style.top = `${Math.random() * 100}vh`;
        el.style.opacity = Math.random() * 0.1;
        el.style.transform = `rotate(${Math.random() * 40 - 20}deg)`;

        container.appendChild(el);
    }
}
