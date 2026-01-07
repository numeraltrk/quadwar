import { CONSTANTS } from './constants.js';

export class GameLogic {
    constructor() {
        this.board = []; // 9x8 grid
        this.currentPlayer = CONSTANTS.PLAYER_BLUE; // Blue starts
        this.selectedPiece = null;
        this.gameOver = false;
        this.winner = null;

        this.initBoard();
    }

    initBoard() {
        // Initialize empty board
        for (let r = 0; r < CONSTANTS.ROWS; r++) {
            this.board[r] = [];
            for (let c = 0; c < CONSTANTS.COLS; c++) {
                this.board[r][c] = null;
            }
        }

        // Setup Player 1 (Red) - Top
        this.setupPlayer(0, 1, 2, CONSTANTS.PLAYER_RED);

        // Setup Player 2 (Blue) - Bottom
        // Row indices for P2 are 8, 7, 6 (mirrored)
        this.setupPlayer(8, 7, 6, CONSTANTS.PLAYER_BLUE);
    }

    setupPlayer(rowQuad, rowLin, rowConst, player) {
        const terms = CONSTANTS.INITIAL_TERMS;

        // Map terms based on player orientation
        const getTerms = (arr) => player === CONSTANTS.PLAYER_RED ? [...arr].reverse() : arr;

        const setups = [
            { row: rowQuad, type: CONSTANTS.TYPE_QUADRATIC, values: getTerms(terms.QUAD) },
            { row: rowLin, type: CONSTANTS.TYPE_LINEAR, values: getTerms(terms.LIN) },
            { row: rowConst, type: CONSTANTS.TYPE_CONSTANT, values: getTerms(terms.CONST) }
        ];

        setups.forEach(setup => {
            for (let c = 0; c < 8; c++) {
                this.board[setup.row][c] = {
                    player: player,
                    type: setup.type,
                    value: setup.values[c],
                    label: this.getLabel(setup.values[c], setup.type)
                };
            }
        });
    }

    getPiece(r, c) {
        if (r < 0 || r >= CONSTANTS.ROWS || c < 0 || c >= CONSTANTS.COLS) return null;
        return this.board[r][c];
    }

    // --- Movement Logic ---

    getValidMoves(r, c) {
        const piece = this.getPiece(r, c);
        if (!piece || piece.player !== this.currentPlayer) return [];

        const moves = [];
        const directions = [
            [-1, 0], [1, 0], [0, -1], [0, 1], // Cardinal
            [-1, -1], [-1, 1], [1, -1], [1, 1] // Diagonal
        ];

        // Define movement rules based on type
        if (piece.type === CONSTANTS.TYPE_QUADRATIC) {
            // Up to 3 steps in any direction (Queen-like but limited range)
            for (let dir of directions) {
                for (let dist = 1; dist <= 3; dist++) {
                    if (this.canMoveTo(r, c, dir[0] * dist, dir[1] * dist, moves)) break; // Stop if blocked
                }
            }
        } else if (piece.type === CONSTANTS.TYPE_LINEAR) {
            // Up to 2 steps, Horizontal/Vertical ONLY
            for (let i = 0; i < 4; i++) { // First 4 are cardinal
                let dir = directions[i];
                for (let dist = 1; dist <= 2; dist++) {
                    if (this.canMoveTo(r, c, dir[0] * dist, dir[1] * dist, moves)) break;
                }
            }
        } else if (piece.type === CONSTANTS.TYPE_CONSTANT) {
            // 1 step forward ONLY
            // P1 moves "down" (+1 row), P2 moves "up" (-1 row)
            const forwardDir = (piece.player === CONSTANTS.PLAYER_RED) ? 1 : -1;
            this.canMoveTo(r, c, forwardDir, 0, moves);
        }

        return moves;
    }

    canMoveTo(r, c, dr, dc, movesList) {
        const nr = r + dr;
        const nc = c + dc;

        // Bounds check
        if (nr < 0 || nr >= CONSTANTS.ROWS || nc < 0 || nc >= CONSTANTS.COLS) return true; // "Blocked" by wall

        const target = this.board[nr][nc];

        if (target === null) {
            // Empty square - valid move
            movesList.push({ r: nr, c: nc });
            return false; // Continue exploring this direction (not blocked)
        } else {
            // Occupied - blocked
            // Cannot capture by displacement, so ANY piece blocks movement
            return true; // Stop exploring
        }
    }

    movePiece(fromR, fromC, toR, toC) {
        const piece = this.board[fromR][fromC];
        this.board[toR][toC] = piece;
        this.board[fromR][fromC] = null;

        // Check for Equations
        const results = this.resolveEquations(toR, toC);

        if (results.length > 0) {
            // Equations found! Return them so UI can animate.
            // Do NOT switch turn yet.
            return { events: results, pending: true };
        } else {
            // No equations, checks or balances. Proceed.
            this.switchTurn();
            return { events: [], pending: false };
        }
    }

    switchTurn() {
        this.currentPlayer = (this.currentPlayer === CONSTANTS.PLAYER_RED) ? CONSTANTS.PLAYER_BLUE : CONSTANTS.PLAYER_RED;
        this.checkWinCondition();
    }

    completeTurn(events) {
        // Called after animation
        if (events) {
            events.forEach(ev => this.removePieces(ev));
        }
        this.switchTurn();
    }

    // --- Equation Logic ---

    resolveEquations(r, c) {
        // Check all 4 axes passing through (r,c)
        const axes = [
            [[0, 1], [0, -1]], // Horizontal
            [[1, 0], [-1, 0]], // Vertical
            [[1, 1], [-1, -1]], // Diag \
            [[1, -1], [-1, 1]]  // Diag /
        ];

        let resolvedEvents = [];

        for (let axis of axes) {
            const chain = this.getContiguousChain(r, c, axis);
            // Equation needs at least 3 terms to form ax^2+bx+c=0 properly? 
            // Original code says >= 2. Let's stick strictly to >= 2 per previous logic, 
            // but normally you need 3 terms. But logic allows 2 terms sometimes.
            if (chain.length >= 2) {
                const eqResult = this.checkPolynomial(chain);
                if (eqResult) {
                    resolvedEvents.push(eqResult);
                }
            }
        }
        return resolvedEvents;
    }

    getContiguousChain(r, c, axisDirs) {
        let chain = [{ r, c, piece: this.board[r][c] }];

        // Scan both directions of the axis
        for (let dir of axisDirs) {
            let currR = r + dir[0];
            let currC = c + dir[1];
            while (currR >= 0 && currR < CONSTANTS.ROWS && currC >= 0 && currC < CONSTANTS.COLS) {
                const p = this.board[currR][currC];
                if (p) {
                    chain.push({ r: currR, c: currC, piece: p });
                } else {
                    break; // Gap found
                }
                currR += dir[0];
                currC += dir[1];
            }
        }
        // Sort chain to be in spatial order (optional, but good for visualization)
        // Actually, order doesn't matter for the SUM, but we need to check MIXED PLAYERS
        return chain;
    }

    checkPolynomial(chain) {
        // Rule: Chain must contain pieces from BOTH players
        const p1Count = chain.filter(i => i.piece.player === CONSTANTS.PLAYER_RED).length;
        const p2Count = chain.filter(i => i.piece.player === CONSTANTS.PLAYER_BLUE).length;

        if (p1Count === 0 || p2Count === 0) return null; // Logic check: must have both players

        // Sum terms: ax^2 + bx + c
        let a = 0, b = 0, c = 0;

        for (let item of chain) {
            const p = item.piece;
            if (p.type === CONSTANTS.TYPE_QUADRATIC) a += p.value;
            if (p.type === CONSTANTS.TYPE_LINEAR) b += p.value;
            if (p.type === CONSTANTS.TYPE_CONSTANT) c += p.value;
        }

        // Rule Update: must contain a quadratic term (a != 0)
        if (a === 0) return null;

        // Must form actual quadratic? "ax^2 + bx + c = 0"
        // If a=0, it's linear (bx+c=0). Rules imply "Polynomial expressions".
        // Let's assume standard quadratic analysis D = b^2 - 4ac.
        // Even if a=0, D = b^2 >= 0 always (Real roots).

        const delta = (b * b) - (4 * a * c);
        const hasRealRoots = delta >= 0;

        // Determine victim
        // Success (D >= 0) -> Opponent pieces removed
        // Backfire (D < 0) -> Active logic (Mover) pieces removed
        // Current player is the one who just moved.
        const victimPlayer = hasRealRoots
            ? (this.currentPlayer === CONSTANTS.PLAYER_RED ? CONSTANTS.PLAYER_BLUE : CONSTANTS.PLAYER_RED)
            : this.currentPlayer;

        const piecesToRemove = chain.filter(item => item.piece.player === victimPlayer);

        if (piecesToRemove.length === 0) return null; // No effect

        return {
            equation: this.formatEquation(a, b, c),
            delta: delta,
            realRoots: hasRealRoots,
            removed: piecesToRemove, // List of {r,c}
            chain: chain // For highlighting
        };
    }

    formatEquation(a, b, c) {
        // ax^2 + bx + c = 0
        let str = '';

        // Quad term
        if (a === 1) str += 'x²';
        else if (a === -1) str += '-x²';
        else str += `${a}x²`;

        // Linear term
        if (b > 0) {
            str += (b === 1) ? ' + x' : ` + ${b}x`;
        } else if (b < 0) {
            str += (b === -1) ? ' - x' : ` - ${Math.abs(b)}x`;
        } else {
            str += ' + 0x';
        }

        // Constant term
        if (c > 0) {
            str += ` + ${c}`;
        } else if (c < 0) {
            str += ` - ${Math.abs(c)}`;
        } else {
            str += ' + 0';
        }

        str += ' = 0';
        return str;
    }

    removePieces(result) {
        for (let item of result.removed) {
            this.board[item.r][item.c] = null;
        }
    }

    checkWinCondition() {
        let redCount = 0;
        let blueCount = 0;

        for (let r = 0; r < CONSTANTS.ROWS; r++) {
            for (let c = 0; c < CONSTANTS.COLS; c++) {
                const p = this.board[r][c];
                if (p) {
                    if (p.player === CONSTANTS.PLAYER_RED) redCount++;
                    if (p.player === CONSTANTS.PLAYER_BLUE) blueCount++;
                }
            }
        }

        if (redCount === 0) {
            this.gameOver = true;
            this.winner = CONSTANTS.PLAYER_BLUE;
        } else if (blueCount === 0) {
            this.gameOver = true;
            this.winner = CONSTANTS.PLAYER_RED;
        }
    }

    // --- AI (Minimax) ---

    aiMove() {
        const depth = 3; // Lookahead depth
        // Blue is usually the CPU in this context, but let's make it generic
        // If current player is Maximizing player.
        // We assume aiMove is called when it's the AI's turn.
        // So the AI (currentPlayer) wants to MAXIMIZE the score.

        console.log(`AI Thinking (Depth ${depth})...`);
        const result = this.minimax(depth, -Infinity, Infinity, true, this.currentPlayer);

        console.log("AI Best Move:", result);
        return result.move;
    }

    minimax(depth, alpha, beta, isMaximizing, player) {
        if (depth === 0 || this.checkWinConditionForMinimax()) {
            return { score: this.evaluateBoard(player) };
        }

        const moves = this.getAllMoves(this.currentPlayer);

        // Safety check: if no moves, game over or stuck
        if (moves.length === 0) {
            return { score: this.evaluateBoard(player) };
        }

        let bestMove = null;

        if (isMaximizing) {
            let maxEval = -Infinity;
            for (let move of moves) {
                const undoInfo = this.simulateMove(move);

                // Switch turn logic for recursion
                this.switchTurnInternal();

                const evalObj = this.minimax(depth - 1, alpha, beta, false, player);
                const evaluation = evalObj.score;

                this.undoMove(undoInfo);
                this.switchTurnInternal(); // Switch back

                if (evaluation > maxEval) {
                    maxEval = evaluation;
                    bestMove = move;
                }
                alpha = Math.max(alpha, evaluation);
                if (beta <= alpha) break; // Prune
            }
            return { score: maxEval, move: bestMove };
        } else {
            let minEval = Infinity;
            for (let move of moves) {
                const undoInfo = this.simulateMove(move);

                this.switchTurnInternal();

                const evalObj = this.minimax(depth - 1, alpha, beta, true, player);
                const evaluation = evalObj.score;

                this.undoMove(undoInfo);
                this.switchTurnInternal();

                if (evaluation < minEval) {
                    minEval = evaluation;
                    bestMove = move;
                }
                beta = Math.min(beta, evaluation);
                if (beta <= alpha) break; // Prune
            }
            return { score: minEval, move: bestMove };
        }
    }

    // Helper to switch turn without side effects (like win checks that set gameOver)
    switchTurnInternal() {
        this.currentPlayer = (this.currentPlayer === CONSTANTS.PLAYER_RED) ? CONSTANTS.PLAYER_BLUE : CONSTANTS.PLAYER_RED;
    }

    checkWinConditionForMinimax() {
        // Lightweight check just for minimax recursion
        let redCount = 0, blueCount = 0;
        for (let r = 0; r < CONSTANTS.ROWS; r++) {
            for (let c = 0; c < CONSTANTS.COLS; c++) {
                const p = this.board[r][c];
                if (p) {
                    if (p.player === CONSTANTS.PLAYER_RED) redCount++;
                    else blueCount++;
                }
            }
        }
        return redCount === 0 || blueCount === 0;
    }

    simulateMove(move) {
        // RETURN undo info: { move, captured: [], originalFrom, originalTo }
        const r1 = move.from.r, c1 = move.from.c;
        const r2 = move.to.r, c2 = move.to.c;
        const piece = this.board[r1][c1];

        // 1. Execute Geometry Move
        this.board[r2][c2] = piece;
        this.board[r1][c1] = null;

        // 2. Check Equations
        // resolveEquations is PURE, returns { removed: [...] }
        const results = this.resolveEquations(r2, c2);

        let allRemoved = [];
        if (results.length > 0) {
            results.forEach(res => {
                res.removed.forEach(item => {
                    // Store the piece so we can put it back
                    // Check if it was already removed by previous equation in chain?
                    // The 'removed' list contains {r,c, piece}
                    // We need to double check if piece is still there (could be duplicate if multiple eq intersect?)
                    if (this.board[item.r][item.c]) {
                        allRemoved.push({ r: item.r, c: item.c, piece: this.board[item.r][item.c] });
                        this.board[item.r][item.c] = null;
                    }
                });
            });
        }

        return {
            move: move,
            piece: piece,
            captured: allRemoved
        };
    }

    undoMove(info) {
        // 1. Restore Captured
        info.captured.forEach(item => {
            this.board[item.r][item.c] = item.piece;
        });

        // 2. Reverse Geometry Move
        const r1 = info.move.from.r, c1 = info.move.from.c;
        const r2 = info.move.to.r, c2 = info.move.to.c;

        this.board[r1][c1] = info.piece;
        this.board[r2][c2] = null;
    }

    evaluateBoard(aiPlayer) {
        // AI wants to MAXIMIZE this score.
        // Positive = Good for AI. Negative = Good for Opponent.

        let score = 0;
        const opponent = (aiPlayer === CONSTANTS.PLAYER_RED) ? CONSTANTS.PLAYER_BLUE : CONSTANTS.PLAYER_RED;

        for (let r = 0; r < CONSTANTS.ROWS; r++) {
            for (let c = 0; c < CONSTANTS.COLS; c++) {
                const p = this.board[r][c];
                if (!p) continue;

                let value = 0;
                // Material Value
                if (p.type === CONSTANTS.TYPE_QUADRATIC) value = 50;
                else if (p.type === CONSTANTS.TYPE_LINEAR) value = 30;
                else value = 10;

                // Position Value (Advance is good)
                // For Red (Top), increasing Row is good.
                // For Blue (Bottom), decreasing Row is good.
                let advancement = 0;
                if (p.player === CONSTANTS.PLAYER_RED) {
                    advancement = r;
                } else {
                    advancement = (CONSTANTS.ROWS - 1) - r;
                }
                value += advancement * 2; // Small bias to move forward

                if (p.player === aiPlayer) {
                    score += value;
                } else {
                    score -= value;
                }
            }
        }
        return score;
    }

    getAllMoves(player) {
        let moves = [];
        for (let r = 0; r < CONSTANTS.ROWS; r++) {
            for (let c = 0; c < CONSTANTS.COLS; c++) {
                const p = this.board[r][c];
                if (p && p.player === player) {
                    const valid = this.getValidMoves(r, c);
                    valid.forEach(dest => {
                        moves.push({ from: { r, c }, to: dest });
                    });
                }
            }
        }
        return moves;
    }

    // --- Helpers ---
    getLabel(value, type) {
        if (type === CONSTANTS.TYPE_CONSTANT) return `${value}`;

        let suffix = (type === CONSTANTS.TYPE_QUADRATIC) ? 'x²' : 'x';

        if (value === 1) return suffix;
        if (value === -1) return `-${suffix}`;
        if (value === 0) return `0${suffix}`; // Keep 0 explicit?

        return `${value}${suffix}`;
    }
}
