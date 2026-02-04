import { GameLogic } from './logic';

let game = new GameLogic();

onmessage = (e) => {
    try {
        if (e.data.type === 'MOVE') {
            const { values, metadata, currentPlayer, redCount, blueCount, zobristHash } = e.data.data;

            // Sync internal state
            game.values.set(values);
            game.metadata.set(metadata);
            game.currentPlayer = currentPlayer;
            game.redCount = redCount;
            game.blueCount = blueCount;
            game.zobristHash = zobristHash;
            game.transTable.clear();

            // Search parameters
            const depth = 3;
            const startTime = performance.now();
            console.log(`[Worker] Started search at depth ${depth} for player ${currentPlayer}...`);

            const result = game.minimax(depth, -Infinity, Infinity, true, currentPlayer);
            const duration = performance.now() - startTime;

            console.log(`[Worker] Best move found in ${duration.toFixed(2)}ms:`, result.move);
            postMessage({ type: 'BEST_MOVE', move: result.move });
        }
    } catch (err) {
        console.error("[Worker] CRASH:", err);
        postMessage({ type: 'ERROR', message: err.message, stack: err.stack });
    }
};
