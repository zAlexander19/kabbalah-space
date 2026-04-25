
import re

with open('src/CalendarModule.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

bad = r'return \(\s*<div\s*key=\{node\.id\}\s*className=\{bsolute rounded\-full flex flex\-col items\-center\\njustify\-center text\-center border border\-white/30\\nshadow-\[0_0_20px_rgba\(0\,0\,0\,0\.35\)\] \$\{node\.colorClass\}\}\s*style=\{\{'

good = r'''              const isSelected = filterSefira === node.id;
              const isOtherSelected = filterSefira !== null && !isSelected;

              return (
                <div
                  key={node.id}
                  onClick={() => setFilterSefira(prev => prev === node.id ? null : node.id)}
                  className={bsolute rounded-full flex flex-col items-center justify-center text-center border border-white/30 cursor-pointer transition-all hover:scale-105 z-10 shadow-[0_0_20px_rgba(0,0,0,0.35)]   }
                  style={{'''

new_text = re.sub(bad, good, text)

with open('src/CalendarModule.tsx', 'w', encoding='utf-8') as f:
    f.write(new_text)

