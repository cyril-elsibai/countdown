export default function Board() {
return (
<div className="grid grid-cols-10 gap-2 justify-center mt-6">
{[...Array(30)].map((_, i) => (
<div key={i} className="border border-yellow-600 w-12 h-12 flex items-center justify-center text-lg font-bold">
</div>
))}
</div>
);
}