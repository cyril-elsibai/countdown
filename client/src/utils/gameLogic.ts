export const cardDeck = [
  1,2,3,4,5,6,7,8,9,10,
  1,2,3,4,5,6,7,8,9,10,
  25,50,75,100
];

export function getRandomInt(max: number) {
  return Math.floor(Math.random() * max);
}

export function generateTarget() {
  return getRandomInt(900) + 100;
}

export function calculateRow(num1: number, num2: number, operator: string): { ok: boolean; result?: number; error?: string } {
  let res = 0;
  switch (operator) {
    case '+': res = num1 + num2; break;
    case '-':
      if (num2 >= num1) return { ok: false, error: 'Result must be positive' };
      res = num1 - num2;
      break;
    case 'x': res = num1 * num2; break;
    case '/':
      if (num2 === 0) return { ok: false, error: 'Division by zero' };
      res = num1 / num2;
      if (!Number.isInteger(res)) return { ok: false, error: 'Result must be integer' };
      break;
    default:
      return { ok: false, error: 'Invalid operator' };
  }
  return { ok: true, result: res };
}
