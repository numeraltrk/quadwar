import React, { useRef, useEffect, memo } from 'react';
import { CONSTANTS } from '../logic/constants';

const GameCanvas = memo(({ game, isOnline, myPlayer, onMove, pendingEquations, isAnimating, rotateBoard }) => {
    const canvasRef = useRef(null);
    const offscreenRef = useRef(null);

    // Pre-render the static background (board + grid)
    useEffect(() => {
        if (!offscreenRef.current) {
            offscreenRef.current = document.createElement('canvas');
        }
        const dpr = window.devicePixelRatio || 1;
        const offscreen = offscreenRef.current;
        offscreen.width = CONSTANTS.COLS * CONSTANTS.TILE_SIZE * dpr;
        offscreen.height = CONSTANTS.ROWS * CONSTANTS.TILE_SIZE * dpr;
        const octx = offscreen.getContext('2d');
        octx.setTransform(dpr, 0, 0, dpr, 0, 0);

        // Draw Checkerboard
        for (let r = 0; r < CONSTANTS.ROWS; r++) {
            for (let c = 0; c < CONSTANTS.COLS; c++) {
                // Ensure parity is consistent even with rotation for non-square boards
                // We use the logical coordinates r, c to determine the absolute "Dark/Light" 
                // but when drawing background, we draw relative to the current view.
                let logicR = r, logicC = c;
                if (rotateBoard) {
                    logicR = CONSTANTS.ROWS - 1 - r;
                    logicC = CONSTANTS.COLS - 1 - c;
                }
                const isDark = (logicR + logicC) % 2 === 1;
                octx.fillStyle = isDark ? CONSTANTS.COLOR_BOARD_DARK : CONSTANTS.COLOR_BOARD_LIGHT;
                octx.fillRect(c * CONSTANTS.TILE_SIZE, r * CONSTANTS.TILE_SIZE, CONSTANTS.TILE_SIZE, CONSTANTS.TILE_SIZE);
            }
        }

        // Draw Grid lines
        octx.lineWidth = 1;
        octx.strokeStyle = CONSTANTS.COLOR_GRID;
        const totalWidth = CONSTANTS.COLS * CONSTANTS.TILE_SIZE;
        const totalHeight = CONSTANTS.ROWS * CONSTANTS.TILE_SIZE;

        for (let r = 0; r <= CONSTANTS.ROWS; r++) {
            octx.beginPath();
            octx.moveTo(0, r * CONSTANTS.TILE_SIZE);
            octx.lineTo(totalWidth, r * CONSTANTS.TILE_SIZE);
            octx.stroke();
        }
        for (let c = 0; c <= CONSTANTS.COLS; c++) {
            octx.beginPath();
            octx.moveTo(c * CONSTANTS.TILE_SIZE, 0);
            octx.lineTo(c * CONSTANTS.TILE_SIZE, totalHeight);
            octx.stroke();
        }
    }, [rotateBoard]); // Re-render background if board rotates

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;

        // Match CSS size to canvas size
        canvas.width = CONSTANTS.COLS * CONSTANTS.TILE_SIZE * dpr;
        canvas.height = CONSTANTS.ROWS * CONSTANTS.TILE_SIZE * dpr;
        canvas.style.width = `${CONSTANTS.COLS * CONSTANTS.TILE_SIZE}px`;
        canvas.style.height = `${CONSTANTS.ROWS * CONSTANTS.TILE_SIZE}px`;

        ctx.scale(dpr, dpr);

        let animationFrameId;

        const render = () => {
            // 1. Draw Pre-rendered Background
            if (offscreenRef.current) {
                // Draw at logical size (since ctx is already scaled by dpr)
                ctx.drawImage(offscreenRef.current, 0, 0, CONSTANTS.COLS * CONSTANTS.TILE_SIZE, CONSTANTS.ROWS * CONSTANTS.TILE_SIZE);
            }

            // 2. Highlight Selected & Valid Moves
            if (game.selectedPiece) {
                const { r, c } = game.selectedPiece;
                let drawR = r, drawC = c;
                if (rotateBoard) {
                    drawR = CONSTANTS.ROWS - 1 - r;
                    drawC = CONSTANTS.COLS - 1 - c;
                }

                ctx.fillStyle = CONSTANTS.COLOR_HIGHLIGHT;
                ctx.fillRect(drawC * CONSTANTS.TILE_SIZE, drawR * CONSTANTS.TILE_SIZE, CONSTANTS.TILE_SIZE, CONSTANTS.TILE_SIZE);

                const moves = game.getValidMoves(r, c);
                ctx.fillStyle = CONSTANTS.COLOR_VALID_MOVE;
                for (let m of moves) {
                    let mDrawR = m.r, mDrawC = m.c;
                    if (rotateBoard) {
                        mDrawR = CONSTANTS.ROWS - 1 - m.r;
                        mDrawC = CONSTANTS.COLS - 1 - m.c;
                    }
                    ctx.fillRect(mDrawC * CONSTANTS.TILE_SIZE, mDrawR * CONSTANTS.TILE_SIZE, CONSTANTS.TILE_SIZE, CONSTANTS.TILE_SIZE);
                }
            }

            // 3. Draw Pending Equation Highlights
            if (pendingEquations) {
                pendingEquations.forEach(eq => {
                    ctx.strokeStyle = '#ffd700';
                    ctx.lineWidth = 3;
                    ctx.shadowBlur = 10;
                    ctx.shadowColor = '#ffd700';

                    eq.chain.forEach(item => {
                        let r = item.r, c = item.c;
                        if (rotateBoard) {
                            r = CONSTANTS.ROWS - 1 - r;
                            c = CONSTANTS.COLS - 1 - c;
                        }
                        ctx.strokeRect(c * CONSTANTS.TILE_SIZE, r * CONSTANTS.TILE_SIZE, CONSTANTS.TILE_SIZE, CONSTANTS.TILE_SIZE);
                    });

                    ctx.shadowBlur = 0; // Reset shadow immediately after chain

                    eq.removed.forEach(item => {
                        let r = item.r, c = item.c;
                        if (rotateBoard) {
                            r = CONSTANTS.ROWS - 1 - r;
                            c = CONSTANTS.COLS - 1 - c;
                        }

                        const x = c * CONSTANTS.TILE_SIZE;
                        const y = r * CONSTANTS.TILE_SIZE;

                        ctx.fillStyle = `rgba(255, 0, 0, ${0.3 + Math.sin(Date.now() / 100) * 0.2})`;
                        ctx.fillRect(x, y, CONSTANTS.TILE_SIZE, CONSTANTS.TILE_SIZE);

                        ctx.beginPath();
                        ctx.strokeStyle = 'red';
                        ctx.lineWidth = 4;
                        ctx.moveTo(x + 10, y + 10);
                        ctx.lineTo(x + CONSTANTS.TILE_SIZE - 10, y + CONSTANTS.TILE_SIZE - 10);
                        ctx.moveTo(x + CONSTANTS.TILE_SIZE - 10, y + 10);
                        ctx.lineTo(x + 10, y + CONSTANTS.TILE_SIZE - 10);
                        ctx.stroke();
                    });
                });
            }

            // 4. Draw Pieces
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = 'bold 16px monospace';

            for (let r = 0; r < CONSTANTS.ROWS; r++) {
                for (let c = 0; c < CONSTANTS.COLS; c++) {
                    const idx = r * CONSTANTS.COLS + c;
                    const meta = game.metadata[idx];
                    if (meta === 0) continue;

                    let drawR = r, drawC = c;
                    if (rotateBoard) {
                        drawR = CONSTANTS.ROWS - 1 - r;
                        drawC = CONSTANTS.COLS - 1 - c;
                    }

                    const x = drawC * CONSTANTS.TILE_SIZE + CONSTANTS.TILE_SIZE / 2;
                    const y = drawR * CONSTANTS.TILE_SIZE + CONSTANTS.TILE_SIZE / 2;

                    const player = meta & CONSTANTS.MASK_PLAYER;
                    const val = game.values[idx];
                    const typeFlag = meta & CONSTANTS.MASK_TYPE;
                    const type = typeFlag === CONSTANTS.FLAG_QUAD ? CONSTANTS.TYPE_QUADRATIC :
                        typeFlag === CONSTANTS.FLAG_LIN ? CONSTANTS.TYPE_LINEAR : CONSTANTS.TYPE_CONSTANT;
                    const label = game.getLabel(val, type);

                    ctx.fillStyle = player === CONSTANTS.PLAYER_RED ? CONSTANTS.COLOR_RED : CONSTANTS.COLOR_BLUE;
                    ctx.beginPath();
                    ctx.arc(x, y, 25, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.fillStyle = '#fff';
                    ctx.fillText(label, x, y);
                }
            }
            animationFrameId = requestAnimationFrame(render);
        };

        render();

        return () => {
            cancelAnimationFrame(animationFrameId);
        };
    }, [game, rotateBoard, pendingEquations]);

    const handleInput = (e) => {
        if (game.gameOver || isAnimating) return;
        if (isOnline && game.currentPlayer !== myPlayer) return;

        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();

        // Use logical coordinates (CSS pixels) for grid calculation
        const x = (e.clientX - rect.left);
        const y = (e.clientY - rect.top);

        // Calculate based on the actual displayed size vs logical grid
        let col = Math.floor(x / (rect.width / CONSTANTS.COLS));
        let row = Math.floor(y / (rect.height / CONSTANTS.ROWS));

        if (rotateBoard) {
            col = CONSTANTS.COLS - 1 - col;
            row = CONSTANTS.ROWS - 1 - row;
        }

        onMove(row, col);
    };

    return (
        <canvas
            ref={canvasRef}
            onClick={handleInput}
            id="gameCanvas"
        />
    );
});

export default GameCanvas;
