with open('src/CalendarModule.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

bad = """              return (
                <div
                  key={node.id}
                  className={`absolute rounded-full flex flex-col items-center justify-center text-center border border-white/30 shadow-[0_0_20px_rgba(0,0,0,0.35)] ${node.colorClass}`}
                  style={{"""

good = """              const isSelected = filterSefira === node.id;
              const isOtherSelected = filterSefira !== null && !isSelected;

              return (
                <div
                  key={node.id}
                  onClick={() => setFilterSefira(prev => (prev === node.id ? null : node.id))}
                  className={`absolute rounded-full flex flex-col items-center justify-center text-center border border-white/30 cursor-pointer transition-all hover:scale-105 z-10 shadow-[0_0_20px_rgba(0,0,0,0.35)] ${node.colorClass} ${isSelected ? 'ring-4 ring-amber-300 scale-[1.10]' : ''} ${isOtherSelected ? 'opacity-40' : 'opacity-90'}`}
                  style={{"""

t2 = text.replace(bad, good)
if t2 != text:
    print('replaced successfully')
    with open('src/CalendarModule.tsx', 'w', encoding='utf-8') as f:
        f.write(t2)
else:
    print('not replaced')
