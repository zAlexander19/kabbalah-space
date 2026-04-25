
import re

with open('src/CalendarModule.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

old_node = re.compile(
    r'\{sefirot\.map\(\(node\) => \{\s+const item = volumeMap\[node\.id\];\s+const activityCount = item\?\.actividades_total \?\? 0;\s+const scale = activityCount / maxActivityCount;\s+const size = 52 \+ scale \* 38;\s+return \(\s+<div\s+key=\{node\.id\}\s+className=\{[^}]+?\}\s+style=\{\{',
    re.MULTILINE
)

def repl(m):
    return '''{sefirot.map((node) => {
              const item = volumeMap[node.id];
              const activityCount = item?.actividades_total ?? 0;
              const scale = activityCount / maxActivityCount;
              const size = 52 + scale * 38;
              const isSelected = filterSefira === node.id;
              const isOtherSelected = filterSefira !== null && !isSelected;
              return (
                <div
                  key={node.id}
                  onClick={() => setFilterSefira(prev => prev === node.id ? null : node.id)}
                  className={bsolute rounded-full flex flex-col items-center justify-center text-center border border-white/30 shadow-[0_0_20px_rgba(0,0,0,0.35)]  cursor-pointer transition-transform hover:scale-105  }
                  style={{'''

text, count = old_node.subn(repl, text)

print(f'Replaced {count} times')

with open('src/CalendarModule.tsx', 'w', encoding='utf-8') as f:
    f.write(text)

