import { CONSTANTS } from './constants.js';

export class GameLogic {
    constructor() {
        this.rows = CONSTANTS.ROWS;
        this.cols = CONSTANTS.COLS;
        this.size = this.rows * this.cols;

        // TypedArrays for board state
        this.values = new Int8Array(this.size);      // Piece value (-4 to 4)
        this.metadata = new Uint8Array(this.size);  // Bits 0-1: Player, 2-4: Type

        this.currentPlayer = CONSTANTS.PLAYER_BLUE;
        this.selectedPiece = null;
        this.gameOver = false;
        this.winner = null;
        this.redCount = 0;
        this.blueCount = 0;

        // Zobrist Hashing & Transposition Table
        this.zobristTable = new Uint32Array(this.size * 12);
        this.zobristHash = 0;
        this.transTable = new Map(); // Simple Map for hashing (state -> {score, depth, move})
        this.initZobrist();

        this.initBoard();
    }

    initZobrist() {
        // Use a simple seeded LCG for consistency across threads
        let seed = 12345;
        this.zobristTable = new Uint32Array(this.size * 54);
        for (let i = 0; i < this.zobristTable.length; i++) {
            seed = (seed * 1664525 + 1013904223) % 4294967296;
            this.zobristTable[i] = seed;
        }
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        this.zobristTurn = seed;
    }

    getZobristIndex(r, c, type, player, value) {
        const typeIdx = (type === CONSTANTS.TYPE_QUADRATIC ? 0 : type === CONSTANTS.TYPE_LINEAR ? 1 : 2);
        const playerIdx = (player === CONSTANTS.PLAYER_RED ? 0 : 1);
        const valueIdx = value + 4; // -4 maps to 0, 4 maps to 8
        return (r * this.cols + c) * 54 + (playerIdx * 27) + (typeIdx * 9) + valueIdx;
    }

    initBoard() {
        this.values.fill(0);
        this.metadata.fill(0);
        this.redCount = 0;
        this.blueCount = 0;
        this.zobristHash = 0;

        // Setup Player 1 (Red) - Top (0,1,2)
        this.setupPlayer(0, 1, 2, CONSTANTS.PLAYER_RED);
        // Setup Player 2 (Blue) - Bottom (8,7,6)
        this.setupPlayer(8, 7, 6, CONSTANTS.PLAYER_BLUE);
    }

    setupPlayer(rowQuad, rowLin, rowConst, player) {
        const terms = CONSTANTS.INITIAL_TERMS;
        const getTerms = (arr) => player === CONSTANTS.PLAYER_RED ? [...arr].reverse() : arr;

        const setups = [
            { row: rowQuad, type: CONSTANTS.TYPE_QUADRATIC, flag: CONSTANTS.FLAG_QUAD, values: getTerms(terms.QUAD) },
            { row: rowLin, type: CONSTANTS.TYPE_LINEAR, flag: CONSTANTS.FLAG_LIN, values: getTerms(terms.LIN) },
            { row: rowConst, type: CONSTANTS.TYPE_CONSTANT, flag: CONSTANTS.FLAG_CONST, values: getTerms(terms.CONST) }
        ];

        setups.forEach(setup => {
            for (let c = 0; c < this.cols; c++) {
                const idx = setup.row * this.cols + c;
                this.values[idx] = setup.values[c];
                this.metadata[idx] = (player === CONSTANTS.PLAYER_RED ? CONSTANTS.FLAG_RED : CONSTANTS.FLAG_BLUE) | setup.flag;

                this.zobristHash ^= this.zobristTable[this.getZobristIndex(setup.row, c, setup.type, player, this.values[idx])];

                if (player === CONSTANTS.PLAYER_RED) this.redCount++;
                else this.blueCount++;
            }
        });
    }

    // Helper for UI/Legacy access
    get board() {
        const b = [];
        for (let r = 0; r < this.rows; r++) {
            b[r] = [];
            for (let c = 0; c < this.cols; c++) {
                b[r][c] = this.getPiece(r, c);
            }
        }
        return b;
    }

    getPiece(r, c) {
        if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return null;
        const idx = r * this.cols + c;
        const meta = this.metadata[idx];
        if (meta === 0) return null;

        const player = meta & CONSTANTS.MASK_PLAYER;
        const typeFlag = meta & CONSTANTS.MASK_TYPE;
        const type = typeFlag === CONSTANTS.FLAG_QUAD ? CONSTANTS.TYPE_QUADRATIC :
            typeFlag === CONSTANTS.FLAG_LIN ? CONSTANTS.TYPE_LINEAR : CONSTANTS.TYPE_CONSTANT;

        return {
            player,
            type,
            value: this.values[idx],
            label: this.getLabel(this.values[idx], type)
        };
    }

    getValidMoves(r, c) {
        const idx = r * this.cols + c;
        const meta = this.metadata[idx];
        if (meta === 0 || (meta & CONSTANTS.MASK_PLAYER) !== this.currentPlayer) return [];

        const typeFlag = meta & CONSTANTS.MASK_TYPE;
        const player = meta & CONSTANTS.MASK_PLAYER;
        const moves = [];
        const directions = [
            [-1, 0], [1, 0], [0, -1], [0, 1],
            [-1, -1], [-1, 1], [1, -1], [1, 1]
        ];

        if (typeFlag === CONSTANTS.FLAG_QUAD) {
            for (let dir of directions) {
                for (let dist = 1; dist <= 3; dist++) {
                    if (this.canMoveTo(r, c, dir[0] * dist, dir[1] * dist, moves)) break;
                }
            }
        } else if (typeFlag === CONSTANTS.FLAG_LIN) {
            for (let i = 0; i < 4; i++) {
                let dir = directions[i];
                for (let dist = 1; dist <= 2; dist++) {
                    if (this.canMoveTo(r, c, dir[0] * dist, dir[1] * dist, moves)) break;
                }
            }
        } else if (typeFlag === CONSTANTS.FLAG_CONST) {
            const forwardDir = (player === CONSTANTS.PLAYER_RED) ? 1 : -1;
            this.canMoveTo(r, c, forwardDir, 0, moves);
        }

        return moves;
    }

    canMoveTo(r, c, dr, dc, movesList) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr >= this.rows || nc < 0 || nc >= this.cols) return true;

        if (this.metadata[nr * this.cols + nc] === 0) {
            movesList.push({ r: nr, c: nc });
            return false;
        }
        return true;
    }

    movePiece(fromR, fromC, toR, toC) {
        const fromIdx = fromR * this.cols + fromC;
        const toIdx = toR * this.cols + toC;

        const value = this.values[fromIdx];
        const meta = this.metadata[fromIdx];
        const player = meta & CONSTANTS.MASK_PLAYER;
        const typeFlag = meta & CONSTANTS.MASK_TYPE;
        const type = typeFlag === CONSTANTS.FLAG_QUAD ? CONSTANTS.TYPE_QUADRATIC :
            typeFlag === CONSTANTS.FLAG_LIN ? CONSTANTS.TYPE_LINEAR : CONSTANTS.TYPE_CONSTANT;

        // Update Zobrist Hash (Remove from old, add to new)
        this.zobristHash ^= this.zobristTable[this.getZobristIndex(fromR, fromC, type, player, value)];
        this.zobristHash ^= this.zobristTable[this.getZobristIndex(toR, toC, type, player, value)];

        this.values[toIdx] = value;
        this.metadata[toIdx] = meta;
        this.values[fromIdx] = 0;
        this.metadata[fromIdx] = 0;

        const results = this.resolveEquations(toR, toC);
        this.selectedPiece = null;

        if (results.length > 0) {
            return { events: results, pending: true };
        } else {
            this.switchTurn();
            return { events: [], pending: false };
        }
    }

    switchTurn() {
        this.currentPlayer = (this.currentPlayer === CONSTANTS.PLAYER_RED) ? CONSTANTS.PLAYER_BLUE : CONSTANTS.PLAYER_RED;
        this.zobristHash ^= this.zobristTurn;
        this.checkWinCondition();
    }

    completeTurn(events) {
        if (events) {
            events.forEach(ev => this.removePieces(ev));
        }
        this.switchTurn();
    }

    resolveEquations(r, c) {
        const axes = [
            [[0, 1], [0, -1]], [[1, 0], [-1, 0]],
            [[1, 1], [-1, -1]], [[1, -1], [-1, 1]]
        ];
        let resolvedEvents = [];
        for (let axis of axes) {
            const chain = this.getContiguousChain(r, c, axis);
            if (chain.length >= 2) {
                const eqResult = this.checkPolynomial(chain);
                if (eqResult) resolvedEvents.push(eqResult);
            }
        }
        return resolvedEvents;
    }

    getContiguousChain(r, c, axisDirs) {
        let chain = [{ r, c, piece: this.getPiece(r, c) }];
        for (let dir of axisDirs) {
            let currR = r + dir[0], currC = c + dir[1];
            while (currR >= 0 && currR < this.rows && currC >= 0 && currC < this.cols) {
                const p = this.getPiece(currR, currC);
                if (p) {
                    chain.push({ r: currR, c: currC, piece: p });
                    currR += dir[0]; currC += dir[1];
                } else break;
            }
        }
        return chain;
    }

    checkPolynomial(chain) {
        let p1Count = 0, p2Count = 0;
        let a = 0, b = 0, c = 0;

        for (let item of chain) {
            const p = item.piece;
            if (!p) continue; // Defensive check
            if (p.player === CONSTANTS.PLAYER_RED) p1Count++;
            else p2Count++;

            if (p.type === CONSTANTS.TYPE_QUADRATIC) a += p.value;
            else if (p.type === CONSTANTS.TYPE_LINEAR) b += p.value;
            else c += p.value;
        }

        if (p1Count === 0 || p2Count === 0 || a === 0) return null;

        const delta = (b * b) - (4 * a * c);
        const hasRealRoots = delta >= 0;
        const victimPlayer = hasRealRoots ? (this.currentPlayer === CONSTANTS.PLAYER_RED ? CONSTANTS.PLAYER_BLUE : CONSTANTS.PLAYER_RED) : this.currentPlayer;
        const piecesToRemove = chain.filter(item => item.piece && item.piece.player === victimPlayer);

        if (piecesToRemove.length === 0) return null;

        return {
            equation: this.formatEquation(a, b, c),
            delta: delta,
            realRoots: hasRealRoots,
            removed: piecesToRemove,
            chain: chain
        };
    }

    formatEquation(a, b, c) {
        const formatTerm = (val, term) => {
            if (val === 0) return '';
            const sign = val > 0 ? ' + ' : ' - ';
            const absVal = Math.abs(val);
            let displayVal = absVal === 1 && term !== '' ? '' : absVal;
            return `${sign}${displayVal}${term}`;
        };
        let str = (a === 1) ? 'x²' : (a === -1) ? '-x²' : `${a}x²`;
        str += formatTerm(b, 'x');
        str += formatTerm(c, '');
        return `${str === '' ? '0' : str} = 0`.replace(/^ \+ /, '');
    }

    removePieces(result) {
        for (let item of result.removed) {
            const idx = item.r * this.cols + item.c;
            const meta = this.metadata[idx];
            if (meta) {
                const p = meta & CONSTANTS.MASK_PLAYER;
                const typeFlag = meta & CONSTANTS.MASK_TYPE;
                const type = typeFlag === CONSTANTS.FLAG_QUAD ? CONSTANTS.TYPE_QUADRATIC :
                    typeFlag === CONSTANTS.FLAG_LIN ? CONSTANTS.TYPE_LINEAR : CONSTANTS.TYPE_CONSTANT;

                this.zobristHash ^= this.zobristTable[this.getZobristIndex(item.r, item.c, type, p, this.values[idx])];

                if (p === CONSTANTS.PLAYER_RED) this.redCount--;
                else this.blueCount--;
                this.values[idx] = 0;
                this.metadata[idx] = 0;
            }
        }
    }

    checkWinCondition() {
        if (this.redCount === 0) { this.gameOver = true; this.winner = CONSTANTS.PLAYER_BLUE; }
        else if (this.blueCount === 0) { this.gameOver = true; this.winner = CONSTANTS.PLAYER_RED; }
    }

    // --- AI Thinking ---
    aiMove() {
        const depth = 3;
        const result = this.minimax(depth, -Infinity, Infinity, true, this.currentPlayer);
        return result.move;
    }

    minimax(depth, alpha, beta, isMaximizing, player) {
        // Transposition Table Lookup
        const entry = this.transTable.get(this.zobristHash);
        if (entry && entry.depth >= depth) {
            if (entry.flag === 'EXACT') return entry;
            if (entry.flag === 'LOWER' && entry.score >= beta) return entry;
            if (entry.flag === 'UPPER' && entry.score <= alpha) return entry;
        }

        if (depth === 0 || this.redCount === 0 || this.blueCount === 0) {
            return { score: this.evaluateBoard(player) };
        }

        const moves = this.getAllMoves(this.currentPlayer);
        if (moves.length === 0) return { score: this.evaluateBoard(player) };

        let bestMove = null;
        if (isMaximizing) {
            let maxEval = -Infinity;
            let originalAlpha = alpha;
            for (let move of moves) {
                const undoInfo = this.simulateMove(move);
                this.currentPlayer = (this.currentPlayer === CONSTANTS.PLAYER_RED) ? CONSTANTS.PLAYER_BLUE : CONSTANTS.PLAYER_RED;
                this.zobristHash ^= this.zobristTurn;
                const evaluation = this.minimax(depth - 1, alpha, beta, false, player).score;
                this.undoMove(undoInfo);
                this.currentPlayer = (this.currentPlayer === CONSTANTS.PLAYER_RED) ? CONSTANTS.PLAYER_BLUE : CONSTANTS.PLAYER_RED;
                this.zobristHash ^= this.zobristTurn;
                if (evaluation > maxEval) { maxEval = evaluation; bestMove = move; }
                alpha = Math.max(alpha, evaluation);
                if (beta <= alpha) break;
            }
            let flag = 'EXACT';
            if (maxEval <= originalAlpha) flag = 'UPPER';
            else if (maxEval >= beta) flag = 'LOWER';
            const result = { score: maxEval, move: bestMove, depth, flag };
            this.transTable.set(this.zobristHash, result);
            return result;
        } else {
            let minEval = Infinity;
            let originalBeta = beta;
            for (let move of moves) {
                const undoInfo = this.simulateMove(move);
                this.currentPlayer = (this.currentPlayer === CONSTANTS.PLAYER_RED) ? CONSTANTS.PLAYER_BLUE : CONSTANTS.PLAYER_RED;
                this.zobristHash ^= this.zobristTurn;
                const evaluation = this.minimax(depth - 1, alpha, beta, true, player).score;
                this.undoMove(undoInfo);
                this.currentPlayer = (this.currentPlayer === CONSTANTS.PLAYER_RED) ? CONSTANTS.PLAYER_BLUE : CONSTANTS.PLAYER_RED;
                this.zobristHash ^= this.zobristTurn;
                if (evaluation < minEval) { minEval = evaluation; bestMove = move; }
                beta = Math.min(beta, evaluation);
                if (beta <= alpha) break;
            }
            let flag = 'EXACT';
            if (minEval >= originalBeta) flag = 'LOWER';
            else if (minEval <= alpha) flag = 'UPPER';
            const result = { score: minEval, move: bestMove, depth, flag };
            this.transTable.set(this.zobristHash, result);
            return result;
        }
    }

    simulateMove(move) {
        const fromR = move.from.r, fromC = move.from.c, toR = move.to.r, toC = move.to.c;
        const fromIdx = fromR * this.cols + fromC, toIdx = toR * this.cols + toC;
        const value = this.values[fromIdx], meta = this.metadata[fromIdx];
        const player = meta & CONSTANTS.MASK_PLAYER;
        const typeFlag = meta & CONSTANTS.MASK_TYPE;
        const type = typeFlag === CONSTANTS.FLAG_QUAD ? CONSTANTS.TYPE_QUADRATIC : typeFlag === CONSTANTS.FLAG_LIN ? CONSTANTS.TYPE_LINEAR : CONSTANTS.TYPE_CONSTANT;

        const captured = [];

        // Update hash: remove from old, add to new
        this.zobristHash ^= this.zobristTable[this.getZobristIndex(fromR, fromC, type, player, value)];
        this.zobristHash ^= this.zobristTable[this.getZobristIndex(toR, toC, type, player, value)];

        this.values[toIdx] = value; this.metadata[toIdx] = meta;
        this.values[fromIdx] = 0; this.metadata[fromIdx] = 0;

        const results = this.resolveEquations(toR, toC);
        if (results.length > 0) {
            results.forEach(res => {
                res.removed.forEach(item => {
                    const idx = item.r * this.cols + item.c;
                    const pMeta = this.metadata[idx];
                    if (pMeta) {
                        const pP = pMeta & CONSTANTS.MASK_PLAYER;
                        const pTFlag = pMeta & CONSTANTS.MASK_TYPE;
                        const pT = pTFlag === CONSTANTS.FLAG_QUAD ? CONSTANTS.TYPE_QUADRATIC : pTFlag === CONSTANTS.FLAG_LIN ? CONSTANTS.TYPE_LINEAR : CONSTANTS.TYPE_CONSTANT;

                        captured.push({ r: item.r, c: item.c, value: this.values[idx], metadata: pMeta, type: pT, player: pP });

                        // Update hash: remove captured piece
                        this.zobristHash ^= this.zobristTable[this.getZobristIndex(item.r, item.c, pT, pP, this.values[idx])];

                        if (pP === CONSTANTS.PLAYER_RED) this.redCount--; else this.blueCount--;
                        this.values[idx] = 0; this.metadata[idx] = 0;
                    }
                });
            });
        }
        return { move, value, metadata: meta, captured, type, player };
    }

    undoMove(info) {
        // 1. Restore Captured
        info.captured.forEach(item => {
            const idx = item.r * this.cols + item.c;
            this.values[idx] = item.value; this.metadata[idx] = item.metadata;
            // Restore hash
            this.zobristHash ^= this.zobristTable[this.getZobristIndex(item.r, item.c, item.type, item.player, item.value)];
            if ((item.metadata & CONSTANTS.MASK_PLAYER) === CONSTANTS.FLAG_RED) this.redCount++; else this.blueCount++;
        });

        // 2. Undo Move
        const fromR = info.move.from.r, fromC = info.move.from.c, toR = info.move.to.r, toC = info.move.to.c;
        const fromIdx = fromR * this.cols + fromC;
        const toIdx = toR * this.cols + toC;

        // Restore hash
        this.zobristHash ^= this.zobristTable[this.getZobristIndex(toR, toC, info.type, info.player, info.value)];
        this.zobristHash ^= this.zobristTable[this.getZobristIndex(fromR, fromC, info.type, info.player, info.value)];

        this.values[fromIdx] = info.value; this.metadata[fromIdx] = info.metadata;
        this.values[toIdx] = 0; this.metadata[toIdx] = 0;
    }

    evaluateBoard(aiPlayer) {
        let score = 0;
        for (let r = 0, i = 0; r < this.rows; r++) {
            const redBonus = r * 2;
            const blueBonus = (this.rows - 1 - r) * 2;
            for (let c = 0; c < this.cols; c++, i++) {
                const meta = this.metadata[i];
                if (meta === 0) continue;
                const player = meta & CONSTANTS.MASK_PLAYER;
                const typeFlag = meta & CONSTANTS.MASK_TYPE;
                let val = typeFlag === CONSTANTS.FLAG_QUAD ? 50 : typeFlag === CONSTANTS.FLAG_LIN ? 30 : 10;
                val += (player === CONSTANTS.PLAYER_RED ? redBonus : blueBonus);
                if (player === aiPlayer) score += val; else score -= val;
            }
        }
        return score;
    }

    getAllMoves(player) {
        let moves = [];
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const idx = r * this.cols + c;
                if ((this.metadata[idx] & CONSTANTS.MASK_PLAYER) === player) {
                    const valid = this.getValidMoves(r, c);
                    valid.forEach(dest => {
                        const move = { from: { r, c }, to: dest };
                        move.score = this.scoreMove(move);
                        moves.push(move);
                    });
                }
            }
        }
        return moves.sort((a, b) => b.score - a.score);
    }

    scoreMove(move) {
        const fromIdx = move.from.r * this.cols + move.from.c;
        const toIdx = move.to.r * this.cols + move.to.c;

        const oldFromV = this.values[fromIdx];
        const oldFromM = this.metadata[fromIdx];
        const oldToV = this.values[toIdx];
        const oldToM = this.metadata[toIdx];

        // Temporary Move for Evaluation
        this.values[toIdx] = oldFromV;
        this.metadata[toIdx] = oldFromM;
        this.values[fromIdx] = 0;
        this.metadata[fromIdx] = 0;

        const results = this.resolveEquations(move.to.r, move.to.c);

        // Restore State
        this.values[fromIdx] = oldFromV;
        this.metadata[fromIdx] = oldFromM;
        this.values[toIdx] = oldToV;
        this.metadata[toIdx] = oldToM;

        let score = 0;
        results.forEach(res => score += (res.realRoots ? 10 : -10) * res.removed.length);
        return score;
    }

    getLabel(value, type) {
        if (type === CONSTANTS.TYPE_CONSTANT) return `${value}`;
        let suffix = (type === CONSTANTS.TYPE_QUADRATIC) ? 'x²' : 'x';
        if (value === 1) return suffix;
        if (value === -1) return `-${suffix}`;
        return `${value}${suffix}`;
    }
}
