let timeLeft = 0; // in seconds
function updateTimer() {
    const m = String(Math.floor(timeLeft/60)).padStart(2,'0');
    const s = String(timeLeft%60).padStart(2,'0');
    document.getElementById('timer').innerText = `${m}:${s}`;
}
setInterval(() => { if(timeLeft>0){timeLeft--; updateTimer();} }, 1000);