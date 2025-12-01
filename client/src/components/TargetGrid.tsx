export default function TargetGrid({ target }: { target: number }) {
  const hundreds = Math.floor(target / 100);
  const dozens = Math.floor((target - hundreds * 100) / 10);
  const units = target % 10;

  return (
    <div data-target-grid className="tile-grid target-grid">
      <div className="tile target-tile">{hundreds}</div>
      <div className="tile target-tile">{dozens}</div>
      <div className="tile target-tile">{units}</div>
    </div>
  );
}
