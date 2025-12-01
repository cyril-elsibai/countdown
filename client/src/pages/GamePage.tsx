import { useState, useEffect } from 'react';
import Header from '../components/Header';
import Board from '../components/Board';
import Keyboard from '../components/Keyboard';
import Timer from '../components/Timer';
import VictoryModal from '../components/VictoryModal';
import { generateTarget, drawCards } from '../utils/gameLogic';


export default function GamePage() {
const [target, setTarget] = useState(0);
const [cards, setCards] = useState<number[]>([]);
const [isGameOver, setGameOver] = useState(false);
const [bestResult, setBestResult] = useState<number | null>(null);


useEffect(() => {
setTarget(generateTarget());
setCards(drawCards());
}, []);


const handleWin = (result: number) => {
setBestResult(result);
setGameOver(true);
};


return (
<div className="flex flex-col items-center h-screen">
<Header target={target} />
<Timer seconds={30} onTimeout={() => setGameOver(true)} />
<Board />
<Keyboard cards={cards} onWin={handleWin} />
{isGameOver && <VictoryModal result={bestResult} onRestart={() => window.location.reload()} />}
</div>
);
}