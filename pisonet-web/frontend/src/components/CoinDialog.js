import React, { useEffect, useRef, useState } from 'react';
import './CoinDialog.css';

function CoinDialog({ unit, onInsertCoin, onClose }) {
  const dialogRef = useRef(null);
  const [customAmount, setCustomAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');

  const coinDenominations = [
    { value: 1, label: '₱1', emoji: '🪙' },
    { value: 5, label: '₱5', emoji: '🪙' },
    { value: 10, label: '₱10', emoji: '🪙' },
    { value: 20, label: '₱20', emoji: '💵' }
  ];

  useEffect(() => {
    // Click outside to close
    const handleClickOutside = (event) => {
      if (dialogRef.current && !dialogRef.current.contains(event.target)) {
        onClose();
      }
    };

    // ESC key to close
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const handleCoinInsert = async (amount) => {
    setIsLoading(true);
    setMessage('Processing...');
    try {
      await onInsertCoin(amount);
      setMessage(`✅ ₱${amount} inserted successfully!`);
      setTimeout(() => onClose(), 1500);
    } catch (err) {
      setMessage(`❌ Error: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCustomAmount = async () => {
    const amount = parseFloat(customAmount);
    if (!amount || amount <= 0) {
      setMessage('Please enter a valid amount');
      return;
    }
    await handleCoinInsert(amount);
  };

  return (
    <div className="dialog-overlay">
      <div className="dialog-content" ref={dialogRef}>
        <button className="dialog-close-btn" onClick={onClose}>×</button>

        <div className="dialog-header">
          <h2>Insert Coin - {unit.name}</h2>
          <p className="dialog-subtitle">Remaining Time: <strong>{Math.floor(unit.remaining_seconds / 60)}:{String(unit.remaining_seconds % 60).padStart(2, '0')}</strong></p>
          <p className="dialog-subtitle">Status: <strong className={`status-${unit.status.toLowerCase()}`}>{unit.status}</strong></p>
        </div>

        <div className="coin-animation">
          <div className="coin-slot">
            <div className="coin-slot-opening"></div>
            <div className="coin coin-1">💰</div>
            <div className="coin coin-2">💰</div>
            <div className="coin coin-3">💰</div>
            <div className="coin-box">💵</div>
          </div>
        </div>

        {message && (
          <div className={`message ${message.includes('✅') ? 'success' : message.includes('❌') ? 'error' : 'info'}`}>
            {message}
          </div>
        )}

        <div className="dialog-actions">
          <div className="standard-coins">
            <h3>Standard Denominations:</h3>
            <div className="coin-buttons">
              {coinDenominations.map((coin) => (
                <button 
                  key={coin.value}
                  className={`coin-btn coin-btn-${coin.value}`}
                  onClick={() => handleCoinInsert(coin.value)}
                  disabled={isLoading}
                  aria-label={`Insert ${coin.label}`}
                >
                  <span className="coin-emoji">{coin.emoji}</span>
                  <span className="coin-label">{coin.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="custom-amount">
            <h3>Custom Amount:</h3>
            <div className="custom-input-group">
              <span className="currency">₱</span>
              <input 
                type="number" 
                min="1" 
                step="1"
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                placeholder="Enter amount"
                disabled={isLoading}
                onKeyPress={(e) => e.key === 'Enter' && handleCustomAmount()}
              />
              <button 
                className="btn-custom-submit"
                onClick={handleCustomAmount}
                disabled={isLoading || !customAmount}
              >
                {isLoading ? 'Processing...' : 'Insert'}
              </button>
            </div>
          </div>

          <div className="info-text">
            <p>💡 Tip: 1 Peso = 1 minute of browsing time</p>
            <p>ℹ️ Press ESC to close this dialog</p>
          </div>

          <button className="btn-cancel" onClick={onClose} disabled={isLoading}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default CoinDialog;
