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

    // --- AI ---
    // Simple greedy AI
    aiMove() {
        const myMoves = this.getAllMoves(this.currentPlayer);
        if (myMoves.length === 0) return null; // Stuck?

        let bestScore = -Infinity;
        let bestMove = myMoves[Math.floor(Math.random() * myMoves.length)]; // Default random

        for (let move of myMoves) {
            // Simulate
            const score = this.evaluateMove(move);
            if (score > bestScore) {
                bestScore = score;
                bestMove = move;
            }
        }
        return bestMove;
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

    evaluateMove(move) {
        // Clone board to simulate
        // This is expensive for full depth, so for now just 1-ply lookahead (Greedy)

        // We can't easily clone entire class, so we just temporarily modify state
        const originalFrom = this.board[move.from.r][move.from.c];

        // Execute Move
        this.board[move.to.r][move.to.c] = originalFrom;
        this.board[move.from.r][move.from.c] = null;

        // Check Equations - Use resolveEquations (it's pure now, doesn't remove pieces itself)
        const results = this.resolveEquations(move.to.r, move.to.c);

        let score = 0;

        // Forward bias (encourage attacking)
        if (this.currentPlayer === CONSTANTS.PLAYER_RED) {
            score += (move.to.r - move.from.r); // Moving down is good
        } else {
            score += (move.from.r - move.to.r); // Moving up is good
        }


        // Equation potential
        if (results.length > 0) {
            results.forEach(eqResult => {
                // Check if it's Good or Bad
                const victim = eqResult.realRoots
                    ? (this.currentPlayer === CONSTANTS.PLAYER_RED ? CONSTANTS.PLAYER_BLUE : CONSTANTS.PLAYER_RED)
                    : this.currentPlayer;

                const removedCount = eqResult.removed.length;

                if (victim !== this.currentPlayer) {
                    score += 100 * removedCount; // GOOD!
                } else {
                    score -= 200 * removedCount; // BAD! Suicide!
                }
            });
        }

        // Rollback
        this.board[move.from.r][move.from.c] = originalFrom;
        this.board[move.to.r][move.to.c] = null; // Should be null usually

        return score;
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
