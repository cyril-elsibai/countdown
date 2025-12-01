import { useEffect, useState } from 'react';


export function useCountdown(seconds: number, onEnd: () => void) {
const [timeLeft, setTimeLeft] = useState(seconds);


useEffect(() => {
if (timeLeft <= 0) {
onEnd();
return;
}
const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
return () => clearTimeout(timer);
}, [timeLeft]);


return timeLeft;
}