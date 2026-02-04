import React from 'react';
import { CONSTANTS } from '../logic/constants';

const LogPanel = ({ logs }) => {
    return (
        <div className="sidebar">
            <div style={{ marginBottom: '0.5rem', fontWeight: 'bold', color: 'var(--accent-blue)' }}>Equation Log</div>
            <div id="logPanel" className="log-panel">
                {logs.length === 0 ? (
                    <div style={{ color: '#666', fontStyle: 'italic' }}>Matches will appear here...</div>
                ) : (
                    logs.map((res, index) => {
                        const isRed = res.player === CONSTANTS.PLAYER_RED;
                        const colorStyle = isRed ? { color: CONSTANTS.COLOR_RED } : { color: CONSTANTS.COLOR_BLUE };

                        return (
                            <div key={index} className="log-entry">
                                <div className="log-eq" style={colorStyle}>{res.equation}</div>
                                <div style={{ color: '#000' }}>Δ = {res.delta} ({res.realRoots ? 'Real' : 'Complex'})</div>
                                <div className={res.realRoots ? 'log-good' : 'log-bad'} style={{ color: '#000' }}>
                                    {res.realRoots ? 'BOOM! Enemy Destroyed' : 'BACKFIRE! Friendly Fire'}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
};

export default LogPanel;
