import { useCountdown } from '../hooks/useCountdown';


export default function Timer({ seconds, onTimeout }: { seconds: number, onTimeout: () => void }) {
const timeLeft = useCountdown(seconds, onTimeout);
return <div className="text-2xl font-bold mt-4">⏱ {timeLeft}s</div>;
}